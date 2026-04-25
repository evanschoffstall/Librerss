import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { CONFIG, logger } from "@/lib";
import {
  jsonErrorWithReason,
  parseJsonObjectBodyOrResponse,
} from "@/lib/api/http";
import { type ArticleFilter, isArticleFilter } from "@/lib/core";
import { fetchAndCacheFeedArticlesBatch } from "@/lib/core/server";
import { getDb } from "@/lib/db";
import { resolveUserProxy } from "@/lib/outbound-proxy";
import {
  type BatchRequestBody,
  type BatchRequestCompletedOptions,
  type BatchRequestState,
  type BatchUrlDescriptor,
  buildBatchFetchRequestOptions,
  buildBatchFetchResults,
  buildBatchIntent,
  buildInvalidBatchResultResponse,
  createBatchSuccessResponse,
  ensureBatchUrlCount,
  logBatchRequestReceivedWhenEnabled,
  resolveNormalizedBatchUrls,
  serverApi,
  validateBatchRequestState,
} from "@/lib/server";
import {
  normalizeDistinctUrlList,
  normalizeFeedUrl,
  parseDateOrNull,
} from "@/lib/utils";

export interface BatchRouteDeps {
  fetchAndCacheFeedArticlesBatchFn?: typeof fetchAndCacheFeedArticlesBatch;
  getDbFn?: typeof getDb;
  logAndRespondErrorFn?: typeof serverApi.logAndRespondError;
  requireMutableAuthenticatedUserFn?: typeof serverApi.requireMutableAuthenticatedUser;
  resolveUserProxyFn?: typeof resolveUserProxy;
}

interface BatchFetchExecutionResult {
  cachedCount: number;
  cooldownLimitedCount: number;
  lastFetchedByUrl: Awaited<
    ReturnType<typeof fetchAndCacheFeedArticlesBatch>
  >["lastFetchedByUrl"];
  refreshedCount: number;
  resolution: Awaited<
    ReturnType<typeof fetchAndCacheFeedArticlesBatch>
  >["resolution"];
  results: { articles: unknown[]; ok: boolean }[];
  upstreamErrors: Awaited<
    ReturnType<typeof fetchAndCacheFeedArticlesBatch>
  >["errors"];
}

interface ResolvedBatchRequestState extends BatchRequestState {
  user: Exclude<
    Awaited<ReturnType<typeof serverApi.requireMutableAuthenticatedUser>>,
    Response
  >;
}

interface ResolvedBatchRequestUrls {
  invalidUrlCount: number;
  normalizedUrls: string[];
  requestUrls: BatchUrlDescriptor[];
}

const { resolveRouteHandlerDeps, ServerServiceError: ServerServiceErrorCtor } =
  serverApi;

interface BatchExecutionPreflightOptions {
  diagnosticsEnabled: boolean;
  requestState: ResolvedBatchRequestState;
}
interface BatchIntentStateOptions {
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  skipRefresh: boolean;
  urls: string[];
}

interface BatchProxyTransportOptions {
  resolveUserProxyForRoute: NonNullable<
    ReturnType<typeof resolveBatchRouteDependencies>["resolveUserProxyForRoute"]
  >;
  userId: number;
}
interface BatchRequestStateForPostOptions {
  deps: BatchRouteDeps;
  request: NextRequest;
}

interface BatchRequestUrlsOptions {
  diagnosticsEnabled: boolean;
  urls: string[];
  userId: number;
}
interface BatchSuccessResponseOptionsOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  batchFetchResult: BatchFetchExecutionResult;
  diagnosticsEnabled: boolean;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  intent: string;
  invalidUrlCount: number;
  normalizedUrls: string[];
  requestSource: string;
  requestStartedAt: number;
  searchTerm: string | undefined;
  skipRefresh: boolean;
  userId: number;
}

interface ExecuteBatchFetchOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  deps: BatchRouteDeps;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  knownLastFetchedAtByUrl: Map<string, Date>;
  normalizedUrls: string[];
  requestSource: string;
  requestUrls: BatchUrlDescriptor[];
  searchTerm: string | undefined;
  skipRefresh: boolean;
  userId: number;
}

interface HandleResolvedBatchPostRequestOptions {
  deps: BatchRouteDeps;
  diagnosticsEnabled: boolean;
  requestStartedAt: number;
  requestState: ResolvedBatchRequestState;
}

/**
 * Render the post component.
 * @param request - The request.
 * @param depsOrContext - The deps or context.
 * @returns The rendered post component.
 */
