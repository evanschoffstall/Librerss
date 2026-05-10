import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import type {
  ExtractPostDeps,
  ExtractResolvedUserProxy,
  requireMutableAuthenticatedUser,
  RouteHandlerContext,
} from "./handler-dependencies";
import type {
  cleanSanitizedHtml,
  distillArticle,
  DistillStrategy,
  ExtractRequestContext,
  ExtractResponsePayload,
  fetchHtml,
  logger,
  parseAndValidateArticleUrl,
  sanitizeRawContent,
  toErrorMessage,
} from "./payload-primitives";

import {
  assertExtractableArticleHtml,
  createExtractPayload,
  createExtractRequestContext,
  EarlyResponseError,
  getCachedExtractResponse,
  getRequestUrl,
  resolveDistillStrategy,
  resolveExtractedContent,
  respondToUpstreamExtractError,
  warnOnEmptyExtraction,
} from "./content-resolution";
import {
  createExtractRuntimeDeps,
  ServerServiceError,
} from "./handler-dependencies";
import {
  ARTICLE_EXTRACTION_ERROR_MESSAGE,
  CONFIG,
  decodePossiblyCompressedText,
  decodeTextBody,
  DISTILL_STRATEGIES,
  getCachedExtractPayload,
  getPlaceholderSnapshotPathByArticleUrl,
  HttpCloakUpstreamError,
  jsonErrorWithReason,
  parseJsonBodyOrResponse,
  preCleanHtml,
  readPlaceholderSnapshotHtml,
  redactUrlForLogs,
  setCachedExtractPayload,
  tryGetUrlHostname,
} from "./payload-primitives";

/**
 * Describes the extract request body.
 */
interface ExtractRequestBody {
  distillStrategy?: string;
  url?: string;
  useProxy?: boolean;
}

/**
 * Describes the extract request resolution.
 */
interface ExtractRequestResolution {
  allowInsecureTls: boolean;
  articleUrl: string;
  cachedPayload: ExtractResponsePayload | null;
  distillStrategy: DistillStrategy;
  isLocalPlaceholderRequest: boolean;
  resolvedProxyUrl: string | undefined;
  useProxy: boolean;
}

/**
 * Describes the extract runtime deps.
 */
interface ExtractRuntimeDeps {
  cleanContent: typeof cleanSanitizedHtml;
  errorLog: typeof logger.error;
  extractArticle: typeof distillArticle;
  fetchArticleHtml: typeof fetchHtml;
  parseArticleUrl: typeof parseAndValidateArticleUrl;
  requireAuth: typeof requireMutableAuthenticatedUser;
  resolveUserProxy: (userId: number) => Promise<ExtractResolvedUserProxy>;
  sanitizeContent: typeof sanitizeRawContent;
  shouldUseCache: () => boolean;
  toMessage: typeof toErrorMessage;
  verboseLoggingEnabled: boolean;
  warn: typeof logger.warn;
}

/**
 * Return the hostname.
 * @param url - The url.
 * @returns The hostname.
 */
export function getHostname(url: string): string {
  return tryGetUrlHostname(url) ?? "";
}

/**
 * Process the handle article extract post.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The handle article extract post.
 */
export async function handleArticleExtractPost(
  request: NextRequest,
  depsOrContext: ExtractPostDeps | RouteHandlerContext = {},
): Promise<Response> {
  const deps = createExtractRuntimeDeps(depsOrContext);
  const context = createExtractRequestContext(request);
  let requestResolution: ExtractRequestResolution | null = null;

  try {
    requestResolution = await resolveExtractRequest(request, deps);
    if (requestResolution.cachedPayload) {
      return NextResponse.json(requestResolution.cachedPayload);
    }

    const payload = await buildExtractPayload(requestResolution, deps);
    return NextResponse.json(payload);
  } catch (error) {
    return handleExtractFailure(error, context, deps, requestResolution);
  }
}

/**
 * Build the extract payload.
 * @param requestResolution - The request resolution.
 * @param deps - The deps.
 * @returns The extract payload.
 */
