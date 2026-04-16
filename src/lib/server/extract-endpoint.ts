import { NextRequest, NextResponse } from "next/server";

import {
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
  type ExtractPostDeps,
  type ExtractResolvedUserProxy,
  requireMutableAuthenticatedUser,
  type RouteHandlerContext,
  ServerServiceError,
} from "./handler-dependencies";
import {
  ARTICLE_EXTRACTION_ERROR_MESSAGE,
  cleanSanitizedHtml,
  CONFIG,
  decodePossiblyCompressedText,
  decodeTextBody,
  DISTILL_STRATEGIES,
  distillArticle,
  type DistillStrategy,
  type ExtractRequestContext,
  type ExtractResponsePayload,
  fetchHtml,
  getCachedExtractPayload,
  getPlaceholderSnapshotPathByArticleUrl,
  HttpCloakUpstreamError,
  jsonErrorWithReason,
  logger,
  parseAndValidateArticleUrl,
  parseJsonBodyOrResponse,
  preCleanHtml,
  readPlaceholderSnapshotHtml,
  redactUrlForLogs,
  sanitizeRawContent,
  setCachedExtractPayload,
  toErrorMessage,
  tryGetUrlHostname,
} from "./payload-primitives";

interface ExtractRequestBody {
  distillStrategy?: string;
  url?: string;
  useProxy?: boolean;
}

interface ExtractRequestResolution {
  allowInsecureTls: boolean;
  articleUrl: string;
  cachedPayload: ExtractResponsePayload | null;
  distillStrategy: DistillStrategy;
  isLocalPlaceholderRequest: boolean;
  resolvedProxyUrl: string | undefined;
  useProxy: boolean;
}

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

export function getHostname(url: string): string {
  return tryGetUrlHostname(url) ?? "";
}

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
  if (deps.shouldUseCache()) {
    setCachedExtractPayload(requestResolution.articleUrl, payload);
  }

  return payload;
}

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

function resolveSupportedDistillStrategy(strategy: unknown): DistillStrategy {
  return resolveDistillStrategy(
    strategy,
    DISTILL_STRATEGIES as readonly string[],
  );
}
