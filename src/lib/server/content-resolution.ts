import type { logger } from "@/lib";
import type { DistilledArticle, DistillStrategy } from "@/lib/distill";
import type { HttpCloakUpstreamError } from "@/lib/fetch";

import { jsonErrorWithReason, toBodySnippet } from "@/lib/api/http";
import {
  ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE,
  ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE,
  type ExtractRequestContext,
  type ExtractResponsePayload,
} from "@/lib/extract";
import {
  detectResponseCompatibilitySignal,
  pickDiagnosticHeaders,
} from "@/lib/fetch";
import {
  buildMetadataImageFallbackHtml,
  hasReadableArticleBody,
} from "@/lib/sanitize";
import { redactUrlForLogs } from "@/lib/utils";

const IMAGE_ARTICLE_MARKER_RE =
  /\b(?:download|full[-\s]?res|hi[-\s]?res|image\s+credit|taken|size|dimensions?|licen[cs]e)\b/i;
const LEAD_IMAGE_BLOCK_RE = /<p\b[^>]*>\s*<img\b[\s\S]*?<\/p>/i;
const LEAD_IMAGE_TAG_RE = /<img\b[^>]*>/i;
const ANCHOR_HREF_RE = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
const IMAGE_DOWNLOAD_HREF_RE = /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i;

/**
 * Describes the options for respond to upstream extract error.
 */
interface RespondToUpstreamExtractErrorOptions {
  errorLog: typeof logger.error;
  proxyUrl: string | undefined;
  safeArticleUrl: null | string;
  toMessage: (error: unknown) => string;
  useProxy: boolean;
  verboseLoggingEnabled: boolean;
}

/**
 * Implements the early response error.
 */
export class EarlyResponseError extends Error {
  /**
   * Creates an internal control-flow error that carries a prepared response.
   * @param response - Early response that should short-circuit further processing.
   */
  constructor(public readonly response: Response) {
    super("early-response");
  }
}

/**
 * Rejects successful upstream responses that are vendor access interstitials
 * rather than article documents, preventing false-success empty extraction.
 * @param html - Decoded upstream HTML body about to enter distillation.
 */
export function assertExtractableArticleHtml(html: string): void {
  const compatibility = detectResponseCompatibilitySignal(200, undefined, html);

  if (!compatibility.signal.detected) {
    return;
  }

  throw new Error(
    `Upstream request received a source access response (${compatibility.signal.provider}) [HTTP 200]`,
  );
}

/**
 * Build an extract response payload from sanitized content and optional distillation output.
 * @param content - The sanitized article content string.
 * @param extracted - The extracted.
 * @returns The extract payload.
 */
export function createExtractPayload(
  content: string,
  extracted: DistilledArticle | null | undefined,
): ExtractResponsePayload {
  return {
    content,
    source: extracted?.source ?? null,
    title: extracted?.title ?? null,
  };
}

/**
 * Build a tracing context for an article extraction request, including a unique attempt ID and optional correlation ID.
 * @param request - The request.
 * @returns The extract request context.
 */
export function createExtractRequestContext(
  request: Request,
): ExtractRequestContext {
  const extractAttemptId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const requestId = sanitizeHeaderValue(
    request.headers.get("x-request-id") ??
      request.headers.get("x-correlation-id"),
  );

  return {
    extractAttemptId,
    requestId,
  };
}

/**
 * Return a cached extraction payload when caching is enabled and a non-empty entry exists.
 * @param articleUrl - The article url.
 * @param shouldUseCache - Whether should use cache.
 * @param getCachedExtractPayload - Optional override for the extract payload cache lookup.
 * @returns The cached payload, or null when caching is disabled or no valid entry exists.
 */
export function getCachedExtractResponse(
  articleUrl: string,
  shouldUseCache: () => boolean,
  getCachedExtractPayload: (
    articleUrl: string,
  ) => ExtractResponsePayload | null,
): ExtractResponsePayload | null {
  if (!shouldUseCache()) {
    return null;
  }

  const cachedPayload = getCachedExtractPayload(articleUrl);
  return cachedPayload?.content.trim() ? cachedPayload : null;
}

/**
 * Extract the URL string from an unknown request-like value.
 * @param value - The value.
 * @returns The trimmed URL string, or an empty string when the value lacks one.
 */