async function buildExtractPayload(
  requestResolution: ExtractRequestResolution,
  deps: ExtractRuntimeDeps,
): Promise<ExtractResponsePayload> {
  const rawHtml = await resolveArticleHtml(requestResolution, deps);
  const html =
    typeof rawHtml === "string"
      ? await decodePossiblyCompressedText(rawHtml, {
          maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
        })
      : await decodeTextBody(rawHtml, undefined, {
          maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
        });
  assertExtractableArticleHtml(html);
  const safeUrl = redactUrlForLogs(requestResolution.articleUrl);
  const extractableHtml = preCleanHtml(html);
  const extracted = await deps.extractArticle(
    extractableHtml,
    requestResolution.articleUrl,
    requestResolution.distillStrategy,
    { contentLengthThreshold: 120 },
  );

  warnOnEmptyExtraction(extracted, deps.warn, safeUrl);

  const content = resolveExtractedContent(
    extractableHtml,
    html,
    requestResolution.articleUrl,
    extracted,
    deps.sanitizeContent,
    deps.cleanContent,
  );

  if (!content.trim()) {
    deps.warn("Article content empty after full extraction pipeline", {
      url: safeUrl,
    });
  }

  const payload = createExtractPayload(content, extracted);
  if (payload.content.trim() && deps.shouldUseCache()) {
    setCachedExtractPayload(requestResolution.articleUrl, payload);
  }

  return payload;
}

/**
 * Process the handle extract failure.
 * @param error - The error.
 * @param context - The context used to process the handle extract failure.
 * @param deps - The deps.
 * @param requestResolution - The request resolution.
 * @returns The handle extract failure.
 */
function handleExtractFailure(
  error: unknown,
  context: ExtractRequestContext,
  deps: ExtractRuntimeDeps,
  requestResolution: ExtractRequestResolution | null,
): Response {
  if (error instanceof EarlyResponseError) {
    return error.response;
  }

  const safeArticleUrl = requestResolution?.articleUrl
    ? redactUrlForLogs(requestResolution.articleUrl)
    : null;
  const urlSuffix = safeArticleUrl ? ` for ${safeArticleUrl}` : "";

  if (error instanceof HttpCloakUpstreamError) {
    return respondToUpstreamExtractError(error, context, {
      errorLog: deps.errorLog,
      proxyUrl: requestResolution?.resolvedProxyUrl,
      safeArticleUrl,
      toMessage: deps.toMessage,
      useProxy: requestResolution?.useProxy === true,
      verboseLoggingEnabled: deps.verboseLoggingEnabled,
    });
  }

  deps.errorLog(
    `Returning 502 Bad Gateway — article extract upstream processing failed${urlSuffix}: ${deps.toMessage(error)}`,
    {
      connectionMode: requestResolution?.useProxy ? "proxy" : "direct",
      extractAttemptId: context.extractAttemptId,
      proxyAddress: requestResolution?.useProxy
        ? requestResolution.resolvedProxyUrl
          ? redactUrlForLogs(requestResolution.resolvedProxyUrl)
          : null
        : null,
      requestId: context.requestId,
      url: safeArticleUrl,
    },
  );

  return jsonErrorWithReason(
    ARTICLE_EXTRACTION_ERROR_MESSAGE,
    502,
    deps.toMessage(error),
  );
}

/**
 * Resolve the article html.
 * @param requestResolution - The request resolution.
 * @param deps - The deps.
 * @returns The article html.
 */
async function resolveArticleHtml(
  requestResolution: ExtractRequestResolution,
  deps: ExtractRuntimeDeps,
): Promise<Buffer | string> {
  const localSnapshot = await readPlaceholderSnapshotHtml(
    requestResolution.articleUrl,
  );
  if (requestResolution.isLocalPlaceholderRequest && !localSnapshot) {
    throw new EarlyResponseError(
      jsonErrorWithReason(
        "Placeholder article snapshot is unavailable",
        404,
        "missing-placeholder-snapshot",
      ),
    );
  }

  return (
    localSnapshot?.html ??
    (await deps.fetchArticleHtml(requestResolution.articleUrl, undefined, {
      allowInsecureTls: requestResolution.allowInsecureTls,
      proxyUrl: requestResolution.resolvedProxyUrl,
      useProxy: requestResolution.useProxy,
    }))
  );
}

