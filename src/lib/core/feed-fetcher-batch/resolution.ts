import { and, eq, sql } from "drizzle-orm";

import { CONFIG } from "@/lib/config";

import type {
  ArticleRow,
  BatchFeedResolution,
  BatchFeedResult,
  BatchFetchRequest,
  BatchRefreshExecution,
  CachedBatchPayload,
  ChangedBatchArticleQuery,
  FeedRecord,
  FeedUpstreamTransport,
} from "./results";
import type { RankedRow, RefreshDecision } from "./types";

import {
  buildCachedArticleMap,
  buildCachedBatchResponse,
  buildFeedIdlessBatchResult,
  buildLastFetchedByUrl,
  buildQueriedBatchResult,
  buildUnchangedBatchResult,
  collectUnchangedUrls,
} from "./results";

/**
 * Describes the feed fetcher batch runtime dependencies.
 */
export interface FeedFetcherBatchRuntimeDependencies {
  buildRefreshPlan: (
    feedByUrl: Map<string, FeedRecord>,
    allowedUrls: string[],
    skipRefresh: boolean,
    forceRefresh: boolean,
    forceResolveUpstream: boolean,
  ) => RefreshDecision[];
  diagInfo: (_message: string, _details: Record<string, unknown>) => void;
  diagWarn: (_message: string, _details: Record<string, unknown>) => void;
  executeParallelRefreshes: (options: {
    allowedUrls: string[];
    db: ReturnType<DbMod["getDb"]>;
    feedByUrl: Map<string, FeedRecord>;
    forceRefresh: boolean;
    forceResolveUpstream: boolean;
    proxyTransport?: FeedUpstreamTransport;
    proxyTransportError?: string;
    skipRefresh: boolean;
  }) => Promise<BatchRefreshExecution>;
  getCachedBatch: (
    userId: number,
    urls: string[],
    options?: {
      articleFilter?: BatchFetchRequest["articleFilter"];
      articleLimit?: number;
      articleSortOrder?: BatchFetchRequest["articleSortOrder"];
      searchTerm?: string;
    },
  ) => CachedBatchPayload | null;
  invalidateUserCache: (userId: number) => void;
  mapRowsToArticleMap: (
    rows: RankedRow[],
    feedByUrl: Map<string, FeedRecord>,
    changedUrls: string[],
  ) => Map<string, ArticleRow[]>;
  queryTopArticlesPerFeed: (
    db: ReturnType<DbMod["getDb"]>,
    userId: number,
    feedIds: number[],
    options?: {
      articleFilter?: BatchFetchRequest["articleFilter"];
      articleLimit?: number;
      articleSortOrder?: BatchFetchRequest["articleSortOrder"];
      searchTerm?: string;
    },
  ) => Promise<RankedRow[]>;
  resolveAuthorizedFeedRecords: (
    db: ReturnType<DbMod["getDb"]>,
    userId: number,
    feedUrls: string[],
  ) => Promise<null | {
    allowedUrls: string[];
    feedByUrl: Map<string, FeedRecord>;
  }>;
  setCachedBatch: (
    userId: number,
    urls: string[],
    result: CachedBatchPayload,
    options?: {
      articleFilter?: BatchFetchRequest["articleFilter"];
      articleLimit?: number;
      articleSortOrder?: BatchFetchRequest["articleSortOrder"];
      searchTerm?: string;
    },
  ) => void;
  shouldForceRefreshFeed: (lastFetched: Date) => boolean;
  shouldRefreshFeed: (lastFetched: Date) => boolean;
}

/**
 * Defines the DB mod type.
 */
type DbMod = typeof import("@/lib/db");

/**
 * Describes the options for refresh proxy transport.
 */
interface RefreshProxyTransportOptions {
  allowedUrls: string[];
  dependencies: FeedFetcherBatchRuntimeDependencies;
  feedByUrl: ReadonlyMap<string, FeedRecord>;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  resolveProxyTransport?: () => Promise<FeedUpstreamTransport | undefined>;
  skipRefresh: boolean;
}

