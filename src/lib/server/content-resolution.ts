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
import { pickDiagnosticHeaders } from "@/lib/fetch";
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
 * Create the extract payload.
 * @param content - The content.
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
 * Create the extract request context.
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
 * Return the cached extract response.
 * @param articleUrl - The article url.
 * @param shouldUseCache - Whether should use cache.
 * @param getCachedExtractPayload - The callback that cached extract payload.
 * @returns The cached extract response.
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

  return getCachedExtractPayload(articleUrl);
}

/**
 * Return the request url.
 * @param value - The value.
 * @returns The request url.
 */
export function getRequestUrl(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  const url = (value as { url?: unknown }).url;
  return typeof url === "string" ? url.trim() : "";
}

/**
 * Process the prepend metadata lead image when missing.
 * @param content - The content.
 * @param originalHtml - The original html.
 * @param articleUrl - The article url.
 * @param cleanContent - The callback that clean content.
 * @returns The prepend metadata lead image when missing.
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

  if (
    !hasImageDownloadLinkInContent(content) ||
    !IMAGE_ARTICLE_MARKER_RE.test(content)
  ) {
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
 * @param sanitizeContent - The callback that sanitize content.
 * @param cleanContent - The callback that clean content.
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
 * @param sanitizeContent - The callback that sanitize content.
 * @param cleanContent - The callback that clean content.
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
 * Process the respond to upstream extract error.
 * @param error - The error.
 * @param context - The context used to process the respond to upstream extract error.
 * @param options - The options used to process the respond to upstream extract error.
 * @returns The respond to upstream extract error.
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
 * Process the warn on empty extraction.
 * @param extracted - The extracted.
 * @param warn - The callback that warn.
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
 * Process the extract lead image block.
 * @param content - The content.
 * @returns The extract lead image block.
 */
function extractLeadImageBlock(content: string): string {
  const leadImageBlock = LEAD_IMAGE_BLOCK_RE.exec(content)?.[0];
  if (leadImageBlock) {
    return leadImageBlock;
  }

  return LEAD_IMAGE_TAG_RE.exec(content)?.[0] ?? "";
}

/**
 * Return whether has image download link in content.
 * @param content - The content.
 * @returns Whether has image download link in content.
 */
function hasImageDownloadLinkInContent(content: string): boolean {
  for (const match of content.matchAll(ANCHOR_HREF_RE)) {
    if (IMAGE_DOWNLOAD_HREF_RE.test(match[1])) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve the metadata fallback content.
 * @param originalHtml - The original html.
 * @param articleUrl - The article url.
 * @param cleanContent - The callback that clean content.
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
 * Process the sanitize header value.
 * @param value - The value.
 * @param maxLen - The max len.
 * @returns The sanitize header value.
 */
function sanitizeHeaderValue(value: null | string, maxLen = 64): null | string {
  if (!value) {
    return null;
  }

  return value.replace(/[^\x20-\x7E]/g, "").slice(0, maxLen) || null;
}
