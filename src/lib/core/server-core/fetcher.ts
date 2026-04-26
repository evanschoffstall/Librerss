/**
 * Public API for fetching and caching feed articles.
 *
 * DB access pattern for batch (regardless of N):
 *   1. One SELECT to verify ownership of all URLs.
 *   2. One SELECT to load all Feed records + lastFetched timestamps.
 *   3. If any Feed records are missing: one INSERT + one SELECT to resolve them.
 *   4. All stale upstream HTTP refreshes run in parallel (Promise.allSettled).
 *   5. One SELECT to retrieve the current global article page for the URL set.
 *
 * In-memory cache (feed-cache.ts) short-circuits the entire pipeline when:
 *   - All feeds are within TTL (nothing to refresh)
 *   - No force-refresh was requested
 *   - A cached result exists for the same user + URL set + article filter + article window
 * In that case: zero DB queries.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import type { ArticleRow } from "@/lib/core/feed-batch-pipeline";

import { CONFIG } from "@/lib";
import {
  buildRefreshPlan,
  executeParallelRefreshes,
  mapRowsToArticleMap,
  queryTopArticlesPerFeed,
  resolveAuthorizedFeedRecords,
} from "@/lib/core/feed-batch-pipeline";
import {
  type BatchFeedResult,
  type BatchFetchOptions,
  buildEmptyBatchResult,
  createBatchFetchRequest,
  type FeedFetcherBatchRuntimeDependencies,
  type FeedFetchProxyOptions,
  resolveBatchFeedResolution,
  resolveBatchFeedResult,
  resolveBatchForceRefresh,
  resolveCachedBatchResult,
  runBatchRefreshExecution,
} from "@/lib/core/feed-fetcher-batch";
import { type FeedUpstreamTransport } from "@/lib/core/feed-http";
import {
  diagInfo,
  diagWarn,
  type FeedRecord,
  refreshFeedFromUpstream,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
} from "@/lib/core/feed-refresh";

import { getCachedBatch, invalidateUserCache, setCachedBatch } from "./cache";
import {
  FeedSourceNotFoundError,
  isFeedSourceNotFoundError,
  isUpstreamFeedError,
  UpstreamFeedError,
} from "./errors";

/**
 * Defines the DB mod type.
 */
type DbMod = typeof import("@/lib/db");

export { isFeedSourceNotFoundError, isUpstreamFeedError };

/**
     * Describes the feed fetcher dependencies.
     */
interface FeedFetcherDependencies extends FeedFetcherBatchRuntimeDependencies {
  ensureFeedRecordByUrl: DbMod["ensureFeedRecordByUrl"];
  refreshFeedFromUpstream: typeof refreshFeedFromUpstream;
}

const defaultFeedFetcherDependencies: FeedFetcherDependencies = {
  buildRefreshPlan,
  diagInfo,
  diagWarn,
  /**
   * Resolves and runs the database helper that ensures a feed record exists.
   * @param args - Arguments forwarded to the lazy-loaded database helper.
   * @returns The ensured feed record for the requested URL.
   */
  ensureFeedRecordByUrl: async (
    ...args: Parameters<DbMod["ensureFeedRecordByUrl"]>
  ) => {
    const { ensureFeedRecordByUrl: fn } = await import("@/lib/db");
    return fn(...args);
  },
  executeParallelRefreshes,
  getCachedBatch,
  invalidateUserCache,
  mapRowsToArticleMap,
  queryTopArticlesPerFeed,
  refreshFeedFromUpstream,
  resolveAuthorizedFeedRecords,
  setCachedBatch,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
};

let feedFetcherDependencies = defaultFeedFetcherDependencies;

/**
 * Process the fetch and cache feed articles.
 * @param db - The db.
 * @param userId - The r id.
 * @param feedUrl - The feed url.
 * @param options - The options used to process the fetch and cache feed articles.
 * @returns The fetch and cache feed articles.
 */
export async function fetchAndCacheFeedArticles(
  db: ReturnType<DbMod["getDb"]>,
  userId: number,
  feedUrl: string,
  options?: FeedFetchProxyOptions,
): Promise<ArticleRow[]> {
  const { proxyEnabled: sourceProxyEnabled } = await readAuthorizedFeedSource(
    db,
    userId,
    feedUrl,
  );
  const feed = (await feedFetcherDependencies.ensureFeedRecordByUrl(
    db,
    feedUrl,
  )) as FeedRecord;

  await refreshSingleFeedIfNeeded(
    db,
    feed,
    feedUrl,
    options,
    sourceProxyEnabled,
  );

  return queryFeedArticles(db, feed.id, userId);
}

/**
 * Process the fetch and cache feed articles batch.
 * @param db - The db.
 * @param userId - The r id.
 * @param feedUrls - The feed urls.
 * @param options - The options used to process the fetch and cache feed articles batch.
 * @returns The fetch and cache feed articles batch.
 */