export async function POST(
  request: NextRequest,
  depsOrContext: BatchRouteDeps | serverApi.RouteHandlerContext = {},
) {
  const deps = resolveRouteHandlerDeps<BatchRouteDeps>(depsOrContext);
  const requestStartedAt = Date.now();
  try {
    const diagnosticsEnabled = CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED;
    const requestState = await resolveBatchRequestStateForPost({
      deps,
      request,
    });
    if (requestState instanceof Response) return requestState;
    return await handleResolvedBatchPostRequest({
      deps,
      diagnosticsEnabled,
      requestStartedAt,
      requestState,
    });
  } catch (error) {
    if (
      error instanceof ServerServiceErrorCtor &&
      error.reason === "proxy-password-unreadable"
    ) {
      return jsonErrorWithReason(error.message, error.status, error.reason);
    }

    return (deps.logAndRespondErrorFn ?? serverApi.logAndRespondError)(
      "Feed batch fetch error",
      error,
    );
  }
}

/**
 * Build the batch success response options.
 * @param options - The options used to build the batch success response options.
 * @returns The batch success response options.
 */
function buildBatchSuccessResponseOptions(
  options: BatchSuccessResponseOptionsOptions,
): BatchRequestCompletedOptions {
  return {
    articleFilter: options.articleFilter,
    articleLimit: options.articleLimit,
    cachedCount: options.batchFetchResult.cachedCount,
    cooldownLimitedCount: options.batchFetchResult.cooldownLimitedCount,
    diagnosticsEnabled: options.diagnosticsEnabled,
    forceRefresh: options.forceRefresh,
    forceResolveUpstream: options.forceResolveUpstream,
    intent: options.intent,
    invalidUrlCount: options.invalidUrlCount,
    normalizedUrls: options.normalizedUrls,
    refreshedCount: options.batchFetchResult.refreshedCount,
    requestSource: options.requestSource,
    requestStartedAt: options.requestStartedAt,
    resolution: options.batchFetchResult.resolution,
    results: options.batchFetchResult.results,
    searchTerm: options.searchTerm,
    skipRefresh: options.skipRefresh,
    upstreamErrors: options.batchFetchResult.upstreamErrors,
    userId: options.userId,
  };
}

/**
 * Process the execute batch fetch.
 * @param options - The options used to process the execute batch fetch.
 * @returns The execute batch fetch.
 */
async function executeBatchFetch(
  options: ExecuteBatchFetchOptions,
): Promise<BatchFetchExecutionResult> {
  const routeDeps = resolveBatchRouteDependencies(options.deps);
  const batchResponse = await routeDeps.fetchAndCacheFeedArticlesBatchForRoute(
    routeDeps.db,
    options.userId,
    options.normalizedUrls,
    buildBatchFetchRequestOptions({
      articleFilter: options.articleFilter,
      articleLimit: options.articleLimit,
      forceRefresh: options.forceRefresh,
      forceResolveUpstream: options.forceResolveUpstream,
      knownLastFetchedAtByUrl: options.knownLastFetchedAtByUrl,
      requestSource: options.requestSource,
      /**
       * Resolves the proxy transport to use for the current batch request.
       * @returns The proxy transport promise for the current user.
       */
      resolveProxyTransport: () =>
        resolveBatchProxyTransport({
          resolveUserProxyForRoute: routeDeps.resolveUserProxyForRoute,
          userId: options.userId,
        }),
      searchTerm: options.searchTerm,
      skipRefresh: options.skipRefresh,
    }),
  );

  return {
    cachedCount: batchResponse.cachedCount,
    cooldownLimitedCount: batchResponse.cooldownLimitedCount,
    lastFetchedByUrl: batchResponse.lastFetchedByUrl,
    refreshedCount: batchResponse.refreshedCount,
    resolution: batchResponse.resolution,
    results: buildBatchFetchResults({
      requestUrls: options.requestUrls,
      response: batchResponse,
    }),
    upstreamErrors: batchResponse.errors,
  };
}

/**
 * Process the handle resolved batch post request.
 * @param options - The options used to process the handle resolved batch post request.
 * @returns The handle resolved batch post request.
 */
