/**
 * Public API for fetching and caching feed articles.
 *
 * DB access pattern for batch (regardless of N):
 *   1. One SELECT to verify ownership of all URLs.
 *   2. One SELECT to load all Feed records + lastFetched timestamps.
 *   3. If any Feed records are missing: one INSERT + one SELECT to resolve them.
 *   4. All stale upstream HTTP refreshes run in parallel (Promise.allSettled).
 *   5. One window-function SELECT to retrieve top-N articles per feed.
 *
 * In-memory cache (feed-cache.ts) short-circuits the entire pipeline when:
 *   - All feeds are within TTL (nothing to refresh)
 *   - No force-refresh was requested
 *   - A cached result exists for the same user + URL set
 * In that case: zero DB queries.
 */

import { and, desc, eq, sql } from "drizzle-orm";

import {
  type ArticleRow,
  buildRefreshPlan,
  executeParallelRefreshes,
  mapRowsToArticleMap,
  queryTopArticlesPerFeed,
  resolveAuthorizedFeedRecords,
} from "./feed-batch-pipeline";
import {
  getCachedBatch,
  invalidateUserCache,
  setCachedBatch,
} from "./feed-cache";
import {
  diagInfo,
  diagWarn,
  type FeedRecord,
  refreshFeedFromUpstream,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
} from "./feed-refresh";

import { CONFIG } from "@/lib/config";
import type { getDb } from "@/lib/db/db";
import { ensureFeedRecordByUrl } from "@/lib/db/feed-records";
import { articles, articleStatuses, feedSources, users } from "@/lib/db/schema";

interface FeedFetcherDependencies {
  buildRefreshPlan: typeof buildRefreshPlan;
  diagInfo: typeof diagInfo;
  diagWarn: typeof diagWarn;
  ensureFeedRecordByUrl: typeof ensureFeedRecordByUrl;
  executeParallelRefreshes: typeof executeParallelRefreshes;
  getCachedBatch: typeof getCachedBatch;
  invalidateUserCache: typeof invalidateUserCache;
  mapRowsToArticleMap: typeof mapRowsToArticleMap;
  queryTopArticlesPerFeed: typeof queryTopArticlesPerFeed;
  refreshFeedFromUpstream: typeof refreshFeedFromUpstream;
  resolveAuthorizedFeedRecords: typeof resolveAuthorizedFeedRecords;
  setCachedBatch: typeof setCachedBatch;
  shouldForceRefreshFeed: typeof shouldForceRefreshFeed;
  shouldRefreshFeed: typeof shouldRefreshFeed;
}

