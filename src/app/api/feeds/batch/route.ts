import { NextRequest, NextResponse } from "next/server";

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

/**
 * @param request
 * @param depsOrContext
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
 * @param options
 * @param options.articleFilter
 * @param options.articleLimit
 * @param options.batchFetchResult
 * @param options.diagnosticsEnabled
 * @param options.forceRefresh
 * @param options.forceResolveUpstream
 * @param options.intent
 * @param options.invalidUrlCount
 * @param options.normalizedUrls
 * @param options.requestSource
 * @param options.requestStartedAt
 * @param options.searchTerm
 * @param options.skipRefresh
 * @param options.userId
 */
function buildBatchSuccessResponseOptions(options: {
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
}): BatchRequestCompletedOptions {
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
 * @param options
 * @param options.articleFilter
 * @param options.articleLimit
 * @param options.deps
 * @param options.forceRefresh
 * @param options.forceResolveUpstream
 * @param options.knownLastFetchedAtByUrl
 * @param options.normalizedUrls
 * @param options.requestSource
 * @param options.requestUrls
 * @param options.searchTerm
 * @param options.skipRefresh
 * @param options.userId
 */
async function executeBatchFetch(options: {
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
}): Promise<BatchFetchExecutionResult> {
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
       *
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
 * @param options
 * @param options.deps
 * @param options.diagnosticsEnabled
 * @param options.requestStartedAt
 * @param options.requestState
 */
async function handleResolvedBatchPostRequest(options: {
  deps: BatchRouteDeps;
  diagnosticsEnabled: boolean;
  requestStartedAt: number;
  requestState: ResolvedBatchRequestState;
}) {
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
}

/**
 * @param value
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
 * @param value
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
}

/**
 * @param value
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
 * @param value
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
 * @param value
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
 * @param options
 * @param options.diagnosticsEnabled
 * @param options.requestState
 */
function resolveBatchExecutionPreflight(options: {
  diagnosticsEnabled: boolean;
  requestState: ResolvedBatchRequestState;
}) {
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
}

/**
 * @param options
 * @param options.forceRefresh
 * @param options.forceResolveUpstream
 * @param options.skipRefresh
 * @param options.urls
 */
function resolveBatchIntentState(options: {
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  skipRefresh: boolean;
  urls: string[];
}) {
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
 * @param options
 * @param options.resolveUserProxyForRoute
 * @param options.userId
 */
async function resolveBatchProxyTransport(options: {
  resolveUserProxyForRoute: NonNullable<
    ReturnType<typeof resolveBatchRouteDependencies>["resolveUserProxyForRoute"]
  >;
  userId: number;
}) {
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
}

/**
 * @param options
 * @param options.deps
 * @param options.request
 */
async function resolveBatchRequestStateForPost(options: {
  deps: BatchRouteDeps;
  request: NextRequest;
}): Promise<ResolvedBatchRequestState | Response> {
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
 * @param options
 * @param options.diagnosticsEnabled
 * @param options.urls
 * @param options.userId
 */
function resolveBatchRequestUrls(options: {
  diagnosticsEnabled: boolean;
  urls: string[];
  userId: number;
}): ResolvedBatchRequestUrls | Response {
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
 * @param deps
 */
function resolveBatchRouteDependencies(deps: BatchRouteDeps) {
  return {
    db: (deps.getDbFn ?? getDb)(),
    fetchAndCacheFeedArticlesBatchForRoute:
      deps.fetchAndCacheFeedArticlesBatchFn ?? fetchAndCacheFeedArticlesBatch,
    resolveUserProxyForRoute: deps.resolveUserProxyFn ?? resolveUserProxy,
  };
}