async function handleResolvedBatchPostRequest(
  options: HandleResolvedBatchPostRequestOptions,
) {
  const {
    articleFilter,
    articleLimit,
    forceRefresh,
    forceResolveUpstream,
    knownLastFetchedAtByUrl,
    requestSource,
    searchTerm,
    skipRefresh,
    user,
  } = options.requestState;
  const batchExecutionPreflight = resolveBatchExecutionPreflight({
    diagnosticsEnabled: options.diagnosticsEnabled,
    requestState: options.requestState,
  });
  if (batchExecutionPreflight instanceof Response) {
    return batchExecutionPreflight;
  }

  const { intent, invalidUrlCount, normalizedUrls, requestUrls } =
    batchExecutionPreflight;
  const batchFetchResult = await executeBatchFetch({
    articleFilter,
    articleLimit,
    deps: options.deps,
    forceRefresh,
    forceResolveUpstream,
    knownLastFetchedAtByUrl,
    normalizedUrls,
    requestSource,
    requestUrls,
    searchTerm,
    skipRefresh,
    userId: user.userId,
  });

  return createBatchSuccessResponse(
    buildBatchSuccessResponseOptions({
      articleFilter,
      articleLimit,
      batchFetchResult,
      diagnosticsEnabled: options.diagnosticsEnabled,
      forceRefresh,
      forceResolveUpstream,
      intent,
      invalidUrlCount,
      normalizedUrls,
      requestSource,
      requestStartedAt: options.requestStartedAt,
      searchTerm,
      skipRefresh,
      userId: user.userId,
    }),
  );
} /**
 * Parse the article filter.
 * @param value - The value.
 * @returns The article filter.
 */
function parseArticleFilter(value: unknown): ArticleFilter | Response {
  if (value === undefined) {
    return "all";
  }

  if (!isArticleFilter(value)) {
    return NextResponse.json(
      {
        error: "articleFilter must be one of all, unread, read, or starred",
      },
      { status: 400 },
    );
  }

  return value;
}

/**
 * Parse the article limit.
 * @param value - The value.
 * @returns The article limit.
 */
function parseArticleLimit(value: unknown): number | Response | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return NextResponse.json(
      {
        error: "articleLimit must be a positive integer when provided",
      },
      { status: 400 },
    );
  }

  return Math.min(value, CONFIG.MAX_ALL_ARTICLES_LIMIT);
} /**
 * Parse the force resolve upstream.
 * @param value - The value.
 * @returns The force resolve upstream.
 */
function parseForceResolveUpstream(value: unknown): boolean | Response {
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "boolean") {
    return NextResponse.json(
      {
        error: "forceResolveUpstream must be a boolean",
      },
      { status: 400 },
    );
  }

  return value;
}

/**
 * Parse the known last fetched at by url.
 * @param value - The value.
 * @returns The known last fetched at by url.
 */
function parseKnownLastFetchedAtByUrl(
  value: unknown,
): Map<string, Date> | Response {
  if (value === undefined) {
    return new Map();
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return NextResponse.json(
      {
        error:
          "knownLastFetchedAtByUrl must be an object mapping URLs to ISO dates",
      },
      { status: 400 },
    );
  }

  const parsedEntries = Object.entries(value as Record<string, unknown>).map(
    ([url, rawDate]) => {
      const parsedDate = parseDateOrNull(rawDate);
      return parsedDate ? ([url, parsedDate] as const) : null;
    },
  );

  if (parsedEntries.some((entry) => entry === null)) {
    return NextResponse.json(
      {
        error: "knownLastFetchedAtByUrl values must be valid ISO date strings",
      },
      { status: 400 },
    );
  }

  return new Map(
    parsedEntries.filter(
      (entry): entry is readonly [string, Date] => entry !== null,
    ),
  );
} /**
 * Parse the search term.
 * @param value - The value.
 * @returns The search term.
 */