const defaultFeedFetcherDependencies: FeedFetcherDependencies = {
  buildRefreshPlan,
  diagInfo,
  diagWarn,
  ensureFeedRecordByUrl,
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

interface BatchFeedResult {
  articles: Map<string, ArticleRow[]>;
  cachedCount: number;
  cooldownLimitedCount: number;
  errors: Map<string, string>;
  lastFetchedByUrl: Map<string, Date>;
  refreshedCount: number;
  /** How the system resolved the request: memory cache, DB cache, or upstream fetch. */
  resolution: "cache" | "memory" | "upstream";
  unchangedUrls: Set<string>;
}

/** Returned when the authenticated user doesn't own the requested feed source. */
class FeedSourceNotFoundError extends Error {
  constructor(feedUrl: string) {
    super(`Feed source not found for URL: ${feedUrl}`);
    this.name = "FeedSourceNotFoundError";
  }
}

// ─── Error types ──────────────────────────────────────────────────────────────

/** Thrown when an upstream feed refresh fails so callers can return a proper error. */
class UpstreamFeedError extends Error {
  constructor(feedUrl: string, cause: string) {
    super(`Upstream feed fetch failed for ${feedUrl}: ${cause}`);
    this.name = "UpstreamFeedError";
  }
}

/**
 * Fetches and caches articles for one feed URL.
 * @throws {FeedSourceNotFoundError} if userId doesn't own the feed.
 * @throws {UpstreamFeedError} if the upstream feed refresh fails.
 */
export async function fetchAndCacheFeedArticles(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedUrl: string,
): Promise<ArticleRow[]> {
  const userSources = await db
    .select({ id: feedSources.id })
    .from(feedSources)
    .where(
      and(
        eq(feedSources.userId, userId),
        eq(feedSources.url, feedUrl),
        eq(feedSources.enabled, true),
      ),
    )
    .limit(1);

  if (userSources.length === 0) throw new FeedSourceNotFoundError(feedUrl);

  const feed = (await feedFetcherDependencies.ensureFeedRecordByUrl(
    db,
    feedUrl,
  )) as FeedRecord;

  if (feedFetcherDependencies.shouldRefreshFeed(feed.lastFetched)) {
    const result = await feedFetcherDependencies.refreshFeedFromUpstream(
      db,
      feed,
    );
    if (!result.ok) throw new UpstreamFeedError(feedUrl, result.error);
    feedFetcherDependencies.diagInfo("Single feed refreshed", { url: feedUrl });
  } else {
    feedFetcherDependencies.diagInfo("Single feed cache hit", { url: feedUrl });
  }

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
    .where(eq(articles.feedId, feed.id))
    .orderBy(desc(articles.publicationDate))
    .limit(CONFIG.MAX_ARTICLES_PER_FEED);
}

// ─── Batch fetch ──────────────────────────────────────────────────────────────

export async function fetchAndCacheFeedArticlesBatch(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedUrls: string[],
  {
    forceRefresh = false,
    knownLastFetchedAtByUrl,
    requestSource = "unspecified",
    skipRefresh = false,
  }: {
    forceRefresh?: boolean;
    knownLastFetchedAtByUrl?: ReadonlyMap<string, Date>;
    requestSource?: string;
    skipRefresh?: boolean;
  } = {},
): Promise<BatchFeedResult> {
  if (feedUrls.length === 0) return buildEmptyBatchResult();

  feedFetcherDependencies.diagInfo("Batch feed fetch started", {
    forceRefresh,
    requestedUrlCount: feedUrls.length,
    requestSource,
    skipRefresh,
    userId,
  });

  // ── Per-user force-refresh cooldown (DB-backed, survives restarts) ───────
  // Atomically check + claim: UPDATE returns a row only when the cooldown has
  // elapsed, preventing concurrent requests from both passing the gate.
  if (forceRefresh) {
    const claimed = await db
      .update(users)
      .set({ lastForceRefreshedAt: new Date() })
      .where(
        and(
          eq(users.id, userId),
          sql`("last_force_refreshed_at" IS NULL OR "last_force_refreshed_at" < now() - (${CONFIG.FEED_FORCE_REFRESH_TTL_MINUTES} * interval '1 minute'))`,
        ),
      )
      .returning({ id: users.id });

    if (claimed.length === 0) {
      diagInfo("Force refresh blocked by per-user DB cooldown", {
        requestSource,
        userId,
      });
      forceRefresh = false;
    }
  }

  // ── In-memory cache fast path (zero DB queries) ──────────────────────────
  // Non-force requests: serve from memory if a cached result exists.
  // Force requests: serve from memory only when every feed is still within
  // the force-refresh cooldown — going to DB would produce the same result.
  const cached = feedFetcherDependencies.getCachedBatch(userId, feedUrls);
  if (cached) {
    const allWithinCooldown =
      forceRefresh &&
      [...cached.lastFetchedByUrl.values()].every(
        (d) => !feedFetcherDependencies.shouldForceRefreshFeed(d),
      );

    if (!forceRefresh || allWithinCooldown) {
      const cachedCount = feedUrls.length;
      const unchangedUrls = collectUnchangedUrls(
        feedUrls,
        cached.lastFetchedByUrl,
        knownLastFetchedAtByUrl,
      );
      const articles = sliceArticleMapByUrls(
        cached.articles,
        feedUrls.filter((url) => !unchangedUrls.has(url)),
      );
      feedFetcherDependencies.diagInfo(
        "Batch feed fetch served from memory cache",
        {
          feedCount: cachedCount,
          forceRefreshCooldownHit: allWithinCooldown,
          requestSource,
          userId,
        },
      );
      return {
        articles,
        cachedCount,
        cooldownLimitedCount: allWithinCooldown ? cachedCount : 0,
        errors: cached.errors,
        lastFetchedByUrl: cached.lastFetchedByUrl,
        refreshedCount: 0,
        resolution: "memory" as const,
        unchangedUrls,
      };
    }
  }

  // ── DB path: resolve ownership + feed records ────────────────────────────
  const resolved = await feedFetcherDependencies.resolveAuthorizedFeedRecords(
    db,
    userId,
    feedUrls,
  );
  if (!resolved) {
    feedFetcherDependencies.diagWarn("Batch feed fetch denied: no owned URLs", {
      requestedUrlCount: feedUrls.length,
      userId,
    });
    return buildEmptyBatchResult();
  }

  const { allowedUrls, feedByUrl } = resolved;

  feedFetcherDependencies.diagInfo("Batch feed refresh plan", {
    allowedUrlCount: allowedUrls.length,
    missingFeedRecordCount: allowedUrls.filter((u) => !feedByUrl.has(u)).length,
    plan: feedFetcherDependencies.buildRefreshPlan(
      feedByUrl,
      allowedUrls,
      skipRefresh,
      forceRefresh,
    ),
    requestSource,
    userId,
  });

  const {
    cooldownLimitedCount,
    errors: upstreamErrors,
    refreshedCount,
    refreshedUrls,
  } = await feedFetcherDependencies.executeParallelRefreshes(
    db,
    feedByUrl,
    allowedUrls,
    skipRefresh,
    forceRefresh,
  );

  if (!skipRefresh) {
    if (refreshedCount > 0) {
      feedFetcherDependencies.diagInfo("Batch feed upstream refresh executed", {
        failedFeedCount: upstreamErrors.size,
        failedUrls: [...upstreamErrors.keys()],
        refreshedFeedCount: refreshedCount,
        requestSource,
        userId,
      });
    } else {
      feedFetcherDependencies.diagInfo(
        "Batch feed refresh skipped: all feeds fresh",
        {
          allowedUrlCount: allowedUrls.length,
          requestSource,
          userId,
        },
      );
    }
  }

  const feedIds = allowedUrls
    .map((u) => feedByUrl.get(u)?.id)
    .filter((id): id is number => id !== undefined);

  if (feedIds.length === 0) {
    return {
      articles: new Map(allowedUrls.map((u) => [u, []])),
      cachedCount: allowedUrls.length - refreshedCount,
      cooldownLimitedCount,
      errors: upstreamErrors,
      lastFetchedByUrl: new Map(),
      refreshedCount,
      resolution:
        refreshedCount > 0 ? ("upstream" as const) : ("cache" as const),
      unchangedUrls: new Set(),
    };
  }

  // Derive lastFetchedByUrl from feed records. For feeds refreshed this cycle,
  // use current time instead of stale pre-refresh timestamps so the memory
  // cache stores accurate values for subsequent cooldown checks.
  const now = new Date();
  const lastFetchedByUrl = new Map<string, Date>(
    allowedUrls
      .map((u): [string, Date] | null => {
        if (refreshedUrls.has(u)) return [u, now];
        const feed = feedByUrl.get(u);
        return feed ? [u, feed.lastFetched] : null;
      })
      .filter((e): e is [string, Date] => e !== null),
  );

  const unchangedUrls = collectUnchangedUrls(
    allowedUrls,
    lastFetchedByUrl,
    knownLastFetchedAtByUrl,
  );
  const changedUrls = allowedUrls.filter((url) => !unchangedUrls.has(url));

  if (changedUrls.length === 0) {
    return {
      articles: new Map(),
      cachedCount: allowedUrls.length - refreshedCount,
      cooldownLimitedCount,
      errors: upstreamErrors,
      lastFetchedByUrl,
      refreshedCount,
      resolution:
        refreshedCount > 0 ? ("upstream" as const) : ("cache" as const),
      unchangedUrls,
    };
  }

  const changedFeedIds = changedUrls
    .map((url) => feedByUrl.get(url)?.id)
    .filter((id): id is number => id !== undefined);

  const rows = await feedFetcherDependencies.queryTopArticlesPerFeed(
    db,
    userId,
    changedFeedIds,
  );
  const articleMap = feedFetcherDependencies.mapRowsToArticleMap(
    rows,
    feedByUrl,
    changedUrls,
  );

  feedFetcherDependencies.diagInfo("Batch feed fetch completed", {
    articlesByUrl: [...articleMap.entries()].map(([url, items]) => ({
      articleCount: items.length,
      newestReturnedPublicationDate:
        items.length > 0 ? items[0].publicationDate.toISOString() : null,
      upstreamError: upstreamErrors.get(url) ?? null,
      url,
    })),
    feedCount: articleMap.size,
    requestSource,
    totalArticles: rows.length,
    upstreamErrorCount: upstreamErrors.size,
    userId,
  });

  // ── Populate in-memory cache ─────────────────────────────────────────────
  // When feeds were refreshed upstream, other cached URL-set entries for this
  // user may contain stale article data. Invalidate everything first, then
  // store the fresh result so subsequent requests hit the cache.
  if (refreshedCount > 0) feedFetcherDependencies.invalidateUserCache(userId);
  const cacheArticleMap = buildCachedArticleMap(
    articleMap,
    cached?.articles,
    unchangedUrls,
    allowedUrls,
  );
  if (cacheArticleMap.size === allowedUrls.length) {
    feedFetcherDependencies.setCachedBatch(userId, allowedUrls, {
      articles: cacheArticleMap,
      errors: upstreamErrors,
      lastFetchedByUrl,
    });
  }

  return {
    articles: articleMap,
    cachedCount: allowedUrls.length - refreshedCount,
    cooldownLimitedCount,
    errors: upstreamErrors,
    lastFetchedByUrl,
    refreshedCount,
    resolution: refreshedCount > 0 ? ("upstream" as const) : ("cache" as const),
    unchangedUrls,
  };
}

export function isFeedSourceNotFoundError(
  error: unknown,
): error is FeedSourceNotFoundError {
  return (
    error instanceof FeedSourceNotFoundError ||
    (error instanceof Error && error.name === "FeedSourceNotFoundError")
  );
}

export function isUpstreamFeedError(
  error: unknown,
): error is UpstreamFeedError {
  return (
    error instanceof UpstreamFeedError ||
    (error instanceof Error && error.name === "UpstreamFeedError")
  );
}

// ─── Single-feed wrapper ──────────────────────────────────────────────────────

export function resetFeedFetcherDependenciesForTesting(): void {
  feedFetcherDependencies = defaultFeedFetcherDependencies;
}

export function setFeedFetcherDependenciesForTesting(
  overrides: Partial<FeedFetcherDependencies>,
): void {
  feedFetcherDependencies = {
    ...defaultFeedFetcherDependencies,
    ...overrides,
  };
}

/** Builds a cache-safe full article map by reusing unchanged feed payloads from memory when available. */
function buildCachedArticleMap(
  changedArticlesByUrl: Map<string, ArticleRow[]>,
  cachedArticlesByUrl: Map<string, ArticleRow[]> | undefined,
  unchangedUrls: ReadonlySet<string>,
  allowedUrls: string[],
): Map<string, ArticleRow[]> {
  const result = new Map(changedArticlesByUrl);

  for (const url of unchangedUrls) {
    const cachedArticles = cachedArticlesByUrl?.get(url);
    if (!cachedArticles) {
      continue;
    }

    result.set(url, cachedArticles);
  }

  return new Map(allowedUrls.map((url) => [url, result.get(url) ?? []]));
}

function buildEmptyBatchResult(): BatchFeedResult {
  return {
    articles: new Map(),
    cachedCount: 0,
    cooldownLimitedCount: 0,
    errors: new Map(),
    lastFetchedByUrl: new Map(),
    refreshedCount: 0,
    resolution: "cache",
    unchangedUrls: new Set(),
  };
}

/** Returns feed URLs whose last-fetch timestamp already matches the client's copy. */
function collectUnchangedUrls(
  urls: string[],
  lastFetchedByUrl: ReadonlyMap<string, Date>,
  knownLastFetchedAtByUrl: ReadonlyMap<string, Date> | undefined,
): Set<string> {
  if (!knownLastFetchedAtByUrl || knownLastFetchedAtByUrl.size === 0) {
    return new Set();
  }

  return new Set(
    urls.filter((url) => {
      const knownLastFetchedAt = knownLastFetchedAtByUrl.get(url);
      const currentLastFetchedAt = lastFetchedByUrl.get(url);
      return (
        knownLastFetchedAt instanceof Date &&
        currentLastFetchedAt instanceof Date &&
        knownLastFetchedAt.getTime() === currentLastFetchedAt.getTime()
      );
    }),
  );
}

/** Returns only the requested URLs from a cached article map. */
function sliceArticleMapByUrls(
  articlesByUrl: ReadonlyMap<string, ArticleRow[]>,
  urls: string[],
): Map<string, ArticleRow[]> {
  return new Map(urls.map((url) => [url, articlesByUrl.get(url) ?? []]));
}
