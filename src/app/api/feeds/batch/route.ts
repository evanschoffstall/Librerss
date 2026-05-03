import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { CONFIG, logger } from "@/lib";
import {
  jsonErrorWithReason,
  parseJsonObjectBodyOrResponse,
} from "@/lib/api/http";
import {
  type ArticleFilter,
  type ArticleSortOrder,
  isArticleFilter,
  isArticleSortOrder,
} from "@/lib/core";
import { fetchAndCacheFeedArticlesBatch } from "@/lib/core/server";
import { getDb } from "@/lib/db";
import { resolveUserProxy } from "@/lib/outbound-proxy";
import {
  type BatchFetchExecutionResult,
  type BatchRequestBody,
  type BatchRequestState,
  type BatchUrlDescriptor,
  buildBatchFetchExecutionResult,
  buildBatchFetchRequestOptions,
  buildBatchIntent,
  buildBatchSuccessResponseOptions,
  buildInvalidBatchResultResponse,
  createBatchSuccessResponse,
  ensureBatchUrlCount,
  executeBatchBeforeRouteDeadline,
  executeIsolatedFeedBatchFallback,
  logBatchRequestReceivedWhenEnabled,
  parseBatchSearchTerm,
  resolveNormalizedBatchUrls,
  serverApi,
  validateBatchRequestState,
} from "@/lib/server";
import {
  normalizeDistinctUrlList,
  normalizeFeedUrl,
  parseDateOrNull,
} from "@/lib/utils";

/**
 * Describes the batch route deps.
 */
export interface BatchRouteDeps {
  clearTimeoutFn?: typeof clearTimeout;
  fetchAndCacheFeedArticlesBatchFn?: typeof fetchAndCacheFeedArticlesBatch;
  getDbFn?: typeof getDb;
  logAndRespondErrorFn?: typeof serverApi.logAndRespondError;
  nowFn?: () => number;
  requireMutableAuthenticatedUserFn?: typeof serverApi.requireMutableAuthenticatedUser;
  resolveUserProxyFn?: typeof resolveUserProxy;
  setTimeoutFn?: typeof setTimeout;
}

/**
 * Describes the resolved batch request state.
 */
interface ResolvedBatchRequestState extends BatchRequestState {
  user: Exclude<
    Awaited<ReturnType<typeof serverApi.requireMutableAuthenticatedUser>>,
    Response
  >;
}

/**
 * Describes the resolved batch request URLs.
 */
interface ResolvedBatchRequestUrls {
  invalidUrlCount: number;
  normalizedUrls: string[];
  requestUrls: BatchUrlDescriptor[];
}

const { resolveRouteHandlerDeps, ServerServiceError: ServerServiceErrorCtor } =
  serverApi;

/**
 * Describes the options for batch execution preflight.
 */
interface BatchExecutionPreflightOptions {
  diagnosticsEnabled: boolean;
  requestState: ResolvedBatchRequestState;
}

/**
 * Describes the options for batch intent state.
 */
interface BatchIntentStateOptions {
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  skipRefresh: boolean;
  urls: string[];
}

/**
 * Describes the options for batch proxy transport.
 */
interface BatchProxyTransportOptions {
  resolveUserProxyForRoute: NonNullable<
    ReturnType<typeof resolveBatchRouteDependencies>["resolveUserProxyForRoute"]
  >;
  userId: number;
}

/**
 * Describes the options for batch request state for post.
 */
interface BatchRequestStateForPostOptions {
  deps: BatchRouteDeps;
  request: NextRequest;
}

/**
 * Describes the options for batch request URLs.
 */
interface BatchRequestUrlsOptions {
  diagnosticsEnabled: boolean;
  urls: string[];
  userId: number;
}

/**
 * Describes the options for execute batch fetch.
 */
interface ExecuteBatchFetchOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  articleSortOrder: ArticleSortOrder;
  deps: BatchRouteDeps;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  knownLastFetchedAtByUrl: Map<string, Date>;
  normalizedUrls: string[];
  requestSource: string;
  requestStartedAt: number;
  requestUrls: BatchUrlDescriptor[];
  searchTerm: string | undefined;
  skipRefresh: boolean;
  userId: number;
}

/**
 * Describes the options for handle resolved batch post request.
 */
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
  const requestStartedAt = (deps.nowFn ?? Date.now)();
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
 * Process the execute batch fetch.
 * @param options - The options used to process the execute batch fetch.
 * @returns The execute batch fetch.
 */
