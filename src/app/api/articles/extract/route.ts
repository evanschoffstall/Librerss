import { parseJsonBodyOrResponse } from "@/lib/api/request";
import {
  logAndRespondError,
  requireMutableAuthenticatedUser,
} from "@/lib/api/request-guards";
import { jsonError } from "@/lib/api/responses";
import { CONFIG } from "@/lib/config";
import {
  isAllowedFeedUrl,
  PUBLIC_FEED_URL_ERROR,
} from "@/lib/core/feed-fetcher";
import { fetchTextWithValidatedRedirects } from "@/lib/core/upstream-http";
import { toErrorMessage } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import {
  normalizeArticleHtmlSpacing,
  sanitizeArticleHtml,
  toPlainText,
} from "@/lib/utils/sanitize";
import { redactUrlForLogs, tryGetUrlHostname } from "@/lib/utils/url";
import { extractFromHtml } from "@extractus/article-extractor";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE =
  "Failed to fetch article content from upstream";
const ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE = "Upstream request failed";
const ARTICLE_EXTRACTION_ERROR_MESSAGE = "Failed to extract article content";
const ARTICLE_EXTRACT_CACHE_TTL_MS = 10 * 60 * 1000;
const ARTICLE_EXTRACT_CACHE_MAX_ENTRIES = 500;

const VERBOSE_LOG_LEVEL = "verbose";
const SAFE_UPSTREAM_RESPONSE_HEADERS = [
  "server",
  "cf-ray",
  "cf-cache-status",
  "x-cache",
  "x-served-by",
  "retry-after",
  "content-type",
  "content-length",
  "x-datadome",
] as const;

const SAFE_UPSTREAM_REQUEST_HEADERS = [
  "user-agent",
  "accept",
  "accept-language",
  "accept-encoding",
  "referer",
  "cache-control",
] as const;

type ExtractResponsePayload = {
  content: string;
  title: string | null;
  source: string | null;
};

type CachedExtractResponse = {
  expiresAt: number;
  payload: ExtractResponsePayload;
};

const articleExtractCache = new Map<string, CachedExtractResponse>();

function isExtractCacheEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test"
  );
}

function getCachedExtractPayload(url: string): ExtractResponsePayload | null {
  const cached = articleExtractCache.get(url);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    articleExtractCache.delete(url);
    return null;
  }

  return cached.payload;
}

function setCachedExtractPayload(
  url: string,
  payload: ExtractResponsePayload,
): void {
  if (articleExtractCache.size >= ARTICLE_EXTRACT_CACHE_MAX_ENTRIES) {
    const oldestKey = articleExtractCache.keys().next().value;
    if (typeof oldestKey === "string") {
      articleExtractCache.delete(oldestKey);
    }
  }

  articleExtractCache.set(url, {
    expiresAt: Date.now() + ARTICLE_EXTRACT_CACHE_TTL_MS,
    payload,
  });
}

export function clearArticleExtractCacheForTests(): void {
  articleExtractCache.clear();
}

function isVerboseLoggingEnabled(): boolean {
  const envLevel = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (envLevel) return envLevel === VERBOSE_LOG_LEVEL;

  try {
    return CONFIG.LOG_LEVEL === VERBOSE_LOG_LEVEL;
  } catch {
    return false;
  }
}

function toHeaderRecord(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object") {
    return {};
  }

  const entries = Object.entries(headers as Record<string, unknown>);
  return entries.reduce<Record<string, string>>((acc, [rawName, rawValue]) => {
    const key = rawName.toLowerCase();
    if (typeof rawValue === "string") {
      acc[key] = rawValue;
      return acc;
    }

    if (Array.isArray(rawValue)) {
      acc[key] = rawValue.map((v) => String(v)).join(", ");
      return acc;
    }

    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      acc[key] = String(rawValue);
    }

    return acc;
  }, {});
}

function pickAllowedHeaders(
  headers: unknown,
  allowed: readonly string[],
): Record<string, string> {
  const normalized = toHeaderRecord(headers);
  return allowed.reduce<Record<string, string>>((acc, headerName) => {
    const value = normalized[headerName];
    if (typeof value === "string" && value.trim()) {
      acc[headerName] = value;
    }
    return acc;
  }, {});
}