export function getRequestUrl(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  const url = (value as { url?: unknown }).url;
  return typeof url === "string" ? url.trim() : "";
}

/**
 * Prepend a metadata lead image to article content when no inline image is present.
 * @param content - The content.
 * @param originalHtml - The original html.
 * @param articleUrl - The article url.
 * @param cleanContent - Callback that strips non-essential markup from sanitized HTML.
 * @returns Content augmented with a metadata-sourced lead image, or the original content unchanged.
 */
export function prependMetadataLeadImageWhenMissing(
  content: string,
  originalHtml: string,
  articleUrl: string,
  cleanContent: (sanitizedContent: string, articleUrl: string) => string,
): string {
  if (!content.trim() || /<img\b/i.test(content)) {
    return content;
  }

  const hasImageDownloadLink = Array.from(
    content.matchAll(ANCHOR_HREF_RE),
  ).some((match) => IMAGE_DOWNLOAD_HREF_RE.test(match[1]));
  if (!hasImageDownloadLink && !IMAGE_ARTICLE_MARKER_RE.test(content)) {
    return content;
  }

  const metadataFallbackContent = buildMetadataImageFallbackHtml(originalHtml);
  if (!metadataFallbackContent) {
    return content;
  }

  const metadataLeadImage = extractLeadImageBlock(metadataFallbackContent);
  if (!metadataLeadImage) {
    return content;
  }

  const augmented = cleanContent(
    `${metadataLeadImage}\n${content}`,
    articleUrl,
  );
  return /<img\b/i.test(augmented) ? augmented : content;
}

/**
 * Resolve the direct sanitized content.
 * @param extractableHtml - The extractable html.
 * @param articleUrl - The article url.
 * @param sanitizeContent - Callback that sanitizes raw HTML into safe content.
 * @param cleanContent - Callback that strips non-essential markup from sanitized HTML.
 * @returns The direct sanitized content.
 */
export function resolveDirectSanitizedContent(
  extractableHtml: string,
  articleUrl: string,
  sanitizeContent: (rawContent: string) => string,
  cleanContent: (sanitizedContent: string, articleUrl: string) => string,
): string {
  const directlyCleaned = cleanContent(
    sanitizeContent(extractableHtml),
    articleUrl,
  );

  return directlyCleaned.trim() && hasReadableArticleBody(directlyCleaned)
    ? directlyCleaned
    : "";
}

/**
 * Resolve the distill strategy.
 * @param strategy - The strategy.
 * @param distillStrategies - The distill strategies.
 * @returns The distill strategy.
 */
export function resolveDistillStrategy(
  strategy: unknown,
  distillStrategies: readonly string[],
): DistillStrategy {
  if (typeof strategy === "string" && distillStrategies.includes(strategy)) {
    return strategy as DistillStrategy;
  }

  return "librerss";
}
/**
 * Resolve the extracted content.
 * @param extractableHtml - The extractable html.
 * @param originalHtml - The original html.
 * @param articleUrl - The article url.
 * @param extracted - The extracted.
 * @param sanitizeContent - Callback that sanitizes raw HTML into safe content.
 * @param cleanContent - Callback that strips non-essential markup from sanitized HTML.
 * @returns The extracted content.
 */
export function resolveExtractedContent(
  extractableHtml: string,
  originalHtml: string,
  articleUrl: string,
  extracted: DistilledArticle | null | undefined,
  sanitizeContent: (rawContent: string) => string,
  cleanContent: (sanitizedContent: string, articleUrl: string) => string,
): string {
  const extractedContent = extracted?.content.trim() ?? "";
  const extractedDescription = (extracted?.description ?? "").trim();
  const rawContent = extractedContent || extractedDescription;
  const primaryContent = cleanContent(sanitizeContent(rawContent), articleUrl);
  const contentWithLeadImage = primaryContent.trim()
    ? prependMetadataLeadImageWhenMissing(
        primaryContent,
        originalHtml,
        articleUrl,
        cleanContent,
      )
    : "";

  if (contentWithLeadImage.trim()) {
    return contentWithLeadImage;
  }

  const directSanitizedContent = resolveDirectSanitizedContent(
    extractableHtml,
    articleUrl,
    sanitizeContent,
    cleanContent,
  );
  if (directSanitizedContent.trim()) {
    return directSanitizedContent;
  }

  return resolveMetadataFallbackContent(originalHtml, articleUrl, cleanContent);
}

