import { parseJsonBodyOrResponse } from "@/lib/api/request";
import {
  logAndRespondError,
  requireMutablePublicRequest,
} from "@/lib/api/request-guards";
import { jsonError } from "@/lib/api/responses";
import { CONFIG } from "@/lib/config";
import {
  isAllowedFeedUrl,
  PUBLIC_FEED_URL_ERROR,
} from "@/lib/core/feed-fetcher";
import { getPlaceholderSnapshotPathByArticleUrl } from "@/lib/core/placeholder";
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
import { wrapper as cookieJarWrapper } from "axios-cookiejar-support";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CookieJar } from "tough-cookie";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE =
  "Failed to fetch article content from upstream";
const ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE = "Upstream request failed";
const ARTICLE_EXTRACTION_ERROR_MESSAGE = "Failed to extract article content";
const ARTICLE_EXTRACT_CACHE_TTL_MS = 10 * 60 * 1000;
const ARTICLE_EXTRACT_CACHE_MAX_ENTRIES = 500;
const BOOLEAN_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const BOOLEAN_FALSE_VALUES = new Set(["0", "false", "no", "off"]);

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

function readBooleanEnvFlag(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return defaultValue;

  const normalized = raw.trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalized)) return true;
  if (BOOLEAN_FALSE_VALUES.has(normalized)) return false;
  return defaultValue;
}