/**
 * Resolve the batch feed resolution.
 * @param dependencies - The dependencies.
 * @param db - The db.
 * @param request - The request.
 * @param shouldForceRefresh - Whether should force refresh.
 * @returns The batch feed resolution.
 */
export async function resolveBatchFeedResolution(
  dependencies: FeedFetcherBatchRuntimeDependencies,
  db: ReturnType<DbMod["getDb"]>,
  request: BatchFetchRequest,
  shouldForceRefresh: boolean,
): Promise<BatchFeedResolution | null> {
  const resolved = await dependencies.resolveAuthorizedFeedRecords(
    db,
    request.userId,
    request.feedUrls,
  );
  if (!resolved) {
    dependencies.diagWarn("Batch feed fetch denied: no owned URLs", {
      requestedUrlCount: request.feedUrls.length,
      userId: request.userId,
    });
    return null;
  }

  const proxyTransport = await resolveRefreshProxyTransport({
    allowedUrls: resolved.allowedUrls,
    dependencies,
    feedByUrl: resolved.feedByUrl,
    forceRefresh: shouldForceRefresh,
    forceResolveUpstream: request.forceResolveUpstream,
    resolveProxyTransport: request.resolveProxyTransport,
    skipRefresh: request.skipRefresh,
  });

  return {
    allowedUrls: resolved.allowedUrls,
    feedByUrl: resolved.feedByUrl,
    ...proxyTransport,
  };
}

/**
 * Resolve the batch feed result.
 * @param dependencies - The dependencies.
 * @param db - The db.
 * @param request - The request.
 * @param batchFeeds - The batch feeds.
 * @param refreshExecution - The refresh execution.
 * @param cached - The cached.
 * @returns The batch feed result.
 */
export async function resolveBatchFeedResult(
  dependencies: FeedFetcherBatchRuntimeDependencies,
  db: ReturnType<DbMod["getDb"]>,
  request: BatchFetchRequest,
  batchFeeds: BatchFeedResolution,
  refreshExecution: BatchRefreshExecution,
  cached: CachedBatchPayload | null,
): Promise<BatchFeedResult> {
  const feedIds = batchFeeds.allowedUrls
    .map((url) => batchFeeds.feedByUrl.get(url)?.id)
    .filter((id): id is number => id !== undefined);
  if (feedIds.length === 0) {
    return buildFeedIdlessBatchResult({
      allowedUrls: batchFeeds.allowedUrls,
      refreshExecution,
    });
  }

  const lastFetchedByUrl = buildLastFetchedByUrl({
    allowedUrls: batchFeeds.allowedUrls,
    feedByUrl: batchFeeds.feedByUrl,
    refreshedUrls: refreshExecution.refreshedUrls,
  });
  const unchangedUrls = collectUnchangedUrls({
    articleLimit: request.articleLimit,
    knownLastFetchedAtByUrl: request.knownLastFetchedAtByUrl,
    lastFetchedByUrl,
    urls: batchFeeds.allowedUrls,
  });
  const changedUrls = batchFeeds.allowedUrls.filter(
    (url) => !unchangedUrls.has(url),
  );

  if (changedUrls.length === 0) {
    return buildUnchangedBatchResult({
      allowedUrlCount: batchFeeds.allowedUrls.length,
      lastFetchedByUrl,
      refreshExecution,
      unchangedUrls,
    });
  }

  return queryChangedBatchArticles(dependencies, db, {
    batchFeeds,
    cached,
    changedUrls,
    lastFetchedByUrl,
    refreshExecution,
    request,
    unchangedUrls,
  });
}

/**
 * Resolve the batch force refresh.
 * @param dependencies - The dependencies.
 * @param db - The db.
 * @param request - The request.
 * @returns The batch force refresh.
 */
