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
};

export async function fetchHtml(
  url: string,
  deps?: FetchHtmlDeps,
): Promise<string> {
  const isAllowedUrl = deps?.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  let isFirstValidation = true;

  return fetchTextWithValidatedRedirects(
    {
      url,
      maxRedirects: 3,
      timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
      maxContentLengthBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
      headers: {
        "User-Agent": CONFIG.FEED_REQUEST_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
      },
      assertAllowedUrl: async (candidateUrl) => {
        if (!(await isAllowedUrl(candidateUrl))) {
          throw new Error(
            isFirstValidation ? "Blocked URL" : "Blocked redirect target",
          );
        }
        isFirstValidation = false;
      },
    },
    { axiosGetFn: deps?.axiosGetFn },
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
  warnFn?: typeof logger.warn;
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
  const warn = deps?.warnFn ?? logger.warn.bind(logger);

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

    const html = await fetchArticleHtml(articleUrl);
    const extracted = await extractArticle(html, articleUrl, {
      contentLengthThreshold: 120,
    });

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

    return NextResponse.json({
      content,
      title: extracted?.title ?? null,
      source: extracted?.source ?? null,
    });
  } catch (error) {
    const safeArticleUrl = articleUrl ? redactUrlForLogs(articleUrl) : null;
    const urlSuffix = safeArticleUrl ? ` for ${safeArticleUrl}` : "";

    if (isAxiosError(error)) {
      const upstreamStatus = error.response?.status;
      const status =
        typeof upstreamStatus === "number" && upstreamStatus >= 400
          ? upstreamStatus
          : 502;
      const label = status === 502 ? "Bad Gateway" : "Upstream Error";
      warn(
        `Returning ${status} ${label} — article extract upstream request failed${urlSuffix}: ${toMessage(error)}`,
      );
      return toJsonError(
        status === 502
          ? ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE
          : ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE,
        status,
      );
    }

    warn(
      `Returning 502 Bad Gateway — article extract upstream processing failed${urlSuffix}: ${toMessage(error)}`,
    );
    return respondError("Article extract error", error, {
      status: 502,
      publicMessage: ARTICLE_EXTRACTION_ERROR_MESSAGE,
    });
  }
}