function isExtractCacheEnabled(): boolean {
  const cacheEnabled = readBooleanEnvFlag(
    "ARTICLE_EXTRACT_CACHE_ENABLED",
    true,
  );
  if (!cacheEnabled) return false;

  if (process.env.NODE_ENV === "development") {
    return readBooleanEnvFlag("ARTICLE_EXTRACT_CACHE_DEV_ENABLED", true);
  }

  return true;
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

type PlaceholderSnapshotHit = {
  html: string;
  snapshotPath: string;
};

async function readPlaceholderSnapshotHtml(
  url: string,
): Promise<PlaceholderSnapshotHit | null> {
  const snapshotPath = getPlaceholderSnapshotPathByArticleUrl(url);
  if (!snapshotPath) return null;

  const normalizedSnapshotPath = snapshotPath.replace(/^\/+/, "");
  const filePath = join(process.cwd(), "public", normalizedSnapshotPath);

  try {
    const html = await readFile(filePath, "utf8");
    return { html, snapshotPath: `/${normalizedSnapshotPath}` };
  } catch {
    return null;
  }
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

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readMetaTagContent(rawHtml: string, keys: string[]): string {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  const metaTags = rawHtml.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const attributes: Record<string, string> = {};

    for (const match of tag.matchAll(
      /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
    )) {
      const attributeName = match[1]?.toLowerCase();
      const attributeValue = (match[2] ?? match[3] ?? "").trim();
      if (!attributeName) continue;
      attributes[attributeName] = attributeValue;
    }

    const key = (attributes.property || attributes.name || "").toLowerCase();
    const content = attributes.content;
    if (!key || !content) continue;
    if (keySet.has(key)) return decodeBasicHtmlEntities(content);
  }

  return "";
}

export function buildMetadataImageFallbackHtml(rawHtml: string): string {
  const imageUrl = readMetaTagContent(rawHtml, [
    "og:image",
    "twitter:image",
    "twitter:image:src",
  ]).trim();

  if (!imageUrl) return "";

  // Include explicit dimensions when the publisher provides them via standard
  // Open Graph width/height meta tags.  Without at least one size signal the
  // sanitizer cannot verify the image is content-sized and will drop it.
  // Fall back to a srcset= pointing to the same URL — this is a valid single-
  // descriptor srcset and satisfies the "has sizeable signal" requirement while
  // accurately describing an image the publisher explicitly chose to feature.
  const ogWidth = readMetaTagContent(rawHtml, ["og:image:width"]).trim();
  const ogHeight = readMetaTagContent(rawHtml, ["og:image:height"]).trim();
  const widthAttr = ogWidth ? ` width="${escapeHtmlAttribute(ogWidth)}"` : "";
  const heightAttr = ogHeight
    ? ` height="${escapeHtmlAttribute(ogHeight)}"`
    : "";
  const srcsetAttr =
    !ogWidth && !ogHeight ? ` srcset="${escapeHtmlAttribute(imageUrl)}"` : "";

  const imageHtml = sanitizeArticleHtml(
    `<p><img src="${escapeHtmlAttribute(imageUrl)}" alt=""${widthAttr}${heightAttr}${srcsetAttr} /></p>`,
  );

  if (!/<img\b[^>]*\bsrc=/i.test(imageHtml)) return "";

  const description = readMetaTagContent(rawHtml, [
    "og:description",
    "twitter:description",
  ])
    .replace(/\s+/g, " ")
    .trim();

  if (!description) return imageHtml;

  const descriptionHtml = sanitizeArticleHtml(toParagraphHtml(description));

  return normalizeExtractedHtmlSpacing(
    [imageHtml, descriptionHtml].filter(Boolean).join("\n"),
  );
}

// ─── Pre-extraction HTML cleaning ────────────────────────────────────────────

/**
 * Remove the entire subtree of the first element whose `id` exactly matches
 * `idValue`.  Uses depth-counting so nested tags of the same type are handled
 * correctly.  Returns the original string when no match is found.
 */
function removeElementById(rawHtml: string, idValue: string): string {
  const escaped = idValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use ["'] bracket instead of a backreference — simpler and avoids group
  // numbering bugs. Attribute values in HTML are always quoted in practice.
  const startRe = new RegExp(
    `<([a-z][a-z0-9:-]*)\\b[^>]*\\bid=["']${escaped}["'][^>]*>`,
    "i",
  );

  const startMatch = startRe.exec(rawHtml);
  if (!startMatch) return rawHtml;

  const tagName = startMatch[1];
  if (!tagName) return rawHtml;
  const startIdx = startMatch.index;
  const afterOpenTag = startIdx + startMatch[0].length;

  const tagRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagRe.lastIndex = afterOpenTag;
  let depth = 1;
  let endIdx = -1;
  let m: RegExpExecArray | null;

  while (depth > 0 && (m = tagRe.exec(rawHtml)) !== null) {
    if (m[0].startsWith("</")) depth--;
    else depth++;
    if (depth === 0) endIdx = m.index + m[0].length;
  }

  if (endIdx < 0) return rawHtml;
  return rawHtml.slice(0, startIdx) + rawHtml.slice(endIdx);
}

/**
 * Strip known noise containers from raw article HTML **before** passing to the
 * content extractor.  This prevents the extractor from picking comment widgets,
 * paywall overlays, recirculation blocks, or site-chrome as the primary article
 * body.
 *
 * Background — why pre-cleaning is necessary:
 * `@extractus/article-extractor` uses `@mozilla/readability` under the hood.
 * Readability scores candidate nodes by text density rather than semantic role,
 * so large, link-heavy site-chrome elements routinely outscore the real article
 * body when the article markup is lightly structured.  Pre-cleaning removes
 * those high-density non-article nodes so Readability never sees them.
 *
 * Specific cases that drove each removal rule:
 *
 * `<header>` / `<footer>` — Sites with dense navigation or copyright footers
 * (dozens of nav links, social icons, tag lists) can produce a footer whose
 * raw link density exceeds the main article area.  Readability selected such
 * a footer as the primary content block in tested scenarios, returning site
 * navigation HTML instead of the article text.
 *
 * Pure-link `<ul>` lists — "Tag cloud" and hashtag panels rendered as
 * `<ul><li><a>…</a></li>…</ul>` accumulate link density rapidly.  When such
 * a panel appears in DOM order *before* the article body and contains 30+
 * items, Readability scores it above the article.  The panel then gets
 * correctly identified as boilerplate by `isLikelyNavFooterBoilerplate` and
 * discarded — leaving the pipeline with no content at all.
 *
 * Comment widgets / paywall overlays — Large interactive widgets injected near
 * the article end.  Some paywall scripts insert substantial visible text that
 * Readability can absorb into its candidate selection.
 *
 * `<aside data-nosnippet>` — Publisher-marked recirculation blocks.  The
 * `data-nosnippet` attribute is the canonical signal that a block must not
 * be treated as primary content.
 */
export function preCleanHtmlForExtraction(rawHtml: string): string {
  let html = rawHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove <header> and <footer> before extraction.
  //
  // Finding: Readability uses link-density scoring.  A site footer that
  // contains 30-50 nav/social/copyright links can score higher than an article
  // body of equal byte size, especially when the article uses minimal semantic
  // markup (e.g. bare divs instead of <article>/<p>).  In tested scenarios the
  // extractor returned the footer's navigation HTML as the "article", producing
  // hundreds of useless link characters instead of prose content.
  //
  // These are standard HTML5 sectioning elements whose purpose is unambiguous;
  // stripping them unconditionally is safe — they never contain article body.
  html = html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "");
  html = html.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "");

  // Known comment / engagement widget container ids.
  const idsToRemove = [
    "viafoura-comments",
    "viafoura-comments-container",
    "viafoura-comment-wrapper",
    "kiosq-app-paywall-js",
    "kiosq-app",
    "coral-display-comments",
    "comment-container",
    "mj-comments-container",
  ];

  for (const id of idsToRemove) {
    html = removeElementById(html, id);
  }

  // Remove "pure link lists" — <ul> blocks where every <li> contains only a
  // single <a> element with no surrounding text.  These are non-content
  // navigation constructs: tag clouds, hashtag panels, breadcrumb trees,
  // sidebar link collections.
  //
  // Finding: After footer removal, Readability selected a 30-item tag-cloud
  // <ul> that appeared ~3,800 bytes *before* the article body in DOM order.
  // Because every list item was a bare hyperlink the block had 100% link
  // density — the highest possible Readability score — so it was chosen as the
  // candidate node.  `isLikelyNavFooterBoilerplate` then correctly discarded
  // it, but that left the pipeline with zero content and forced a metadata-only
  // fallback (363 chars of og:description instead of the full article).
  //
  // The 8-item threshold is intentional: genuine article bullet lists may
  // consist entirely of hyperlinks (e.g. "Related reading" sections) but
  // rarely exceed 7-8 items.  Navigation clouds have 15-100+ items.
  html = html.replace(/<ul\b[^>]*>[\s\S]*?<\/ul>/gi, (ulBlock) => {
    const items = [...ulBlock.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
    if (items.length < 8) return ulBlock;
    const allPureLinks = items.every((m) =>
      /^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i.test((m[1] ?? "").trim()),
    );
    return allPureLinks ? "" : ulBlock;
  });

  // Remove <aside data-nosnippet> recirculation / promo blocks.
  html = html.replace(
    /<aside\b[^>]*\bdata-nosnippet\b[^>]*>[\s\S]*?<\/aside>/gi,
    "",
  );

  return html;
}

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
  // `section` is in nonTextTags so sanitize-html discards its children entirely.
  // The extractor often wraps content in <section> legitimately, so we strip
  // only the section open/close tags here (unwrap, not discard) before the
  // general sanitizer runs. This does not affect <aside> or <nav> which are
  // also nonTextTags and should still be discarded.
  const unwrapped = containsHtml
    ? normalized.replace(/<\/?section\b[^>]*>/gi, "")
    : normalized;
  const htmlCandidate = containsHtml ? unwrapped : toParagraphHtml(unwrapped);
  const sanitized = sanitizeArticleHtml(htmlCandidate);
  const recoveredImageHtml = containsHtml
    ? recoverSanitizedImageHtml(htmlCandidate)
    : "";
  const recoveredImageCount = (recoveredImageHtml.match(/<img\b/gi) ?? [])
    .length;

  if (sanitized.trim()) {
    if (
      recoveredImageCount > 0 &&
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
    recoveredImageCount > 0 &&
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

export function stripCommentEngagementBoilerplate(content: string): string {
  return content
    .replace(/<p\b[^>]*>([^<]{0,300})<\/p>/gi, (match, text: string) => {
      const lower = text.toLowerCase();
      const hasLoginSignal =
        /(log\s*(?:in|out)|sign\s*(?:in|out)|display\s*name|before\s+commenting|to\s+comment|must\s+confirm|will\s+be\s+prompted)/.test(
          lower,
        );
      return hasLoginSignal ? "" : match;
    })
    .trim();
}

/**
 * Returns true when the sanitized content looks like site navigation or footer
 * boilerplate rather than an article body.  Detection is purely heuristic:
 * it requires at least 2 known site-chrome keyword markers ("privacy",
 * "advertise", "subscribe", etc.) AND a high link + list-item density.  All
 * three conditions must hold to avoid false positives on article content that
 * legitimately mentions those words.
 */
export function isLikelyNavFooterBoilerplate(content: string): boolean {
  const lower = content.toLowerCase();
  const markerHits = [
    "privacy",
    "terms",
    "subscribe",
    "masthead",
    "copyright",
    "© ",
    "newsletter",
    "advertise",
    "contact",
    "sitemap",
    "rules of the road",
  ].filter((m) => lower.includes(m)).length;

  const linkCount = (content.match(/<a\b/gi) ?? []).length;
  const listItemCount = (content.match(/<li\b/gi) ?? []).length;

  // Require all three signals to fire together to avoid false positives.
  return markerHits >= 2 && linkCount >= 6 && listItemCount >= 4;
}

/**
 * Returns true when the content appears to contain a real article body worth
 * showing to the user.  Two independent signals are tried in order:
 *
 * 1. Structural check — 2+ block-level elements (p, headings, blockquote, list)
 *    strongly suggest formatted article prose.
 * 2. Plain-text length check — ≥280 chars of prose (≈2 sentences) as a fallback
 *    for pages that use only inline markup with no block containers.
 *
 * Used by the direct-sanitize fallback to avoid promoting ad fragments or
 * empty boilerplate into the article slot.
 */
export function hasReadableArticleBody(content: string): boolean {
  // Prefer structured markup as the primary signal — fast and reliable.
  const blockElementCount = (
    content.match(/<(?:p|h[1-6]|blockquote|ul|ol)\b/gi) ?? []
  ).length;
  if (blockElementCount >= 2) return true;

  // Fall back to raw text length for pages with minimal HTML structure.
  const plainTextLength = toPlainText(content)
    .replace(/\s+/g, " ")
    .trim().length;
  return plainTextLength >= 280;
}

/**
 * Final clean-up pass applied to sanitized article HTML before it is stored
 * or returned to the client.  Two things are removed in sequence:
 *
 * 1. Comment-engagement boilerplate — login prompts, "before commenting"
 *    notices, etc. that extractors sometimes pull in from the comment section.
 * 2. Nav/footer boilerplate guard — if the whole remaining content still looks
 *    like site chrome (high link density + site-chrome keywords), discard it
 *    entirely so the caller can fall through to a better fallback.
 *
 * `_articleUrl` is reserved for future per-origin cleaning rules but is
 * intentionally unused today to keep the logic domain-agnostic.
 */
export function cleanExtractedArticleHtml(
  sanitizedContent: string,
  _articleUrl: string,
): string {
  if (!sanitizedContent.trim()) return "";

  const withoutEngagementPrompts =
    stripCommentEngagementBoilerplate(sanitizedContent);

  if (!withoutEngagementPrompts.trim()) return "";

  // Discard entirely if the content still looks like a nav/footer block.
  return isLikelyNavFooterBoilerplate(withoutEngagementPrompts)
    ? ""
    : withoutEngagementPrompts;
}

// ─── Upstream HTML fetch ──────────────────────────────────────────────────────

type FetchHtmlDeps = {
  isAllowedFeedUrlFn?: typeof isAllowedFeedUrl;
  axiosGetFn?: typeof axios.get;
  isAxiosErrorFn?: typeof axios.isAxiosError;
};

// Dedicated axios instance with cookie jar support for article extraction.
// Using a separate instance avoids polluting the global axios used by feed fetching.
// Cookie jar support persists challenge cookies (Cloudflare, DataDome, Akamai)
// across all redirect hops within a single extraction attempt.
const extractionAxios = cookieJarWrapper(axios.create());

// How many additional attempts to make after the initial try when a 403 is returned.
// Total attempts = 1 + EXTRACT_403_RETRIES. Each retry uses a different UA fingerprint
// and a fresh cookie jar — many bot systems pass the request through on retry once
// they have logged the initial probe.
const EXTRACT_403_RETRIES = 2;

// Chrome 130 fingerprint pool — Windows, macOS, and Linux variants.
// Rotated on each retry attempt so successive requests look like different users.
// All three share the same sec-ch-ua brand list (only sec-ch-ua-platform differs).
const EXTRACT_FINGERPRINT_POOL = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa:
      '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    secChUaPlatform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa:
      '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    secChUaPlatform: '"macOS"',
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa:
      '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    secChUaPlatform: '"Linux"',
  },
] as const;

// Fingerprint pool index 0 is the canonical default used by injected callers (tests/overrides).
const ARTICLE_EXTRACT_SEC_CH_UA = EXTRACT_FINGERPRINT_POOL[0].secChUa;

/**
 * Fetch article HTML using got-scraping — a pure-Node.js HTTP client that spoofs
 * the TLS/JA3 fingerprint, HTTP/2 SETTINGS frames, and pseudo-header ordering to
 * match a real Chrome 130 browser.  No binary required; works on any serverless
 * platform including Vercel Hobby.
 *
 * This is the DataDome fallback path.  Node.js's default TLS client hello has a
 * distinct JA3 hash that DataDome recognises and blocks regardless of how
 * convincing the HTTP headers look.  axios uses the default Node.js TLS stack;
 * got-scraping replaces cipher suite ordering, HTTP/2 SETTINGS, and
 * pseudo-header order with browser-matching values, changing the JA3/JA3S/Akamai
 * fingerprints to those of a real Chrome instance.
 */
async function fetchHtmlWithFingerprint(url: string): Promise<string> {
  // got-scraping is ESM-only; dynamic import keeps it out of the boot-time module graph.
  const { gotScraping } = await import("got-scraping");

  const response = await gotScraping.get(url, {
    // Ask header-generator to produce a full Chrome 130 Windows header set
    // so every observable signal (UA, Accept, sec-ch-ua, etc.) is consistent.
    headerGeneratorOptions: {
      browsers: [{ name: "chrome", minVersion: 130, maxVersion: 130 }],
      devices: ["desktop"],
      locales: ["en-US"],
      operatingSystems: ["windows"],
    },
    followRedirect: true,
    timeout: { request: 25_000 },
    https: { rejectUnauthorized: true },
    responseType: "text",
  });

  return response.body as string;
}

export async function fetchHtml(
  url: string,
  deps?: FetchHtmlDeps,
): Promise<string> {
  const isAllowedUrl = deps?.isAllowedFeedUrlFn ?? isAllowedFeedUrl;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;

  // When axiosGetFn is injected (tests / external callers) fall back to the
  // original single-attempt behaviour — cookie jar and retry are production-only.
  const injectedGet = deps?.axiosGetFn;

  let lastError: unknown;
  // Set to true when DataDome (x-datadome: protected) is detected on a 403.
  // Rotating axios fingerprints won't help — the block is at TLS/IP level.
  // The browser fallback runs after the loop exits.
  let dataDomeDetected = false;
  // Set to true when PerimeterX (px-captcha challenge page or x-px-* headers) is
  // detected on a 403.  Same reasoning as DataDome — TLS fingerprint is the
  // distinguishing signal; UA rotation alone won't bypass it.
  let perimeterXDetected = false;

  const attempts = injectedGet ? 1 : 1 + EXTRACT_403_RETRIES;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Exponential backoff between retries (first attempt is immediate).
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 600 * attempt));
    }

    // Rotate fingerprint on each attempt. Injected callers (tests/overrides)
    // always use fingerprint pool index 0 so UA expectations stay stable.
    const fp =
      EXTRACT_FINGERPRINT_POOL[attempt % EXTRACT_FINGERPRINT_POOL.length];
    const ua = injectedGet ? EXTRACT_FINGERPRINT_POOL[0].ua : fp.ua;
    const secChUa = injectedGet ? ARTICLE_EXTRACT_SEC_CH_UA : fp.secChUa;
    const secChUaPlatform = injectedGet ? '"Windows"' : fp.secChUaPlatform;

    // Fresh cookie jar per attempt so challenge cookies issued by the bot-check
    // on hop N are carried to hop N+1 within this attempt, but stale/blocked
    // cookies from a previous failed attempt don't pollute the retry.
    const jar = injectedGet ? undefined : new CookieJar();
    const axiosGet: typeof axios.get = injectedGet
      ? injectedGet
      : (reqUrl, config) => extractionAxios.get(reqUrl, { ...config, jar });

    let got403 = false;
    let isFirstValidation = true;

    try {
      return await fetchTextWithValidatedRedirects(
        {
          url,
          // 5 hops matches feed fetching. Article URLs from RSS often route through
          // tracking redirectors (feedproxy, dlvr.it, etc.) before reaching origin.
          maxRedirects: 5,
          timeoutMs: CONFIG.FEED_REQUEST_TIMEOUT_MS,
          maxContentLengthBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
          headers: {
            "User-Agent": ua,
            // Chrome 130 Accept header with modern image format support.
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            // Chrome 130 supports zstd in addition to gzip/deflate/br.
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Cache-Control": "max-age=0",
            "Upgrade-Insecure-Requests": "1",
            // Sec-Fetch-* direct-navigation policy (bookmark / typed URL).
            // Sec-Fetch-Site MUST be "none" — claiming same-origin while
            // arriving from an external IP is a top bot-detection signal.
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            // Chrome Client Hints — absence alongside a Chrome UA is an
            // immediate bot fingerprint flag.
            "sec-ch-ua": secChUa,
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": secChUaPlatform,
            // Navigation fetch priority (Chrome 130).
            Priority: "u=0, i",
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
            if (status === 403) {
              got403 = true;
              const dataDomeHeader = String(
                error.response?.headers?.["x-datadome"] ?? "",
              ).toLowerCase();
              if (dataDomeHeader === "protected") {
                // DataDome detected: fingerprint rotation won't help — the block
                // operates at TLS (JA3) and IP-reputation level. Mark the flag so
                // the catch block exits the loop and the browser fallback runs.
                dataDomeDetected = true;
                throw new Error(
                  "Upstream blocked request with anti-bot protection (DataDome) [HTTP 403]",
                );
              }
              // PerimeterX detection: challenge pages embed "px-captcha" in the
              // body; some enforcer configs also set x-px-* response headers.
              // TLS fingerprint rotation (got-scraping) is the correct bypass.
              const responseBody = String(error.response?.data ?? "");
              const resPxHeaders = Object.keys(error.response?.headers ?? {});
              const isPerimeterX =
                /px[-_]captcha|perimeterx|\/_px\//i.test(responseBody) ||
                resPxHeaders.some((h) => h.toLowerCase().startsWith("x-px-"));
              if (isPerimeterX) {
                perimeterXDetected = true;
                throw new Error(
                  "Upstream blocked request with anti-bot protection (PerimeterX) [HTTP 403]",
                );
              }
              // Other 403s: let the error propagate so the retry loop can catch it.
            }
          },
        },
        { axiosGetFn: axiosGet, isAxiosErrorFn: isAxiosError },
      );
    } catch (err) {
      lastError = err;
      if (dataDomeDetected || perimeterXDetected) {
        // Exit the fingerprint-rotation loop immediately: additional axios
        // requests from the same server IP won't bypass DataDome/PerimeterX —
        // the block is at the TLS/JA3 fingerprint level.  The got-scraping
        // fallback below sends a proper Chrome TLS hello which changes the
        // JA3 hash.
        break;
      }
      // Only retry on 403 — other errors (network, timeout, 404, 5xx) are final.
      if (got403 && attempt < attempts - 1) {
        continue;
      }
      throw err;
    }
  }

  // TLS fingerprint fallback: when DataDome or PerimeterX is detected by axios,
  // retry the request with got-scraping which spoofs the JA3/HTTP2 fingerprint
  // to match Chrome 130 at the TLS layer — something axios/Node.js cannot do
  // natively.  Injected callers (tests) always skip this path — they receive
  // the original error so existing test contracts are unchanged.
  if ((dataDomeDetected || perimeterXDetected) && !injectedGet) {
    try {
      return await fetchHtmlWithFingerprint(url);
    } catch {
      // got-scraping also failed (IP reputation block or network error) —
      // fall through and surface the original DataDome error to the caller.
    }
  }

  // Unreachable — the loop always throws or returns — but satisfies TS.
  throw lastError;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