function toBodySnippet(data: unknown, maxLength = 240): string | undefined {
  if (typeof data === "string") {
    const compact = data.replace(/\s+/g, " ").trim();
    if (!compact) return undefined;
    return compact.length > maxLength
      ? `${compact.slice(0, maxLength)}…`
      : compact;
  }

  if (
    data &&
    typeof data === "object" &&
    "toString" in data &&
    typeof (data as { toString: unknown }).toString === "function"
  ) {
    const text = String((data as { toString: () => string }).toString());
    const compact = text.replace(/\s+/g, " ").trim();
    if (!compact || compact === "[object Object]") return undefined;
    return compact.length > maxLength
      ? `${compact.slice(0, maxLength)}…`
      : compact;
  }

  return undefined;
}

function buildAxiosFailureDiagnostics(
  error: unknown,
  isAxiosErrorFn: typeof axios.isAxiosError,
): Record<string, unknown> {
  if (!isAxiosErrorFn(error)) return {};

  const requestHeaders = pickAllowedHeaders(
    error.config?.headers,
    SAFE_UPSTREAM_REQUEST_HEADERS,
  );
  const responseHeaders = pickAllowedHeaders(
    error.response?.headers,
    SAFE_UPSTREAM_RESPONSE_HEADERS,
  );

  return {
    upstreamStatus: error.response?.status ?? null,
    upstreamStatusText: error.response?.statusText ?? null,
    upstreamMethod: error.config?.method?.toUpperCase() ?? null,
    upstreamUrl: error.config?.url ?? null,
    requestTimeoutMs:
      typeof error.config?.timeout === "number" ? error.config.timeout : null,
    requestMaxRedirects:
      typeof error.config?.maxRedirects === "number"
        ? error.config.maxRedirects
        : null,
    requestHeaders,
    responseHeaders,
    responseBodySnippet: toBodySnippet(error.response?.data),
    axiosErrorCode: error.code ?? null,
  };
}

// ─── URL validation ───────────────────────────────────────────────────────────

type ParseArticleUrlDeps = {
  parseJsonBodyOrResponseFn?: typeof parseJsonBodyOrResponse;
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  jsonErrorFn?: typeof jsonError;
};

export async function parseAndValidateArticleUrl(
  request: NextRequest,
  deps?: ParseArticleUrlDeps,
): Promise<string | Response> {
  const parseJson = deps?.parseJsonBodyOrResponseFn ?? parseJsonBodyOrResponse;
  const isAllowedUrl = deps?.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  const toJsonError = deps?.jsonErrorFn ?? jsonError;

  const payloadOrResponse = await parseJson<{ url?: string }>(request);
  if (payloadOrResponse instanceof Response) return payloadOrResponse;

  const articleUrl = payloadOrResponse.url?.trim() ?? "";
  if (!articleUrl) return toJsonError("Article URL is required", 400);
  if (!(await isAllowedUrl(articleUrl)))
    return toJsonError(PUBLIC_FEED_URL_ERROR, 400);

  // Strip the URL fragment before making any upstream request. Fragments are
  // client-side navigation hints and must not be sent in HTTP requests — RFC
  // 3986 §3.5. Some CDNs and reverse proxies (e.g. Cloudflare, Akamai) treat
  // a request URL containing a raw fragment as malformed and return 403/400.
  // Article links from RSS feeds frequently contain anchors (#comments, etc.).
  try {
    const parsed = new URL(articleUrl);
    if (parsed.hash) {
      parsed.hash = "";
      return parsed.toString();
    }
  } catch {
    // URL already validated above — this branch is unreachable in practice.
  }

  return articleUrl;
}

// ─── HTML transformation helpers ─────────────────────────────────────────────