export async function resolveBatchForceRefresh(
  dependencies: FeedFetcherBatchRuntimeDependencies,
  db: ReturnType<DbMod["getDb"]>,
  request: BatchFetchRequest,
): Promise<boolean> {
  const shouldForceRefresh =
    request.forceRefresh || request.forceResolveUpstream;

  dependencies.diagInfo("Batch feed fetch started", {
    articleFilter: request.articleFilter,
    articleLimit: request.articleLimit,
    forceRefresh: shouldForceRefresh,
    forceResolveUpstream: request.forceResolveUpstream,
    requestedUrlCount: request.feedUrls.length,
    requestSource: request.requestSource,
    searchTerm: request.searchTerm,
    skipRefresh: request.skipRefresh,
    userId: request.userId,
  });

  if (!shouldForceRefresh || request.forceResolveUpstream) {
    return shouldForceRefresh;
  }

  const { users } = await import("@/lib/db");
  const claimed = await db
    .update(users)
    .set({ lastForceRefreshedAt: new Date() })
    .where(
      and(
        eq(users.id, request.userId),
        sql`("last_force_refreshed_at" IS NULL OR "last_force_refreshed_at" < now() - (${CONFIG.FEED_FORCE_REFRESH_TTL_MINUTES} * interval '1 minute'))`,
      ),
    )
    .returning({ id: users.id });

  if (claimed.length > 0) {
    return true;
  }

  dependencies.diagInfo("Force refresh blocked by per-user DB cooldown", {
    requestSource: request.requestSource,
    userId: request.userId,
  });
  return false;
}

/**
 * Resolve the cached batch result.
 * @param dependencies - The dependencies.
 * @param request - The request.
 * @param shouldForceRefresh - Whether should force refresh.
 * @returns The cached batch result.
 */
export function resolveCachedBatchResult(
  dependencies: FeedFetcherBatchRuntimeDependencies,
  request: BatchFetchRequest,
  shouldForceRefresh: boolean,
): { cached: CachedBatchPayload | null; result: BatchFeedResult | null } {
  const cached = dependencies.getCachedBatch(request.userId, request.feedUrls, {
    articleFilter: request.articleFilter,
    articleLimit: request.articleLimit,
    articleSortOrder: request.articleSortOrder,
    searchTerm: request.searchTerm,
  });
  if (!cached || request.forceResolveUpstream) {
    return { cached, result: null };
  }

  const allWithinCooldown =
    shouldForceRefresh &&
    [...cached.lastFetchedByUrl.values()].every(
      (date) => !dependencies.shouldForceRefreshFeed(date),
    );
  if (shouldForceRefresh && !allWithinCooldown) {
    return { cached, result: null };
  }

  return {
    cached,
    result: buildCachedBatchResponse({
      allWithinCooldown,
      cached,
      /**
       * Reports diagnostic details for a successful in-memory batch cache hit.
       * @param details - Structured cache-hit diagnostics emitted for debugging.
       */
      onCacheHit: (details) => {
        dependencies.diagInfo(
          "Batch feed fetch served from memory cache",
          details,
        );
      },
      request,
    }),
  };
}

/**
 * Process the run batch refresh execution.
 * @param dependencies - The dependencies.
 * @param db - The db.
 * @param request - The request.
 * @param batchFeeds - The batch feeds.
 * @param shouldForceRefresh - Whether should force refresh.
 * @returns The run batch refresh execution.
 */