/**
 * Build and log an error response for a failed upstream article extraction request.
 * @param error - The error.
 * @param context - The context used to process the respond to upstream extract error.
 * @param options - The options used to process the respond to upstream extract error.
 * @returns A 502 or 422 JSON response with upstream failure details.
 */
export function respondToUpstreamExtractError(
  error: HttpCloakUpstreamError,
  context: ExtractRequestContext,
  options: RespondToUpstreamExtractErrorOptions,
): Response {
  const upstreamStatus = error.statusCode;
  const status = upstreamStatus === 404 ? 422 : 502;
  const label = status === 502 ? "Bad Gateway" : "Unprocessable Content";
  const safeProxyAddress = options.useProxy
    ? options.proxyUrl
      ? redactUrlForLogs(options.proxyUrl)
      : null
    : null;
  const urlSuffix = options.safeArticleUrl
    ? ` for ${options.safeArticleUrl}`
    : "";

  options.errorLog(
    `Returning ${status} ${label} — article extract upstream request failed (HTTPCloak upstream ${upstreamStatus})${urlSuffix}: ${options.toMessage(error)}`,
    {
      connectionMode: error.proxyMode,
      extractAttemptId: context.extractAttemptId,
      proxyAddress: safeProxyAddress,
      redirectHop: error.redirectHop,
      requestId: context.requestId,
      statusCode: upstreamStatus,
      url: options.safeArticleUrl,
      ...(options.verboseLoggingEnabled
        ? {
            requestHeaders: error.requestHeaders,
            responseBodySnippet: toBodySnippet(error.responseBody),
            responseHeaders: pickDiagnosticHeaders(error.responseHeaders),
          }
        : {}),
    },
  );

  return jsonErrorWithReason(
    status === 422
      ? ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE
      : ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE,
    status,
    options.toMessage(error),
  );
}

/**
 * Emit a warning when the article extractor returned no usable content.
 * @param extracted - The extracted.
 * @param warn - Callback for emitting warning log entries.
 * @param safeUrl - The safe url.
 */
export function warnOnEmptyExtraction(
  extracted: DistilledArticle | null | undefined,
  warn: typeof logger.warn,
  safeUrl: string,
): void {
  const extractedContent = extracted?.content.trim() ?? "";
  const extractedDescription = (extracted?.description ?? "").trim();

  if (!extracted || (!extractedContent && !extractedDescription)) {
    warn("Article extractor returned no content", { url: safeUrl });
  }
}

/**
 * Extract the first lead image block (a `<p><img …></p>` or bare `<img>`) from sanitized content.
 * @param content - The content.
 * @returns The matched HTML block string, or an empty string if none is found.
 */
function extractLeadImageBlock(content: string): string {
  const leadImageBlock = LEAD_IMAGE_BLOCK_RE.exec(content)?.[0];
  if (leadImageBlock) {
    return leadImageBlock;
  }

  return LEAD_IMAGE_TAG_RE.exec(content)?.[0] ?? "";
}

/**
 * Resolve the metadata fallback content.
 * @param originalHtml - The original html.
 * @param articleUrl - The article url.
 * @param cleanContent - Callback that strips non-essential markup from sanitized HTML.
 * @returns The metadata fallback content.
 */
function resolveMetadataFallbackContent(
  originalHtml: string,
  articleUrl: string,
  cleanContent: (sanitizedContent: string, articleUrl: string) => string,
): string {
  const metadataFallbackContent = buildMetadataImageFallbackHtml(originalHtml);
  if (!metadataFallbackContent) {
    return "";
  }

  const fallbackCleaned = cleanContent(metadataFallbackContent, articleUrl);
  return fallbackCleaned.trim() ? fallbackCleaned : "";
}

/**
 * Strip non-printable ASCII characters from a header value and clamp it to a maximum length.
 * @param value - The value.
 * @param maxLen - The max len.
 * @returns The sanitized string, or null if the result is empty.
 */
function sanitizeHeaderValue(value: null | string, maxLen = 64): null | string {
  if (!value) {
    return null;
  }

  return value.replace(/[^\x20-\x7E]/g, "").slice(0, maxLen) || null;
}