async function executeBatchFetch(
  options: ExecuteBatchFetchOptions,
): Promise<BatchFetchExecutionResult> {
  const routeDeps = resolveBatchRouteDependencies(options.deps);
  const batchFetchOptions = buildBatchFetchRequestOptions({
    articleFilter: options.articleFilter,
    articleLimit: options.articleLimit,
    articleSortOrder: options.articleSortOrder,
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
  });

  try {
    const batchResponse =
      await routeDeps.fetchAndCacheFeedArticlesBatchForRoute(
        routeDeps.db,
        options.userId,
        options.normalizedUrls,
        batchFetchOptions,
      );

    return buildBatchFetchExecutionResult({
      batchResponse,
      requestUrls: options.requestUrls,
    });
  } catch (error) {
    const fallbackResult = await executeIsolatedFeedBatchFallback({
      batchFetchOptions,
      db: routeDeps.db,
      fetchAndCacheFeedArticlesBatchForRoute:
        routeDeps.fetchAndCacheFeedArticlesBatchForRoute,
      initialError: error,
      normalizedUrls: options.normalizedUrls,
      requestStartedAt: options.requestStartedAt,
      requestUrls: options.requestUrls,
      userId: options.userId,
    });

    if (fallbackResult) {
      return fallbackResult;
    }

    throw error;
  }
}

/**
 * Execute the route batch fetch with a serverless-safe response deadline.
 * @param options - The options used to process the execute batch fetch.
 * @returns The completed batch result or a per-feed route-budget error result.
 */
async function executeBatchFetchWithRouteDeadline(
  options: ExecuteBatchFetchOptions,
): Promise<BatchFetchExecutionResult> {
  return executeBatchBeforeRouteDeadline({
    clearTimeoutFn: options.deps.clearTimeoutFn ?? clearTimeout,
    /**
     * Execute the route batch fetch when the response budget still allows it.
     * @returns The batch fetch result.
     */
    execute: () => executeBatchFetch(options),
    normalizedUrls: options.normalizedUrls,
    nowFn: options.deps.nowFn ?? Date.now,
    requestStartedAt: options.requestStartedAt,
    requestUrls: options.requestUrls,
    setTimeoutFn: options.deps.setTimeoutFn ?? setTimeout,
  });
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
    articleSortOrder,
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
  const batchFetchResult = await executeBatchFetchWithRouteDeadline({
    articleFilter,
    articleLimit,
    articleSortOrder,
    deps: options.deps,
    forceRefresh,
    forceResolveUpstream,
    knownLastFetchedAtByUrl,
    normalizedUrls,
    requestSource,
    requestStartedAt: options.requestStartedAt,
    requestUrls,
    searchTerm,
    skipRefresh,
    userId: user.userId,
  });

  return createBatchSuccessResponse(
    buildBatchSuccessResponseOptions({
      articleFilter,
      articleLimit,
      articleSortOrder,
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
}

/**
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
} /**
 * Parse an explicit dashboard article-window limit.
 *
 * The infinite-scroll client owns the page size and advances this value one
 * page at a time. Large libraries can legitimately request windows above the
 * default no-limit fallback, so this parser validates shape and finiteness but
 * does not clamp explicit values to `MAX_ALL_ARTICLES_LIMIT`.
 * @param value - Raw request-body value supplied as `articleLimit`.
 * @returns The validated article-window limit, `undefined` when omitted, or a
 *   `400` response when the value cannot be used as a SQL `LIMIT`.
 */
function parseArticleLimit(value: unknown): number | Response | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return NextResponse.json(
      {
        error: "articleLimit must be a positive safe integer when provided",
      },
      { status: 400 },
    );
  }

  return value;
}

/**
 * Parse the article sort order. Defaults to `"newest"` when omitted so the
 * server-side `ORDER BY` mirrors the historical descending publication date
 * behavior.
 * @param value - The raw value to validate.
 * @returns The normalized {@link ArticleSortOrder} or a 400 error response
 *   when the supplied value is not a recognized sort order.
 */
function parseArticleSortOrder(value: unknown): ArticleSortOrder | Response {
  if (value === undefined) {
    return "newest";
  }

  if (!isArticleSortOrder(value)) {
    return NextResponse.json(
      {
        error: "articleSortOrder must be one of newest or oldest",
      },
      { status: 400 },
    );
  }

  return value;
}

/**
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
} /**
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
    articleSortOrder,
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
    articleSortOrder,
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
}

/**
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
 * @param options - Proxy resolver options.
 * @returns The resolved proxy transport for this batch request.
 */
async function resolveBatchProxyTransport(options: BatchProxyTransportOptions) {
  const resolvedProxy = await options.resolveUserProxyForRoute(options.userId);

  return {
    allowInsecureTls: resolvedProxy.allowInsecureTls,
    proxyUrl: resolvedProxy.proxyUrl,
  };
}

/**
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
    parseArticleSortOrder,
    parseForceResolveUpstream,
    parseKnownLastFetchedAtByUrl,
    parseSearchTerm: parseBatchSearchTerm,
  });

  return requestState instanceof Response
    ? requestState
    : { ...requestState, user };
} /**
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