function parseSearchTerm(value: unknown): Response | string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return NextResponse.json(
      {
        error: "searchTerm must be a string when provided",
      },
      { status: 400 },
    );
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return undefined;
  }

  if (normalizedValue.length > CONFIG.MAX_ARTICLE_TITLE_LENGTH) {
    return NextResponse.json(
      {
        error: `searchTerm must be at most ${CONFIG.MAX_ARTICLE_TITLE_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  return normalizedValue;
}

/**
 * Resolve the batch execution preflight.
 * @param options - The options used to resolve the batch execution preflight.
 * @returns The batch execution preflight.
 */
function resolveBatchExecutionPreflight(
  options: BatchExecutionPreflightOptions,
) {
  const {
    articleFilter,
    articleLimit,
    forceRefresh,
    forceResolveUpstream,
    requestSource,
    searchTerm,
    skipRefresh,
    urls,
    user,
  } = options.requestState;

  logBatchRequestReceivedWhenEnabled({
    articleFilter,
    articleLimit,
    diagnosticsEnabled: options.diagnosticsEnabled,
    forceRefresh,
    forceResolveUpstream,
    requestSource,
    searchTerm,
    skipRefresh,
    urls,
    userId: user.userId,
  });

  const batchIntentState = resolveBatchIntentState({
    forceRefresh,
    forceResolveUpstream,
    skipRefresh,
    urls,
  });
  if (batchIntentState instanceof Response) {
    return batchIntentState;
  }

  const resolvedRequestUrls = resolveBatchRequestUrls({
    diagnosticsEnabled: options.diagnosticsEnabled,
    urls,
    userId: user.userId,
  });
  if (resolvedRequestUrls instanceof Response) {
    return resolvedRequestUrls;
  }

  return {
    ...resolvedRequestUrls,
    intent: batchIntentState.intent,
  };
} /**
 * Resolve the batch intent state.
 * @param options - The options used to resolve the batch intent state.
 * @returns The batch intent state.
 */
function resolveBatchIntentState(options: BatchIntentStateOptions) {
  const intent = buildBatchIntent({
    forceRefresh: options.forceRefresh,
    forceResolveUpstream: options.forceResolveUpstream,
    skipRefresh: options.skipRefresh,
  });

  if (options.urls.length > 0) {
    return { intent };
  }

  logger.info(`Batch [0 feeds]: client=${intent} | empty request`);
  return NextResponse.json([]);
}

/**
 * Resolve the batch proxy transport.
 * @param options - The options used to resolve the batch proxy transport.
 * @returns The batch proxy transport.
 */
async function resolveBatchProxyTransport(options: BatchProxyTransportOptions) {
  let resolvedProxy;

  try {
    resolvedProxy = await options.resolveUserProxyForRoute(options.userId);
  } catch (error) {
    if (
      error instanceof ServerServiceErrorCtor &&
      error.reason === "proxy-password-unreadable"
    ) {
      logger.warn(
        "Feed batch refresh bypassed unreadable proxy credentials and retried direct egress",
        {
          userId: options.userId,
        },
      );
      return {
        allowInsecureTls: false,
        proxyUrl: undefined,
      };
    }

    throw error;
  }

  return {
    allowInsecureTls: resolvedProxy.allowInsecureTls,
    proxyUrl: resolvedProxy.proxyUrl,
  };
} /**
 * Resolve the batch request state for post.
 * @param options - The options used to resolve the batch request state for post.
 * @returns The batch request state for post.
 */
async function resolveBatchRequestStateForPost(
  options: BatchRequestStateForPostOptions,
): Promise<ResolvedBatchRequestState | Response> {
  const requireMutableAuthenticatedUserForRoute =
    options.deps.requireMutableAuthenticatedUserFn ??
    serverApi.requireMutableAuthenticatedUser;
  const user = await requireMutableAuthenticatedUserForRoute(options.request, {
    rateLimit: {
      key: "feed-batch",
      maxAttempts: CONFIG.RATE_LIMIT_FEED_BATCH_MAX_REQUESTS,
      scope: "user",
      windowMs: CONFIG.RATE_LIMIT_FEED_BATCH_WINDOW_MS,
    },
  });
  if (user instanceof Response) {
    return user;
  }

  const bodyOrResponse = await parseJsonObjectBodyOrResponse(options.request);
  if (bodyOrResponse instanceof Response) {
    return bodyOrResponse;
  }

  const body = bodyOrResponse as BatchRequestBody;
  const requestState = validateBatchRequestState({
    body,
    normalizeDistinctUrlList,
    parseArticleFilter,
    parseArticleLimit,
    parseForceResolveUpstream,
    parseKnownLastFetchedAtByUrl,
    parseSearchTerm,
  });

  return requestState instanceof Response
    ? requestState
    : { ...requestState, user };
}

/**
 * Resolve the batch request urls.
 * @param options - The options used to resolve the batch request urls.
 * @returns The batch request urls.
 */
function resolveBatchRequestUrls(
  options: BatchRequestUrlsOptions,
): ResolvedBatchRequestUrls | Response {
  const maxUrlResponse = ensureBatchUrlCount(options.urls);
  if (maxUrlResponse) {
    return maxUrlResponse;
  }

  const resolvedUrls = resolveNormalizedBatchUrls({
    normalizeFeedUrl,
    urls: options.urls,
  });
  if (resolvedUrls.normalizedUrls.length === 0) {
    return buildInvalidBatchResultResponse({
      diagnosticsEnabled: options.diagnosticsEnabled,
      invalidUrlCount: resolvedUrls.invalidUrlCount,
      requestUrls: resolvedUrls.requestUrls,
      userId: options.userId,
    });
  }

  return resolvedUrls;
}

/**
 * Resolve the batch route dependencies.
 * @param deps - The deps.
 * @returns The batch route dependencies.
 */
function resolveBatchRouteDependencies(deps: BatchRouteDeps) {
  return {
    db: (deps.getDbFn ?? getDb)(),
    fetchAndCacheFeedArticlesBatchForRoute:
      deps.fetchAndCacheFeedArticlesBatchFn ?? fetchAndCacheFeedArticlesBatch,
    resolveUserProxyForRoute: deps.resolveUserProxyFn ?? resolveUserProxy,
  };
}
