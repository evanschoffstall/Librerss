import axios from "axios";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import {
  buildAxiosFailureDiagnostics,
  isVerboseLoggingEnabled,
  jsonError,
  jsonErrorWithReason,
  parseJsonBodyOrResponse,
} from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import { getPlaceholderSnapshotPathByArticleUrl } from "@/lib/core/placeholder";
import { getDb } from "@/lib/db/db";
import { users } from "@/lib/db/schema";
import type { DistilledArticle, DistillStrategy } from "@/lib/distill";
import { DISTILL_STRATEGIES, distillArticle } from "@/lib/distill";
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
  cleanSanitizedHtml,
  hasReadableArticleBody,
  preCleanHtml,
  sanitizeRawContent,
} from "@/lib/sanitize";
import {
  logAndRespondError,
  requireMutableAuthenticatedUser,
} from "@/lib/server";
import { toErrorMessage } from "@/lib/utils/errors";
import {
  injectProxyCredentials,
  redactUrlForLogs,
  tryGetUrlHostname,
} from "@/lib/utils/url";

// ─── Inlined helpers (from route-helpers.ts) ─────────────────────────────────

export function getHostname(url: string): string {
  return tryGetUrlHostname(url) ?? "";
}

function mapUpstreamExtractStatus(upstreamStatus?: number): 422 | 502 {
  return upstreamStatus === 404 ? 422 : 502;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ExtractPostDeps {
  cleanSanitizedHtmlFn?: typeof cleanSanitizedHtml;
  errorFn?: typeof logger.error;
  extractFromHtmlFn?: typeof distillArticle;
  fetchHtmlFn?: typeof fetchHtml;
  infoFn?: typeof logger.info;
  isAxiosErrorFn?: typeof axios.isAxiosError;
  jsonErrorFn?: typeof jsonError;
  logAndRespondErrorFn?: typeof logAndRespondError;
  parseAndValidateArticleUrlFn?: typeof parseAndValidateArticleUrl;
  requireMutableAuthenticatedUserFn?: typeof requireMutableAuthenticatedUser;
  sanitizeRawContentFn?: typeof sanitizeRawContent;
  shouldUseExtractCacheFn?: () => boolean;
  toErrorMessageFn?: typeof toErrorMessage;
  warnFn?: typeof logger.warn;
}

interface ExtractRequestBody {
  distillStrategy?: string;
  url?: string;
  useProxy?: boolean;
}

export async function POST(request: NextRequest, deps?: ExtractPostDeps) {
  // SECURITY: Require authentication — unauthenticated callers must not be
  // able to trigger arbitrary outbound HTTP fetches from the server.
  // Exception: placeholder snapshot URLs are served from local files only
  // (no outbound fetch), so they bypass auth to support preview/explore mode.
  const requireAuth =
    deps?.requireMutableAuthenticatedUserFn ?? requireMutableAuthenticatedUser;
  const parseArticleUrl =
    deps?.parseAndValidateArticleUrlFn ?? parseAndValidateArticleUrl;
  const fetchArticleHtml = deps?.fetchHtmlFn ?? fetchHtml;
  const extractArticle = deps?.extractFromHtmlFn ?? distillArticle;
  const sanitizeContent = deps?.sanitizeRawContentFn ?? sanitizeRawContent;
  const cleanContent = deps?.cleanSanitizedHtmlFn ?? cleanSanitizedHtml;
  const _info = deps?.infoFn ?? logger.info.bind(logger);
  const _toJsonError = deps?.jsonErrorFn ?? jsonError;
  const toMessage = deps?.toErrorMessageFn ?? toErrorMessage;
  const _respondError = deps?.logAndRespondErrorFn ?? logAndRespondError;
  const isAxiosError = deps?.isAxiosErrorFn ?? axios.isAxiosError;
  const warn = deps?.warnFn ?? logger.warn.bind(logger);
  const errorLog = deps?.errorFn ?? logger.error.bind(logger);
  const shouldUseCache = deps?.shouldUseExtractCacheFn ?? isExtractCacheEnabled;
  const verboseLoggingEnabled = isVerboseLoggingEnabled();
  const context = createExtractRequestContext(request);

  let articleUrl: null | string = null;
  let isLocalPlaceholderRequest = false;
  let useProxy = false;
  let resolvedProxyUrl: string | undefined;

  try {
    const bodyResult =
      await parseJsonBodyOrResponse<ExtractRequestBody>(request);
    if (bodyResult instanceof Response) return bodyResult;

    const requestedUrl = getRequestUrl(bodyResult);
    isLocalPlaceholderRequest = Boolean(
      requestedUrl && getPlaceholderSnapshotPathByArticleUrl(requestedUrl),
    );

    let authUserId: number | undefined;
    if (!isLocalPlaceholderRequest) {
      const authResult = await requireAuth(request, {
        rateLimit: {
          key: "article-extract",
          maxAttempts: CONFIG.RATE_LIMIT_EXTRACT_MAX_REQUESTS,
          windowMs: CONFIG.RATE_LIMIT_EXTRACT_WINDOW_MS,
        },
      });
      if (authResult instanceof Response) {
        return authResult;
      }

      authUserId = authResult.userId;
    }

    useProxy = !isLocalPlaceholderRequest && bodyResult.useProxy === true;
    const distillStrategy: DistillStrategy =
      typeof bodyResult.distillStrategy === "string" &&
      (DISTILL_STRATEGIES as readonly string[]).includes(
        bodyResult.distillStrategy,
      )
        ? (bodyResult.distillStrategy as DistillStrategy)
        : "custom";

    // Resolve the user's proxy URL and TLS settings from DB when proxy is requested
    let allowInsecureTls = false;
    if (useProxy && authUserId) {
      const db = getDb();
      const rows = await db
        .select({
          allowInsecureTls: users.allowInsecureTls,
          proxyPassword: users.proxyPassword,
          proxyUrl: users.proxyUrl,
          proxyUsername: users.proxyUsername,
        })
        .from(users)
        .where(eq(users.id, authUserId))
        .limit(1);
      const row = rows.length === 0 ? null : rows[0];
      const rawProxyUrl = row?.proxyUrl?.trim();
      const baseProxyUrl =
        rawProxyUrl !== undefined &&
        rawProxyUrl !== "" &&
        rawProxyUrl !== "null" &&
        rawProxyUrl !== "undefined"
          ? rawProxyUrl
          : undefined;
      resolvedProxyUrl =
        baseProxyUrl !== undefined &&
        row?.proxyUsername !== null &&
        row?.proxyPassword !== null
          ? injectProxyCredentials(
              baseProxyUrl,
              row?.proxyUsername ?? "",
              row?.proxyPassword ?? "",
            )
          : baseProxyUrl;
      allowInsecureTls = row === null ? false : row.allowInsecureTls;
    }

    const parsedUrl = await parseArticleUrl(requestedUrl);
    if (parsedUrl instanceof Response) return parsedUrl;
    articleUrl = parsedUrl;

    const cachedPayload = getCachedExtractResponse(articleUrl, shouldUseCache);
    if (cachedPayload) {
      return NextResponse.json(cachedPayload);
    }

    const localSnapshot = await readPlaceholderSnapshotHtml(articleUrl);

    if (isLocalPlaceholderRequest && !localSnapshot) {
      return jsonErrorWithReason(
        "Placeholder article snapshot is unavailable",
        404,
        "missing-placeholder-snapshot",
      );
    }

    const html =
      localSnapshot?.html ??
      (await fetchArticleHtml(articleUrl, undefined, {
        allowInsecureTls,
        proxyUrl: resolvedProxyUrl,
        useProxy,
      }));
    const safeUrl = redactUrlForLogs(articleUrl);

    const extractableHtml = preCleanHtml(html);

    const extracted = await extractArticle(
      extractableHtml,
      articleUrl,
      distillStrategy,
      { contentLengthThreshold: 120 },
    );

    const extractedContent = extracted?.content.trim() ?? "";
    const extractedDescription = (extracted?.description ?? "").trim();

    if (!extracted || (!extractedContent && !extractedDescription)) {
      warn(`Article extractor returned no content`, { url: safeUrl });
    }

    const content = resolveExtractedContent(
      extractableHtml,
      html,
      articleUrl,
      extracted,
      sanitizeContent,
      cleanContent,
    );

    if (!content.trim()) {
      warn(`Article content empty after full extraction pipeline`, {
        url: safeUrl,
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
          connectionMode: useProxy ? "proxy" : "direct",
          extractAttemptId: context.extractAttemptId,
          // SECURITY: redact credentials from proxy URL before logging
          proxyAddress: useProxy
            ? resolvedProxyUrl
              ? redactUrlForLogs(resolvedProxyUrl)
              : null
            : null,
          requestId: context.requestId,
          url: safeArticleUrl,
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
        connectionMode: useProxy ? "proxy" : "direct",
        extractAttemptId: context.extractAttemptId,
        // SECURITY: redact credentials from proxy URL before logging
        proxyAddress: useProxy
          ? resolvedProxyUrl
            ? redactUrlForLogs(resolvedProxyUrl)
            : null
          : null,
        requestId: context.requestId,
        url: safeArticleUrl,
      },
    );
    return jsonErrorWithReason(
      ARTICLE_EXTRACTION_ERROR_MESSAGE,
      502,
      toMessage(error),
    );
  }
}

function buildExtractPayload(
  content: string,
  extracted: DistilledArticle | null | undefined,
): ExtractResponsePayload {
  return {
    content,
    source: extracted?.source ?? null,
    title: extracted?.title ?? null,
  };
}

function createExtractRequestContext(
  request: NextRequest,
): ExtractRequestContext {
  const extractAttemptId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const requestId = sanitizeHeaderValue(
    request.headers.get("x-request-id") ??
      request.headers.get("x-correlation-id"),
  );

  return {
    extractAttemptId,
    requestId,
  };
}

function getCachedExtractResponse(
  articleUrl: string,
  shouldUseCache: () => boolean,
): ExtractResponsePayload | null {
  if (!shouldUseCache()) {
    return null;
  }

  const cachedPayload = getCachedExtractPayload(articleUrl);
  if (!cachedPayload) {
    return null;
  }

  return cachedPayload;
}

function getRequestUrl(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  const url = (value as { url?: unknown }).url;
  return typeof url === "string" ? url.trim() : "";
}

function resolveExtractedContent(
  extractableHtml: string,
  originalHtml: string,
  articleUrl: string,
  extracted: DistilledArticle | null | undefined,
  sanitizeContent: (rawContent: string) => string,
  cleanContent: (sanitizedContent: string, articleUrl: string) => string,
): string {
  // 1. Sanitize the extracted article body container (if found)
  const extractedContent = extracted?.content.trim() ?? "";
  const extractedDescription = (extracted?.description ?? "").trim();
  const rawContent = extractedContent || extractedDescription;

  const sanitizedContent = sanitizeContent(rawContent);

  let content = cleanContent(sanitizedContent, articleUrl);

  // 2. Fall back to direct sanitize of entire pre-cleaned page
  if (!content.trim()) {
    const directlySanitized = sanitizeContent(extractableHtml);

    const directlyCleaned = cleanContent(directlySanitized, articleUrl);
    const isReadable =
      directlyCleaned.trim() && hasReadableArticleBody(directlyCleaned);
    if (isReadable) content = directlyCleaned;
  }

  // 3. Fall back to og:image + og:description metadata
  if (!content.trim()) {
    const metadataFallbackContent =
      buildMetadataImageFallbackHtml(originalHtml);

    if (metadataFallbackContent) {
      const fallbackCleaned = cleanContent(metadataFallbackContent, articleUrl);
      if (fallbackCleaned.trim()) content = fallbackCleaned;
    }
  }

  return content;
}

function sanitizeHeaderValue(value: null | string, maxLen = 64): null | string {
  if (!value) return null;
  // Strip non-ASCII and control characters; truncate to prevent log bloat.
  return value.replace(/[^\x20-\x7E]/g, "").slice(0, maxLen) || null;
}
