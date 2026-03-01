import {
  buildAxiosFailureDiagnostics,
  isVerboseLoggingEnabled,
  jsonError,
  jsonErrorWithReason,
  parseJsonBodyOrResponse,
} from "@/lib/api/http";
import { getUserFromRequest } from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import type {
  ExtractedArticle,
  ExtractRequestContext,
  ExtractResponsePayload,
} from "@/lib/extract";
import {
  ARTICLE_EXTRACTION_ERROR_MESSAGE,
  ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE,
  ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE,
  extractArticleFromHtml,
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
import axios from "axios";
import { eq } from "drizzle-orm";
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
  extractFromHtmlFn?: typeof extractArticleFromHtml;
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
  extracted: ExtractedArticle | null | undefined,
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
  options?: { useProxy: boolean; proxyAddress?: string },
): void {
  info(`Article extract started`, {
    url: redactUrlForLogs(articleUrl),
    extractAttemptId: context.extractAttemptId,
    requestId: context.requestId,
    connectionMode: options?.useProxy ? "proxy" : "direct",
    proxyAddress: options?.useProxy ? (options.proxyAddress ?? null) : null,
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
  extracted: ExtractedArticle | null | undefined,
  sanitizeContent: (rawContent: string) => string,
  cleanContent: (sanitizedContent: string, articleUrl: string) => string,
  info: typeof logger.info,
  context: ExtractRequestContext,
): Promise<string> {
  // 1. Sanitize the extracted article body container (if found)
  const rawContent =
    extracted?.content?.trim() || extracted?.description?.trim() || "";
  info(`[resolve] step 1 — sanitize extracted body`, {
    url: redactUrlForLogs(articleUrl),
    rawContentChars: rawContent.length,
    extractAttemptId: context.extractAttemptId,
  });

  const sanitizedContent = sanitizeContent(rawContent);
  info(`[resolve] step 1 — after sanitizeContent`, {
    url: redactUrlForLogs(articleUrl),
    sanitizedChars: sanitizedContent.length,
    extractAttemptId: context.extractAttemptId,
  });

  let content = cleanContent(sanitizedContent, articleUrl);
  info(`[resolve] step 1 — after cleanContent`, {
    url: redactUrlForLogs(articleUrl),
    cleanedChars: content.length,
    hasContent: !!content.trim(),
    extractAttemptId: context.extractAttemptId,
  });

  // 2. Fall back to direct sanitize of entire pre-cleaned page
  if (!content.trim()) {
    info(`[resolve] step 2 — trying direct sanitize fallback`, {
      url: redactUrlForLogs(articleUrl),
      extractableHtmlChars: extractableHtml.length,
      extractAttemptId: context.extractAttemptId,
    });

    const directlySanitized = sanitizeContent(extractableHtml);
    info(`[resolve] step 2 — after sanitizeContent (full page)`, {
      url: redactUrlForLogs(articleUrl),
      directlySanitizedChars: directlySanitized.length,
      extractAttemptId: context.extractAttemptId,
    });

    const directlyCleaned = cleanContent(directlySanitized, articleUrl);
    const isReadable =
      directlyCleaned.trim() && hasReadableArticleBody(directlyCleaned);
    info(`[resolve] step 2 — direct sanitize readability check`, {
      url: redactUrlForLogs(articleUrl),
      directlyCleanedChars: directlyCleaned.length,
      isReadable,
      extractAttemptId: context.extractAttemptId,
    });

    if (isReadable) {
      content = directlyCleaned;
      info(`Article extract applied direct sanitize fallback`, {
        url: redactUrlForLogs(articleUrl),
        extractAttemptId: context.extractAttemptId,
        requestId: context.requestId,
      });
    }
  }

  // 3. Fall back to og:image + og:description metadata
  if (!content.trim()) {
    info(`[resolve] step 3 — trying metadata image fallback`, {
      url: redactUrlForLogs(articleUrl),
      extractAttemptId: context.extractAttemptId,
    });

    const metadataFallbackContent =
      buildMetadataImageFallbackHtml(originalHtml);
    info(`[resolve] step 3 — metadata fallback result`, {
      url: redactUrlForLogs(articleUrl),
      hasMetadataContent: !!metadataFallbackContent,
      metadataContentChars: metadataFallbackContent?.length ?? 0,
      extractAttemptId: context.extractAttemptId,
    });

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
  const extractArticle = deps?.extractFromHtmlFn ?? extractArticleFromHtml;
  const sanitizeContent =
    deps?.sanitizeExtractedContentFn ?? sanitizeExtractedContent;
  const cleanContent =
    deps?.cleanExtractedArticleHtmlFn ?? cleanExtractedArticleHtml;
  const _toJsonError = deps?.jsonErrorFn ?? jsonError;
  const toMessage = deps?.toErrorMessageFn ?? toErrorMessage;
  const _respondError = deps?.logAndRespondErrorFn ?? logAndRespondError;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;
  const info = deps?.infoFn ?? logger.info.bind(logger);
  const warn = deps?.warnFn ?? logger.warn.bind(logger);
  const errorLog = deps?.errorFn ?? logger.error.bind(logger);
  const shouldUseCache = deps?.shouldUseExtractCacheFn ?? isExtractCacheEnabled;
  const verboseLoggingEnabled = isVerboseLoggingEnabled();
  const context = createExtractRequestContext(request);

  let articleUrl: string | null = null;
  let useProxy = false;
  let resolvedProxyUrl: string | undefined;

  try {
    const authResult = await requireAuth(request, {
      rateLimit: {
        key: "article-extract",
        windowMs: CONFIG.RATE_LIMIT_EXTRACT_WINDOW_MS,
        maxAttempts: CONFIG.RATE_LIMIT_EXTRACT_MAX_REQUESTS,
      },
    });
    if (authResult instanceof Response) return authResult;

    // Parse body once and extract both url and useProxy flag
    const bodyResult = await parseJsonBodyOrResponse<{
      url?: string;
      useProxy?: boolean;
    }>(request);
    if (bodyResult instanceof Response) return bodyResult;
    useProxy = bodyResult.useProxy === true;

    // Resolve the user's proxy URL and TLS settings from DB when proxy is requested
    let allowInsecureTls = false;
    if (useProxy) {
      const sessionUser = await getUserFromRequest(request);
      if (sessionUser) {
        const db = getDb();
        const [row] = await db
          .select({
            proxyUrl: users.proxyUrl,
            allowInsecureTls: users.allowInsecureTls,
          })
          .from(users)
          .where(eq(users.id, sessionUser.userId))
          .limit(1);
        resolvedProxyUrl = row?.proxyUrl?.trim() || undefined;
        allowInsecureTls = row?.allowInsecureTls ?? false;
      }
    }

    // Build a cloned request with the same body for parseAndValidateArticleUrl
    const clonedRequest = new NextRequest(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(bodyResult),
    });

    const parsedUrl = await parseArticleUrl(clonedRequest);
    if (parsedUrl instanceof Response) return parsedUrl;
    articleUrl = parsedUrl;

    logExtractStart(info, articleUrl, context, {
      useProxy,
      proxyAddress: resolvedProxyUrl,
    });

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
    const html =
      localSnapshot?.html ??
      (await fetchArticleHtml(articleUrl, undefined, {
        useProxy,
        proxyUrl: resolvedProxyUrl,
        allowInsecureTls,
      }));
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
    info(`Article pre-cleaned HTML`, {
      url: safeUrl,
      preCleanedChars: extractableHtml.length,
      extractAttemptId: context.extractAttemptId,
    });

    const extracted = await extractArticle(extractableHtml, articleUrl, {
      contentLengthThreshold: 120,
    });

    info(`Article extractor result`, {
      url: safeUrl,
      hasContent: !!extracted?.content?.trim(),
      contentChars: extracted?.content?.length ?? 0,
      hasDescription: !!extracted?.description?.trim(),
      descriptionChars: extracted?.description?.length ?? 0,
      title: extracted?.title ?? null,
      extractAttemptId: context.extractAttemptId,
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
          connectionMode: useProxy ? "proxy" : "direct",
          proxyAddress: useProxy ? (resolvedProxyUrl ?? null) : null,
          ...(verboseLoggingEnabled
            ? buildAxiosFailureDiagnostics(error, isAxiosError)
            : {}),
        },
      );
      return jsonErrorWithReason(
        status === 422
          ? ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE
          : ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE,
        status,
        toMessage(error),
      );
    }

    errorLog(
      `Returning 502 Bad Gateway — article extract upstream processing failed${urlSuffix}: ${toMessage(error)}`,
      {
        url: safeArticleUrl,
        extractAttemptId: context.extractAttemptId,
        requestId: context.requestId,
        connectionMode: useProxy ? "proxy" : "direct",
        proxyAddress: useProxy ? (resolvedProxyUrl ?? null) : null,
      },
    );
    return jsonErrorWithReason(
      ARTICLE_EXTRACTION_ERROR_MESSAGE,
      502,
      toMessage(error),
    );
  }
}