export async function runBatchRefreshExecution(
  dependencies: FeedFetcherBatchRuntimeDependencies,
  db: ReturnType<DbMod["getDb"]>,
  request: BatchFetchRequest,
  batchFeeds: BatchFeedResolution,
  shouldForceRefresh: boolean,
): Promise<BatchRefreshExecution> {
  dependencies.diagInfo("Batch feed refresh plan", {
    allowedUrlCount: batchFeeds.allowedUrls.length,
    articleFilter: request.articleFilter,
    articleLimit: request.articleLimit,
    missingFeedRecordCount: batchFeeds.allowedUrls.filter(
      (url) => !batchFeeds.feedByUrl.has(url),
    ).length,
    plan: dependencies.buildRefreshPlan(
      batchFeeds.feedByUrl,
      batchFeeds.allowedUrls,
      request.skipRefresh,
      shouldForceRefresh,
      request.forceResolveUpstream,
    ),
    requestSource: request.requestSource,
    searchTerm: request.searchTerm,
    userId: request.userId,
  });

  const refreshExecution = await dependencies.executeParallelRefreshes({
    allowedUrls: batchFeeds.allowedUrls,
    db,
    feedByUrl: batchFeeds.feedByUrl,
    forceRefresh: shouldForceRefresh,
    forceResolveUpstream: request.forceResolveUpstream,
    proxyTransport: batchFeeds.proxyTransport,
    proxyTransportError: batchFeeds.proxyTransportError,
    skipRefresh: request.skipRefresh,
  });

  logBatchRefreshOutcome(
    dependencies,
    request,
    batchFeeds.allowedUrls.length,
    refreshExecution,
  );
  return refreshExecution;
}

/**
 * Process the log batch fetch completion.
 * @param dependencies - The dependencies.
 * @param request - The request.
 * @param articleMap - The article map.
 * @param totalArticles - The total articles.
 * @param errors - The errors.
 */
function logBatchFetchCompletion(
  dependencies: FeedFetcherBatchRuntimeDependencies,
  request: BatchFetchRequest,
  articleMap: Map<string, ArticleRow[]>,
  totalArticles: number,
  errors: ReadonlyMap<string, string>,
): void {
  dependencies.diagInfo("Batch feed fetch completed", {
    articleFilter: request.articleFilter,
    articleLimit: request.articleLimit,
    articlesByUrl: [...articleMap.entries()].map(([url, items]) => ({
      articleCount: items.length,
      newestReturnedPublicationDate:
        items.length > 0 ? items[0].publicationDate.toISOString() : null,
      upstreamError: errors.get(url) ?? null,
      url,
    })),
    feedCount: articleMap.size,
    requestSource: request.requestSource,
    searchTerm: request.searchTerm,
    totalArticles,
    upstreamErrorCount: errors.size,
    userId: request.userId,
  });
}

/**
 * Process the log batch refresh outcome.
 * @param dependencies - The dependencies.
 * @param request - The request.
 * @param allowedUrlCount - The allowed url count value.
 * @param refreshExecution - The refresh execution.
 */
function logBatchRefreshOutcome(
  dependencies: FeedFetcherBatchRuntimeDependencies,
  request: BatchFetchRequest,
  allowedUrlCount: number,
  refreshExecution: BatchRefreshExecution,
): void {
  if (request.skipRefresh) {
    return;
  }

  if (refreshExecution.refreshedCount > 0) {
    dependencies.diagInfo("Batch feed upstream refresh executed", {
      articleFilter: request.articleFilter,
      articleLimit: request.articleLimit,
      failedFeedCount: refreshExecution.errors.size,
      failedUrls: [...refreshExecution.errors.keys()],
      refreshedFeedCount: refreshExecution.refreshedCount,
      requestSource: request.requestSource,
      searchTerm: request.searchTerm,
      userId: request.userId,
    });
    return;
  }

  dependencies.diagInfo("Batch feed refresh skipped: all feeds fresh", {
    allowedUrlCount,
    articleFilter: request.articleFilter,
    articleLimit: request.articleLimit,
    requestSource: request.requestSource,
    searchTerm: request.searchTerm,
    userId: request.userId,
  });
}

/**
 * Process the persist batch cache.
 * @param dependencies - The dependencies.
 * @param query - The query.
 * @param articleMap - The article map.
 */