type ExtractPostDeps = {
  requireMutableAuthenticatedUserFn?: typeof requireMutablePublicRequest;
  parseAndValidateArticleUrlFn?: typeof parseAndValidateArticleUrl;
  fetchHtmlFn?: typeof fetchHtml;
  extractFromHtmlFn?: typeof extractFromHtml;
  sanitizeExtractedContentFn?: typeof sanitizeExtractedContent;
  cleanExtractedArticleHtmlFn?: typeof cleanExtractedArticleHtml;
  jsonErrorFn?: typeof jsonError;
  toErrorMessageFn?: typeof toErrorMessage;
  logAndRespondErrorFn?: typeof logAndRespondError;
  isAxiosErrorFn?: typeof axios.isAxiosError;
  infoFn?: typeof logger.info;
  warnFn?: typeof logger.warn;
  errorFn?: typeof logger.error;
  shouldUseExtractCacheFn?: () => boolean;
};

export async function POST(request: NextRequest, deps?: ExtractPostDeps) {
  const requireAuth =
    deps?.requireMutableAuthenticatedUserFn ?? requireMutablePublicRequest;
  const parseArticleUrl =
    deps?.parseAndValidateArticleUrlFn ?? parseAndValidateArticleUrl;
  const fetchArticleHtml = deps?.fetchHtmlFn ?? fetchHtml;
  const extractArticle = deps?.extractFromHtmlFn ?? extractFromHtml;
  const sanitizeContent =
    deps?.sanitizeExtractedContentFn ?? sanitizeExtractedContent;
  const cleanContent =
    deps?.cleanExtractedArticleHtmlFn ?? cleanExtractedArticleHtml;
  const toJsonError = deps?.jsonErrorFn ?? jsonError;
  const toMessage = deps?.toErrorMessageFn ?? toErrorMessage;
  const respondError = deps?.logAndRespondErrorFn ?? logAndRespondError;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;
  const info = deps?.infoFn ?? logger.info.bind(logger);
  const warn = deps?.warnFn ?? logger.warn.bind(logger);
  const errorLog = deps?.errorFn ?? logger.error.bind(logger);
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

    const localSnapshot = await readPlaceholderSnapshotHtml(articleUrl);
    const html = localSnapshot?.html ?? (await fetchArticleHtml(articleUrl));
    info(`Article extract source`, {
      url: safeUrl,
      source: localSnapshot ? "local-snapshot" : "upstream-url",
      snapshotPath: localSnapshot?.snapshotPath ?? null,
      extractAttemptId,
      requestId,
    });
    info(`Article HTML fetched`, { url: safeUrl, bytes: html.length });

    const extractableHtml = preCleanHtmlForExtraction(html);
    const extracted = await extractArticle(extractableHtml, articleUrl, {
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

    if (!content.trim()) {
      // Direct-sanitize fallback.
      //
      // Finding: Readability's scoring algorithm relies on visible text density
      // (chars per candidate node) and is sensitive to nesting depth.  On
      // React / SPA pages the real article can live 5-6 div levels deep with
      // no semantic anchors (no <article>, <main>, or id/class signals that
      // Readability recognises).  In a tested scenario the DOM contained 24
      // article paragraphs totalling ~5,900 chars of text, but Readability
      // returned only ~194 chars consisting of ad copy and a form label because
      // the outermost ancestor it could score was an anonymous wrapper div that
      // happened to contain both the article subtree *and* several noisy
      // siblings, diluting the density below competing nodes.
      //
      // Solution: when Readability returns nothing, skip it entirely and pipe
      // the pre-cleaned HTML straight through `sanitizeExtractedContent`.
      // The sanitizer is tag-allowlist based — it keeps <p>, <h1-6>,
      // <blockquote>, <img>, etc. and discards everything else — so it
      // recovers the article text without needing density scoring.  The
      // `hasReadableArticleBody` guard ensures we only promote the result when
      // it contains genuine prose (2+ block elements or 280+ plain-text chars)
      // rather than residual ad fragments.
      const directlySanitized = sanitizeContent(extractableHtml);
      const directlyCleaned = cleanContent(directlySanitized, articleUrl);
      if (directlyCleaned.trim() && hasReadableArticleBody(directlyCleaned)) {
        content = directlyCleaned;
        info(`Article extract applied direct sanitize fallback`, {
          url: safeUrl,
          extractAttemptId,
          requestId,
        });
      }
    }

    if (!content.trim()) {
      const metadataFallbackContent = buildMetadataImageFallbackHtml(html);
      if (metadataFallbackContent) {
        const fallbackCleaned = cleanContent(
          metadataFallbackContent,
          articleUrl,
        );
        if (fallbackCleaned.trim()) {
          content = fallbackCleaned;
          info(`Article extract applied metadata image fallback`, {
            url: safeUrl,
            extractAttemptId,
            requestId,
          });
        }
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
      errorLog(
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

    errorLog(
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
