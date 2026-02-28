import {
  buildAxiosFailureDiagnostics,
  isVerboseLoggingEnabled,
  jsonError,
} from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import type {
  ExtractRequestContext,
  ExtractResponsePayload,
} from "@/lib/extract";
import {
  ARTICLE_EXTRACTION_ERROR_MESSAGE,
  ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE,
  ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE,
  fetchHtml,
  getCachedExtractPayload,
  isExtractCacheEnabled,
  parseAndValidateArticleUrl,
  readPlaceholderSnapshotHtml,
  setCachedExtractPayload,
} from "@/lib/extract";
import { logger } from "@/lib/logger";
import {
  buildMetadataImageFallbackHtml,
  cleanExtractedArticleHtml,
  hasReadableArticleBody,
  preCleanHtmlForExtraction,
  sanitizeExtractedContent,
} from "@/lib/sanitize";
import { logAndRespondError, requireMutablePublicRequest } from "@/lib/server";
import { toErrorMessage } from "@/lib/utils/errors";
import { redactUrlForLogs, tryGetUrlHostname } from "@/lib/utils/url";
import { extractFromHtml } from "@extractus/article-extractor";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

// ─── Inlined helpers (from route-helpers.ts) ─────────────────────────────────

export function getHostname(url: string): string {
  return tryGetUrlHostname(url) ?? "";
}

function mapUpstreamExtractStatus(upstreamStatus?: number): 422 | 502 {
  return upstreamStatus === 404 ? 422 : 502;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function createExtractRequestContext(
  request: NextRequest,
): ExtractRequestContext {
  const extractAttemptId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const requestId =
    request.headers?.get("x-request-id") ??
    request.headers?.get("x-correlation-id") ??
    null;

  return {
    extractAttemptId,
    requestId,
  };
}

function buildExtractPayload(
  content: string,
  extracted: Awaited<ReturnType<typeof extractFromHtml>> | null | undefined,
): ExtractResponsePayload {
  return {
    content,
    title: extracted?.title ?? null,
    source: extracted?.source ?? null,
  };
}

function logExtractStart(
  info: typeof logger.info,
  articleUrl: string,
  context: ExtractRequestContext,
): void {
  info(`Article extract started`, {
    url: redactUrlForLogs(articleUrl),
    extractAttemptId: context.extractAttemptId,
    requestId: context.requestId,
  });
}

function getCachedExtractResponse(
  articleUrl: string,
  shouldUseCache: () => boolean,
  info: typeof logger.info,
  context: ExtractRequestContext,
): ExtractResponsePayload | null {
  if (!shouldUseCache()) {
    return null;
  }

  const cachedPayload = getCachedExtractPayload(articleUrl);
  if (!cachedPayload) {
    return null;
  }

  info(`Article extract cache hit`, {
    url: redactUrlForLogs(articleUrl),
    extractAttemptId: context.extractAttemptId,
    requestId: context.requestId,
  });

  return cachedPayload;
}

async function resolveExtractedContent(
  extractableHtml: string,
  originalHtml: string,
  articleUrl: string,
  extracted: Awaited<ReturnType<typeof extractFromHtml>> | null | undefined,
  sanitizeContent: (rawContent: string) => string,
  cleanContent: (sanitizedContent: string, articleUrl: string) => string,
  info: typeof logger.info,
  context: ExtractRequestContext,
): Promise<string> {
  const rawContent =
    extracted?.content?.trim() || extracted?.description?.trim() || "";
  const sanitizedContent = sanitizeContent(rawContent);
  let content = cleanContent(sanitizedContent, articleUrl);

  if (!content.trim()) {
    const directlySanitized = sanitizeContent(extractableHtml);
    const directlyCleaned = cleanContent(directlySanitized, articleUrl);
    if (directlyCleaned.trim() && hasReadableArticleBody(directlyCleaned)) {
      content = directlyCleaned;
      info(`Article extract applied direct sanitize fallback`, {
        url: redactUrlForLogs(articleUrl),
        extractAttemptId: context.extractAttemptId,
        requestId: context.requestId,
      });
    }
  }

  if (!content.trim()) {
    const metadataFallbackContent =
      buildMetadataImageFallbackHtml(originalHtml);
    if (metadataFallbackContent) {
      const fallbackCleaned = cleanContent(metadataFallbackContent, articleUrl);
      if (fallbackCleaned.trim()) {
        content = fallbackCleaned;
        info(`Article extract applied metadata image fallback`, {
          url: redactUrlForLogs(articleUrl),
          extractAttemptId: context.extractAttemptId,
          requestId: context.requestId,
        });
      }
    }
  }

  return content;
}

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
  const context = createExtractRequestContext(request);

  let articleUrl: string | null = null;

  try {
    const authResult = await requireAuth(request, {
      rateLimit: {
        key: "article-extract",
        windowMs: CONFIG.RATE_LIMIT_EXTRACT_WINDOW_MS,
        maxAttempts: CONFIG.RATE_LIMIT_EXTRACT_MAX_REQUESTS,
      },
    });
    if (authResult instanceof Response) return authResult;

    const parsedUrl = await parseArticleUrl(request);
    if (parsedUrl instanceof Response) return parsedUrl;
    articleUrl = parsedUrl;

    logExtractStart(info, articleUrl, context);

    const cachedPayload = getCachedExtractResponse(
      articleUrl,
      shouldUseCache,
      info,
      context,
    );
    if (cachedPayload) {
      return NextResponse.json(cachedPayload);
    }

    const localSnapshot = await readPlaceholderSnapshotHtml(articleUrl);
    const html = localSnapshot?.html ?? (await fetchArticleHtml(articleUrl));
    const safeUrl = redactUrlForLogs(articleUrl);
    info(`Article extract source`, {
      url: safeUrl,
      source: localSnapshot ? "local-snapshot" : "upstream-url",
      snapshotPath: localSnapshot?.snapshotPath ?? null,
      extractAttemptId: context.extractAttemptId,
      requestId: context.requestId,
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

    const content = await resolveExtractedContent(
      extractableHtml,
      html,
      articleUrl,
      extracted,
      sanitizeContent,
      cleanContent,
      info,
      context,
    );

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
      ...buildExtractPayload(content, extracted),
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
      const status = mapUpstreamExtractStatus(upstreamStatus);
      const label = status === 502 ? "Bad Gateway" : "Unprocessable Content";
      errorLog(
        `Returning ${status} ${label} — article extract upstream request failed (upstream ${upstreamStatus ?? "no response"})${urlSuffix}: ${toMessage(error)}`,
        {
          url: safeArticleUrl,
          extractAttemptId: context.extractAttemptId,
          requestId: context.requestId,
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
        extractAttemptId: context.extractAttemptId,
        requestId: context.requestId,
      },
    );
    return respondError("Article extract error", error, {
      status: 502,
      publicMessage: ARTICLE_EXTRACTION_ERROR_MESSAGE,
    });
  }
}