function persistBatchCache(
  dependencies: FeedFetcherBatchRuntimeDependencies,
  query: ChangedBatchArticleQuery,
  articleMap: Map<string, ArticleRow[]>,
): void {
  if (query.refreshExecution.refreshedCount > 0) {
    dependencies.invalidateUserCache(query.request.userId);
  }

  const cacheArticleMap = buildCachedArticleMap({
    allowedUrls: query.batchFeeds.allowedUrls,
    cachedArticlesByUrl: query.cached?.articles,
    changedArticlesByUrl: articleMap,
    unchangedUrls: query.unchangedUrls,
  });
  if (cacheArticleMap.size === query.batchFeeds.allowedUrls.length) {
    dependencies.setCachedBatch(
      query.request.userId,
      query.batchFeeds.allowedUrls,
      {
        articles: cacheArticleMap,
        errors: query.refreshExecution.errors,
        lastFetchedByUrl: query.lastFetchedByUrl,
      },
      {
        articleFilter: query.request.articleFilter,
        articleLimit: query.request.articleLimit,
        articleSortOrder: query.request.articleSortOrder,
        searchTerm: query.request.searchTerm,
      },
    );
  }
}
/**
 * Process the query changed batch articles.
 * @param dependencies - The dependencies.
 * @param db - The db.
 * @param query - The query.
 * @returns The query changed batch articles.
 */
async function queryChangedBatchArticles(
  dependencies: FeedFetcherBatchRuntimeDependencies,
  db: ReturnType<DbMod["getDb"]>,
  query: ChangedBatchArticleQuery,
): Promise<BatchFeedResult> {
  const changedFeedIds = query.changedUrls
    .map((url) => query.batchFeeds.feedByUrl.get(url)?.id)
    .filter((id): id is number => id !== undefined);
  const rows = await dependencies.queryTopArticlesPerFeed(
    db,
    query.request.userId,
    changedFeedIds,
    {
      articleFilter: query.request.articleFilter,
      articleLimit: query.request.articleLimit,
      articleSortOrder: query.request.articleSortOrder,
      searchTerm: query.request.searchTerm,
    },
  );
  const articleMap = dependencies.mapRowsToArticleMap(
    rows,
    query.batchFeeds.feedByUrl,
    query.changedUrls,
  );

  logBatchFetchCompletion(
    dependencies,
    query.request,
    articleMap,
    rows.length,
    query.refreshExecution.errors,
  );
  persistBatchCache(dependencies, query, articleMap);

  return buildQueriedBatchResult({
    articleMap,
    lastFetchedByUrl: query.lastFetchedByUrl,
    query,
  });
}

/**
 * Resolve the refresh proxy transport.
 * @param options - The options used to resolve the refresh proxy transport.
 * @returns The refresh proxy transport.
 */
async function resolveRefreshProxyTransport(
  options: RefreshProxyTransportOptions,
): Promise<
  Pick<BatchFeedResolution, "proxyTransport" | "proxyTransportError">
> {
  if (!options.resolveProxyTransport || options.skipRefresh) {
    return {};
  }

  const requiresProxyTransport = options.allowedUrls.some((url) => {
    const feed = options.feedByUrl.get(url);

    if (feed?.proxyEnabled !== true) {
      return false;
    }

    if (options.forceResolveUpstream) {
      return true;
    }

    return options.forceRefresh
      ? options.dependencies.shouldForceRefreshFeed(feed.lastFetched) ||
          feed.lastFetchError !== null
      : options.dependencies.shouldRefreshFeed(feed.lastFetched);
  });

  if (!requiresProxyTransport) {
    return {};
  }

  try {
    return { proxyTransport: await options.resolveProxyTransport() };
  } catch (error) {
    return { proxyTransportError: toProxyTransportErrorMessage(error) };
  }
}

/**
 * Convert proxy setup failures into per-feed batch error text without importing app-level utilities.
 * @param error - Error thrown while resolving the saved proxy transport.
 * @returns User-visible error text for affected proxy-enabled feeds.
 */
function toProxyTransportErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Unknown error";
}