export async function fetchAndCacheFeedArticlesBatch(
  db: ReturnType<DbMod["getDb"]>,
  userId: number,
  feedUrls: string[],
  options: BatchFetchOptions = {},
): Promise<BatchFeedResult> {
  const request = createBatchFetchRequest(userId, feedUrls, options);
  if (request.feedUrls.length === 0) {
    return buildEmptyBatchResult();
  }

  const shouldForceRefresh = await resolveBatchForceRefresh(
    feedFetcherDependencies,
    db,
    request,
  );
  const { cached, result: cachedResult } = resolveCachedBatchResult(
    feedFetcherDependencies,
    request,
    shouldForceRefresh,
  );
  if (cachedResult) {
    return cachedResult;
  }

  const batchFeeds = await resolveBatchFeedResolution(
    feedFetcherDependencies,
    db,
    request,
    shouldForceRefresh,
  );
  if (!batchFeeds) {
    return buildEmptyBatchResult();
  }

  const refreshExecution = await runBatchRefreshExecution(
    feedFetcherDependencies,
    db,
    request,
    batchFeeds,
    shouldForceRefresh,
  );

  return resolveBatchFeedResult(
    feedFetcherDependencies,
    db,
    request,
    batchFeeds,
    refreshExecution,
    cached,
  );
}

/**
 * Process the reset feed fetcher dependencies for testing.
 */
export function resetFeedFetcherDependenciesForTesting(): void {
  feedFetcherDependencies = defaultFeedFetcherDependencies;
}

/**
 * Process the set feed fetcher dependencies for testing.
 * @param overrides - The overrides.
 */
export function setFeedFetcherDependenciesForTesting(
  overrides: Partial<FeedFetcherDependencies>,
): void {
  feedFetcherDependencies = {
    ...defaultFeedFetcherDependencies,
    ...overrides,
  };
}

/**
 * Process the query feed articles.
 * @param db - The db.
 * @param feedId - The feed id.
 * @param userId - The r id.
 * @returns The query feed articles.
 */
async function queryFeedArticles(
  db: ReturnType<DbMod["getDb"]>,
  feedId: number,
  userId: number,
): Promise<ArticleRow[]> {
  const { articles, articleStatuses } = await import("@/lib/db");
  return db
    .select({
      content: articles.content,
      feedId: articles.feedId,
      id: articles.id,
      isRead: sql<boolean>`coalesce(${articleStatuses.isRead}, false)`,
      isStarred: sql<boolean>`coalesce(${articleStatuses.isStarred}, false)`,
      lastChecked: articles.lastChecked,
      link: articles.link,
      publicationDate: articles.publicationDate,
      title: articles.title,
    })
    .from(articles)
    .leftJoin(
      articleStatuses,
      and(
        eq(articleStatuses.articleId, articles.id),
        eq(articleStatuses.userId, userId),
      ),
    )
    .where(eq(articles.feedId, feedId))
    .orderBy(desc(articles.publicationDate))
    .limit(CONFIG.MAX_ARTICLES_PER_FEED);
}

/**
 * Process the read authorized feed source.
 * @param db - The db.
 * @param userId - The r id.
 * @param feedUrl - The feed url.
 * @returns The read authorized feed source.
 */
async function readAuthorizedFeedSource(
  db: ReturnType<DbMod["getDb"]>,
  userId: number,
  feedUrl: string,
): Promise<{ proxyEnabled: boolean | null }> {
  const { feedSources } = await import("@/lib/db");
  const userSources = await db
    .select({ id: feedSources.id, proxyEnabled: feedSources.proxyEnabled })
    .from(feedSources)
    .where(
      and(
        eq(feedSources.userId, userId),
        eq(feedSources.url, feedUrl),
        eq(feedSources.enabled, true),
      ),
    )
    .limit(1);

  if (userSources.length === 0) {
    throw new FeedSourceNotFoundError(feedUrl);
  }

  return {
    proxyEnabled: userSources[0]?.proxyEnabled ?? null,
  };
}

/**
 * Process the refresh single feed if needed.
 * @param db - The db.
 * @param feed - The feed.
 * @param feedUrl - The feed url.
 * @param options - The options used to process the refresh single feed if needed.
 * @param sourceProxyEnabled - The source proxy enabled.
 */
async function refreshSingleFeedIfNeeded(
  db: ReturnType<DbMod["getDb"]>,
  feed: FeedRecord,
  feedUrl: string,
  options: FeedFetchProxyOptions | undefined,
  sourceProxyEnabled: boolean | null,
): Promise<void> {
  if (!feedFetcherDependencies.shouldRefreshFeed(feed.lastFetched)) {
    feedFetcherDependencies.diagInfo("Single feed cache hit", { url: feedUrl });
    return;
  }

  const proxyTransport: FeedUpstreamTransport | undefined =
    sourceProxyEnabled && options?.resolveProxyTransport
      ? await options.resolveProxyTransport()
      : undefined;
  const result = await feedFetcherDependencies.refreshFeedFromUpstream(
    db,
    { ...feed, proxyEnabled: sourceProxyEnabled ?? undefined },
    { proxyTransport },
  );

  if (!result.ok) {
    throw new UpstreamFeedError(feedUrl, result.error);
  }

  feedFetcherDependencies.diagInfo("Single feed refreshed", { url: feedUrl });
}