/**
 * Resolve the authenticated user id.
 * @param request - The request.
 * @param requireAuth - The require auth.
 * @param isLocalPlaceholderRequest - Whether is local placeholder request.
 * @returns The authenticated user id.
 */
async function resolveAuthenticatedUserId(
  request: NextRequest,
  requireAuth: typeof requireMutableAuthenticatedUser,
  isLocalPlaceholderRequest: boolean,
): Promise<number | undefined> {
  if (isLocalPlaceholderRequest) {
    return undefined;
  }

  const authResult = await requireAuth(request, {
    rateLimit: {
      key: "article-extract",
      maxAttempts: CONFIG.RATE_LIMIT_EXTRACT_MAX_REQUESTS,
      windowMs: CONFIG.RATE_LIMIT_EXTRACT_WINDOW_MS,
    },
  });
  if (authResult instanceof Response) {
    throw new EarlyResponseError(authResult);
  }

  return authResult.userId;
}

/**
 * Resolve the extract request.
 * @param request - The request.
 * @param deps - The deps.
 * @returns The extract request.
 */
async function resolveExtractRequest(
  request: NextRequest,
  deps: ExtractRuntimeDeps,
): Promise<ExtractRequestResolution> {
  const bodyResult = await parseJsonBodyOrResponse<ExtractRequestBody>(request);
  if (bodyResult instanceof Response) {
    throw new EarlyResponseError(bodyResult);
  }

  const requestedUrl = getRequestUrl(bodyResult);
  const isLocalPlaceholderRequest = Boolean(
    requestedUrl && getPlaceholderSnapshotPathByArticleUrl(requestedUrl),
  );
  const authUserId = await resolveAuthenticatedUserId(
    request,
    deps.requireAuth,
    isLocalPlaceholderRequest,
  );
  const useProxy = !isLocalPlaceholderRequest && bodyResult.useProxy === true;
  const distillStrategy = resolveSupportedDistillStrategy(
    bodyResult.distillStrategy,
  );
  const { allowInsecureTls, resolvedProxyUrl } = await resolveProxyRequest(
    authUserId,
    deps.resolveUserProxy,
    useProxy,
  );
  const parsedUrl = await deps.parseArticleUrl(requestedUrl);
  if (parsedUrl instanceof Response) {
    throw new EarlyResponseError(parsedUrl);
  }

  return {
    allowInsecureTls,
    articleUrl: parsedUrl,
    cachedPayload: getCachedExtractResponse(
      parsedUrl,
      deps.shouldUseCache,
      getCachedExtractPayload,
    ),
    distillStrategy,
    isLocalPlaceholderRequest,
    resolvedProxyUrl,
    useProxy,
  };
}

/**
 * Resolve the proxy request.
 * @param authUserId - The auth user id.
 * @param resolveUserProxy - The callback that user proxy.
 * @param useProxy - The proxy.
 * @returns The proxy request.
 */
async function resolveProxyRequest(
  authUserId: number | undefined,
  resolveUserProxy: (userId: number) => Promise<ExtractResolvedUserProxy>,
  useProxy: boolean,
): Promise<{
  allowInsecureTls: boolean;
  resolvedProxyUrl: string | undefined;
}> {
  if (!useProxy || !authUserId) {
    return { allowInsecureTls: false, resolvedProxyUrl: undefined };
  }

  try {
    const resolved = await resolveUserProxy(authUserId);

    return {
      allowInsecureTls: resolved.allowInsecureTls,
      resolvedProxyUrl: resolved.proxyUrl,
    };
  } catch (error) {
    if (
      error instanceof ServerServiceError &&
      error.reason === "proxy-password-unreadable"
    ) {
      throw new EarlyResponseError(
        jsonErrorWithReason(error.message, error.status, error.reason),
      );
    }

    throw error;
  }
}

/**
 * Resolve the supported distill strategy.
 * @param strategy - The strategy.
 * @returns The supported distill strategy.
 */
function resolveSupportedDistillStrategy(strategy: unknown): DistillStrategy {
  return resolveDistillStrategy(
    strategy,
    DISTILL_STRATEGIES as readonly string[],
  );
}