export function toParagraphHtml(raw: string): string {
  return raw
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => `<p>${segment.replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

export const normalizeExtractedHtmlSpacing = normalizeArticleHtmlSpacing;

function recoverSanitizedImageHtml(rawHtml: string): string {
  const imgTags = rawHtml.match(/<img\b[^>]*>/gi) ?? [];
  if (imgTags.length === 0) return "";

  const recovered = imgTags
    .map((tag) => sanitizeArticleHtml(tag).trim())
    .filter((tag) => /<img\b/i.test(tag));

  return recovered.join("\n");
}

export function sanitizeExtractedContent(rawContent: string): string {
  const normalized = rawContent.trim();
  if (!normalized) return "";

  const containsHtml = /<\/?[a-z][\s\S]*>/i.test(normalized);
  const htmlCandidate = containsHtml ? normalized : toParagraphHtml(normalized);
  const sanitized = sanitizeArticleHtml(htmlCandidate);
  const recoveredImageHtml = containsHtml
    ? recoverSanitizedImageHtml(htmlCandidate)
    : "";
  const recoveredImageCount = (recoveredImageHtml.match(/<img\b/gi) ?? [])
    .length;

  if (sanitized.trim()) {
    if (
      recoveredImageCount === 1 &&
      recoveredImageHtml &&
      !/<img\b/i.test(sanitized)
    ) {
      return normalizeExtractedHtmlSpacing(
        [recoveredImageHtml, sanitized].filter(Boolean).join("\n"),
      );
    }

    return sanitized;
  }

  const plainText = containsHtml ? toPlainText(normalized) : normalized;
  if (!plainText.trim()) return "";

  const fallbackSanitized = sanitizeArticleHtml(toParagraphHtml(plainText));

  if (
    recoveredImageCount === 1 &&
    recoveredImageHtml &&
    !/<img\b/i.test(fallbackSanitized)
  ) {
    return normalizeExtractedHtmlSpacing(
      [recoveredImageHtml, fallbackSanitized].filter(Boolean).join("\n"),
    );
  }

  return fallbackSanitized;
}

export function getHostname(url: string): string {
  return tryGetUrlHostname(url) ?? "";
}

// ─── Daily Kos boilerplate cleanup ───────────────────────────────────────────

export function stripKnownDailyKosBoilerplate(content: string): string {
  return content
    .replace(/<section>[\s\S]*?©\s*Kos\s+Media[\s\S]*?<\/section>/gi, "")
    .replace(/<p>\s*Daily\s+Kos\s*<\/p>\s*<ul>[\s\S]*?<\/ul>/gi, "")
    .replace(/<p>\s*About\s*<\/p>\s*<ul>[\s\S]*?<\/ul>/gi, "")
    .replace(/<p>\s*<strong>\s*Related\s*\|[\s\S]*?<\/p>/gi, "")
    .replace(
      /<p>\s*<a[^>]*href="https?:\/\/(?:www\.)?dailykos\.com\/blacklivesmatter\/?"[^>]*>\s*<img[\s\S]*?<\/a>\s*<\/p>[\s\S]*?Learn\s+More[\s\S]*?<\/a>/gi,
      "",
    )
    .trim();
}

export function isLikelyDailyKosFooterBoilerplate(content: string): boolean {
  const lower = content.toLowerCase();
  const markerHits = [
    "© kos media",
    "front page",
    "comics",
    "subscribe",
    "gift subscriptions",
    "privacy",
    "masthead",
    "rules of the road",
  ].filter((marker) => lower.includes(marker)).length;

  const linkCount = (content.match(/<a\b/gi) ?? []).length;
  const listItemCount = (content.match(/<li\b/gi) ?? []).length;

  return markerHits >= 3 && linkCount >= 6 && listItemCount >= 4;
}

export function hasDailyKosStoryImage(content: string): boolean {
  return /<img\b[^>]*src="https?:\/\/cdn\.prod\.dailykos\.com\/images\//i.test(
    content,
  );
}

export function hasReadableArticleBody(content: string): boolean {
  const blockElementCount = (
    content.match(/<(?:p|h[1-6]|blockquote|ul|ol)\b/gi) ?? []
  ).length;
  if (blockElementCount >= 2) return true;

  const plainTextLength = toPlainText(content)
    .replace(/\s+/g, " ")
    .trim().length;
  return plainTextLength >= 280;
}

function extractDivInnerHtmlByClass(
  rawHtml: string,
  className: string,
): string {
  const escapedClass = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startTagPattern = new RegExp(
    `<div[^>]*class=("|')[^"']*\\b${escapedClass}\\b[^"']*\\1[^>]*>`,
    "gi",
  );

  let bestMatch = "";

  for (
    let startMatch = startTagPattern.exec(rawHtml);
    startMatch;
    startMatch = startTagPattern.exec(rawHtml)
  ) {
    if (startMatch.index < 0) continue;

    const startTagIndex = startMatch.index;
    const startTag = startMatch[0];
    const contentStart = startTagIndex + startTag.length;

    const divTagPattern = /<\/?div\b[^>]*>/gi;
    divTagPattern.lastIndex = contentStart;

    let depth = 1;
    let endIndex = -1;

    for (
      let next = divTagPattern.exec(rawHtml);
      next;
      next = divTagPattern.exec(rawHtml)
    ) {
      const tag = next[0];
      const isClosingTag = /^<\/div\b/i.test(tag);
      depth += isClosingTag ? -1 : 1;

      if (depth === 0) {
        endIndex = next.index;
        break;
      }
    }

    if (endIndex < 0) continue;

    const candidate = rawHtml.slice(contentStart, endIndex).trim();
    if (candidate.length > bestMatch.length) {
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

export function extractDailyKosStoryFallbackHtml(rawHtml: string): string {
  const figureMatch = rawHtml.match(
    /<figure>[\s\S]*?<img\b[\s\S]*?<\/figure>/i,
  );

  const figureHtml = figureMatch?.[0] ?? "";
  const storyTextHtml = extractDivInnerHtmlByClass(rawHtml, "story__text")
    .replace(/<p>\s*<strong>\s*Related\s*\|[\s\S]*?<\/p>/gi, "")
    .replace(/<hr\b[^>]*>/gi, "");

  return [figureHtml, storyTextHtml].filter(Boolean).join("\n").trim();
}

export function cleanExtractedArticleHtml(
  sanitizedContent: string,
  articleUrl: string,
): string {
  if (!sanitizedContent.trim()) return "";

  if (!getHostname(articleUrl).endsWith("dailykos.com")) {
    return sanitizedContent;
  }

  const stripped = stripKnownDailyKosBoilerplate(sanitizedContent);
  if (!stripped) return "";

  return isLikelyDailyKosFooterBoilerplate(stripped) ? "" : stripped;
}

// ─── Upstream HTML fetch ──────────────────────────────────────────────────────

type FetchHtmlDeps = {
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  axiosGetFn?: typeof axios.get;
  isAxiosErrorFn?: typeof axios.isAxiosError;
};

// sec-ch-ua values must stay in sync with ARTICLE_EXTRACT_USER_AGENT (Chrome 130).
const ARTICLE_EXTRACT_SEC_CH_UA =
  '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';

export async function fetchHtml(
  url: string,
  deps?: FetchHtmlDeps,
): Promise<string> {
  const isAllowedUrl = deps?.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;
  let isFirstValidation = true;

  // Derive a Referer from the article's own origin so the request looks like an
  // in-site navigation (e.g. user clicked an article link from the homepage).
  // Anti-bot systems (Cloudflare, DataDome, PerimeterX) treat an absent Referer
  // on a document navigation as a strong bot signal; a same-origin Referer is
  // cheap to add and dramatically reduces false-positive 403s.
  let referer: string | undefined;
  try {
    const u = new URL(url);
    referer = `${u.protocol}//${u.host}/`;
  } catch {
    // Unparseable URL — assertAllowedUrl will surface the real error.
  }

  return fetchTextWithValidatedRedirects(
    {
      url,
      // 5 hops matches feed fetching. Article URLs from RSS often route through
      // tracking redirectors (feedproxy, dlvr.it, etc.) before reaching origin.
      maxRedirects: 5,
      timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
      maxContentLengthBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
      headers: {
        "User-Agent": CONFIG.ARTICLE_EXTRACT_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "max-age=0",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        // same-origin when we have a referer (looks like a link-click within
        // the site); none only when we genuinely cannot derive an origin.
        "Sec-Fetch-Site": referer ? "same-origin" : "none",
        "Sec-Fetch-User": "?1",
        // Client Hints — Chrome always sends these alongside its UA string.
        // Absence of sec-ch-ua with a Chrome UA is itself a bot signal.
        "sec-ch-ua": ARTICLE_EXTRACT_SEC_CH_UA,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        // Navigation priority hint sent by Chrome on document fetches.
        Priority: "u=0, i",
        ...(referer ? { Referer: referer } : {}),
      },
      assertAllowedUrl: async (candidateUrl) => {
        if (!(await isAllowedUrl(candidateUrl))) {
          throw new Error(
            isFirstValidation ? "Blocked URL" : "Blocked redirect target",
          );
        }
        isFirstValidation = false;
      },
      onAxiosError: (error, isAxios) => {
        if (!isAxios(error)) return;
        const status = error.response?.status;
        const dataDomeHeader = String(
          error.response?.headers?.["x-datadome"] ?? "",
        ).toLowerCase();
        if (status === 403 && dataDomeHeader === "protected") {
          throw new Error(
            "Upstream blocked request with anti-bot protection (DataDome) [HTTP 403]",
          );
        }
      },
    },
    { axiosGetFn: deps?.axiosGetFn, isAxiosErrorFn: isAxiosError },
  );
}

// ─── POST handler ─────────────────────────────────────────────────────────────

type ExtractPostDeps = {
  requireMutableAuthenticatedUserFn?: typeof requireMutableAuthenticatedUser;
  parseAndValidateArticleUrlFn?: typeof parseAndValidateArticleUrl;
  fetchHtmlFn?: typeof fetchHtml;
  extractFromHtmlFn?: typeof extractFromHtml;
  sanitizeExtractedContentFn?: typeof sanitizeExtractedContent;
  cleanExtractedArticleHtmlFn?: typeof cleanExtractedArticleHtml;
  getHostnameFn?: typeof getHostname;
  hasDailyKosStoryImageFn?: typeof hasDailyKosStoryImage;
  extractDailyKosStoryFallbackHtmlFn?: typeof extractDailyKosStoryFallbackHtml;
  jsonErrorFn?: typeof jsonError;
  toErrorMessageFn?: typeof toErrorMessage;
  logAndRespondErrorFn?: typeof logAndRespondError;
  isAxiosErrorFn?: typeof axios.isAxiosError;
  infoFn?: typeof logger.info;
  warnFn?: typeof logger.warn;
  shouldUseExtractCacheFn?: () => boolean;
};

export async function POST(request: NextRequest, deps?: ExtractPostDeps) {
  const requireAuth =
    deps?.requireMutableAuthenticatedUserFn ?? requireMutableAuthenticatedUser;
  const parseArticleUrl =
    deps?.parseAndValidateArticleUrlFn ?? parseAndValidateArticleUrl;
  const fetchArticleHtml = deps?.fetchHtmlFn ?? fetchHtml;
  const extractArticle = deps?.extractFromHtmlFn ?? extractFromHtml;
  const sanitizeContent =
    deps?.sanitizeExtractedContentFn ?? sanitizeExtractedContent;
  const cleanContent =
    deps?.cleanExtractedArticleHtmlFn ?? cleanExtractedArticleHtml;
  const hostnameOf = deps?.getHostnameFn ?? getHostname;
  const hasStoryImage = deps?.hasDailyKosStoryImageFn ?? hasDailyKosStoryImage;
  const extractFallback =
    deps?.extractDailyKosStoryFallbackHtmlFn ??
    extractDailyKosStoryFallbackHtml;
  const toJsonError = deps?.jsonErrorFn ?? jsonError;
  const toMessage = deps?.toErrorMessageFn ?? toErrorMessage;
  const respondError = deps?.logAndRespondErrorFn ?? logAndRespondError;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;
  const info = deps?.infoFn ?? logger.info.bind(logger);
  const warn = deps?.warnFn ?? logger.warn.bind(logger);
  const shouldUseCache = deps?.shouldUseExtractCacheFn ?? isExtractCacheEnabled;
  const verboseLoggingEnabled = isVerboseLoggingEnabled();
  const extractAttemptId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const requestHeaders =
    request && typeof request === "object" && "headers" in request
      ? (request as { headers?: Headers }).headers
      : undefined;
  const requestId =
    requestHeaders?.get("x-request-id") ??
    requestHeaders?.get("x-correlation-id") ??
    null;

  let articleUrl: string | null = null;

  try {
    const authResult = await requireAuth(request, {
      rateLimit: {
        key: "article-extract",
        windowMs: CONFIG.RATE_LIMIT_EXTRACT_WINDOW_MS,
        maxAttempts: CONFIG.RATE_LIMIT_EXTRACT_MAX_REQUESTS,
        scope: "user",
      },
    });
    if (authResult instanceof Response) return authResult;

    const parsedUrl = await parseArticleUrl(request);
    if (parsedUrl instanceof Response) return parsedUrl;
    articleUrl = parsedUrl;

    const safeUrl = redactUrlForLogs(articleUrl);
    info(`Article extract started`, {
      url: safeUrl,
      extractAttemptId,
      requestId,
    });

    if (shouldUseCache()) {
      const cachedPayload = getCachedExtractPayload(articleUrl);
      if (cachedPayload) {
        info(`Article extract cache hit`, {
          url: safeUrl,
          extractAttemptId,
          requestId,
        });
        return NextResponse.json(cachedPayload);
      }
    }

    const html = await fetchArticleHtml(articleUrl);
    info(`Article HTML fetched`, { url: safeUrl, bytes: html.length });

    const extracted = await extractArticle(html, articleUrl, {
      contentLengthThreshold: 120,
    });

    if (
      !extracted ||
      (!extracted.content?.trim() && !extracted.description?.trim())
    ) {
      warn(`Article extractor returned no content`, { url: safeUrl });
    }

    const rawContent =
      extracted?.content?.trim() || extracted?.description?.trim() || "";
    const sanitizedContent = sanitizeContent(rawContent);
    let content = cleanContent(sanitizedContent, articleUrl);

    if (
      hostnameOf(articleUrl).endsWith("dailykos.com") &&
      (!hasStoryImage(content) || !hasReadableArticleBody(content))
    ) {
      const fallbackContent = cleanContent(
        sanitizeContent(extractFallback(html)),
        articleUrl,
      );
      if (
        hasStoryImage(fallbackContent) ||
        hasReadableArticleBody(fallbackContent) ||
        !content.trim()
      ) {
        content = fallbackContent;
      }
    }

    if (!content.trim()) {
      warn(`Article content empty after full extraction pipeline`, {
        url: safeUrl,
      });
    } else {
      info(`Article extract completed`, {
        url: safeUrl,
        contentLength: content.length,
        hasTitle: !!extracted?.title,
      });
    }

    const payload: ExtractResponsePayload = {
      content,
      title: extracted?.title ?? null,
      source: extracted?.source ?? null,
    };

    if (shouldUseCache()) {
      setCachedExtractPayload(articleUrl, payload);
    }

    return NextResponse.json(payload);
  } catch (error) {
    const safeArticleUrl = articleUrl ? redactUrlForLogs(articleUrl) : null;
    const urlSuffix = safeArticleUrl ? ` for ${safeArticleUrl}` : "";

    if (isAxiosError(error)) {
      const upstreamStatus = error.response?.status;
      // Never mirror upstream 4xx/5xx back as our own status — upstream refusing
      // our server request (e.g. 403) is not the client's fault. Map to 502 for
      // all upstream errors, with the exception of 404 which maps to 422 since
      // the article URL the client supplied simply doesn't exist upstream.
      const status =
        typeof upstreamStatus === "number" && upstreamStatus === 404
          ? 422
          : 502;
      const label = status === 502 ? "Bad Gateway" : "Unprocessable Content";
      warn(
        `Returning ${status} ${label} — article extract upstream request failed (upstream ${upstreamStatus ?? "no response"})${urlSuffix}: ${toMessage(error)}`,
        {
          url: safeArticleUrl,
          extractAttemptId,
          requestId,
          ...(verboseLoggingEnabled
            ? buildAxiosFailureDiagnostics(error, isAxiosError)
            : {}),
        },
      );
      return toJsonError(
        status === 422
          ? ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE
          : ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE,
        status,
      );
    }

    warn(
      `Returning 502 Bad Gateway — article extract upstream processing failed${urlSuffix}: ${toMessage(error)}`,
      {
        url: safeArticleUrl,
        extractAttemptId,
        requestId,
      },
    );
    return respondError("Article extract error", error, {
      status: 502,
      publicMessage: ARTICLE_EXTRACTION_ERROR_MESSAGE,
    });
  }
}
