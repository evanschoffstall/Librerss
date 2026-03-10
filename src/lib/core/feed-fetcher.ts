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

import { CONFIG } from "@/lib/config";
import type { getDb } from "@/lib/db/db";
import { ensureFeedRecordByUrl } from "@/lib/db/feed-records";
import { articles, articleStatuses, feedSources, users } from "@/lib/db/schema";
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

type FeedFetcherDependencies = {
  ensureFeedRecordByUrl: typeof ensureFeedRecordByUrl;
  buildRefreshPlan: typeof buildRefreshPlan;
  executeParallelRefreshes: typeof executeParallelRefreshes;
  mapRowsToArticleMap: typeof mapRowsToArticleMap;
  queryTopArticlesPerFeed: typeof queryTopArticlesPerFeed;
  resolveAuthorizedFeedRecords: typeof resolveAuthorizedFeedRecords;
  getCachedBatch: typeof getCachedBatch;
  invalidateUserCache: typeof invalidateUserCache;
  setCachedBatch: typeof setCachedBatch;
  diagInfo: typeof diagInfo;
  diagWarn: typeof diagWarn;
  refreshFeedFromUpstream: typeof refreshFeedFromUpstream;
  shouldForceRefreshFeed: typeof shouldForceRefreshFeed;
  shouldRefreshFeed: typeof shouldRefreshFeed;
};

const defaultFeedFetcherDependencies: FeedFetcherDependencies = {
  ensureFeedRecordByUrl,
  buildRefreshPlan,
  executeParallelRefreshes,
  mapRowsToArticleMap,
  queryTopArticlesPerFeed,
  resolveAuthorizedFeedRecords,
  getCachedBatch,
  invalidateUserCache,
  setCachedBatch,
  diagInfo,
  diagWarn,
  refreshFeedFromUpstream,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
};

let feedFetcherDependencies = defaultFeedFetcherDependencies;

export function setFeedFetcherDependenciesForTesting(
  overrides: Partial<FeedFetcherDependencies>,
): void {
  feedFetcherDependencies = {
    ...defaultFeedFetcherDependencies,
    ...overrides,
  };
}

export function resetFeedFetcherDependenciesForTesting(): void {
  feedFetcherDependencies = defaultFeedFetcherDependencies;
}

// ─── Error types ──────────────────────────────────────────────────────────────

/** Returned when the authenticated user doesn't own the requested feed source. */
class FeedSourceNotFoundError extends Error {
  constructor(feedUrl: string) {
    super(`Feed source not found for URL: ${feedUrl}`);
    this.name = "FeedSourceNotFoundError";
  }
}

export function isFeedSourceNotFoundError(
  error: unknown,
): error is FeedSourceNotFoundError {
  return (
    error instanceof FeedSourceNotFoundError ||
    (error instanceof Error && error.name === "FeedSourceNotFoundError")
  );
}

// ─── Batch fetch ──────────────────────────────────────────────────────────────

type BatchFeedResult = {
  articles: Map<string, ArticleRow[]>;
  errors: Map<string, string>;
  refreshedCount: number;
  cachedCount: number;
  cooldownLimitedCount: number;
  /** How the system resolved the request: memory cache, DB cache, or upstream fetch. */
  resolution: "memory" | "cache" | "upstream";
  lastFetchedByUrl: Map<string, Date>;
};

function buildEmptyBatchResult(): BatchFeedResult {
  return {
    articles: new Map(),
    errors: new Map(),
    refreshedCount: 0,
    cachedCount: 0,
    cooldownLimitedCount: 0,
    resolution: "cache",
    lastFetchedByUrl: new Map(),
  };
}

export async function fetchAndCacheFeedArticlesBatch(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedUrls: string[],
  {
    skipRefresh = false,
    forceRefresh = false,
    requestSource = "unspecified",
  }: {
    skipRefresh?: boolean;
    forceRefresh?: boolean;
    requestSource?: string;
  } = {},
): Promise<BatchFeedResult> {
  if (feedUrls.length === 0) return buildEmptyBatchResult();

  feedFetcherDependencies.diagInfo("Batch feed fetch started", {
    userId,
    requestedUrlCount: feedUrls.length,
    skipRefresh,
    forceRefresh,
    requestSource,
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
        userId,
        requestSource,
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
      feedFetcherDependencies.diagInfo(
        "Batch feed fetch served from memory cache",
        {
          userId,
          requestSource,
          feedCount: cachedCount,
          forceRefreshCooldownHit: allWithinCooldown,
        },
      );
      return {
        articles: cached.articles,
        errors: cached.errors,
        refreshedCount: 0,
        cachedCount,
        cooldownLimitedCount: allWithinCooldown ? cachedCount : 0,
        resolution: "memory" as const,
        lastFetchedByUrl: cached.lastFetchedByUrl,
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
      userId,
      requestedUrlCount: feedUrls.length,
    });
    return buildEmptyBatchResult();
  }

  const { allowedUrls, feedByUrl } = resolved;

  feedFetcherDependencies.diagInfo("Batch feed refresh plan", {
    userId,
    requestSource,
    allowedUrlCount: allowedUrls.length,
    missingFeedRecordCount: allowedUrls.filter((u) => !feedByUrl.has(u)).length,
    plan: feedFetcherDependencies.buildRefreshPlan(
      feedByUrl,
      allowedUrls,
      skipRefresh,
      forceRefresh,
    ),
  });

  const {
    errors: upstreamErrors,
    refreshedCount,
    cooldownLimitedCount,
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
        userId,
        requestSource,
        refreshedFeedCount: refreshedCount,
        failedFeedCount: upstreamErrors.size,
        failedUrls: [...upstreamErrors.keys()],
      });
    } else {
      feedFetcherDependencies.diagInfo(
        "Batch feed refresh skipped: all feeds fresh",
        {
          userId,
          requestSource,
          allowedUrlCount: allowedUrls.length,
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
      errors: upstreamErrors,
      refreshedCount,
      cachedCount: allowedUrls.length - refreshedCount,
      cooldownLimitedCount,
      resolution:
        refreshedCount > 0 ? ("upstream" as const) : ("cache" as const),
      lastFetchedByUrl: new Map(),
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

  const rows = await feedFetcherDependencies.queryTopArticlesPerFeed(
    db,
    userId,
    feedIds,
  );
  const articleMap = feedFetcherDependencies.mapRowsToArticleMap(
    rows,
    feedByUrl,
    allowedUrls,
  );

  feedFetcherDependencies.diagInfo("Batch feed fetch completed", {
    userId,
    requestSource,
    feedCount: articleMap.size,
    totalArticles: rows.length,
    upstreamErrorCount: upstreamErrors.size,
    articlesByUrl: [...articleMap.entries()].map(([url, items]) => ({
      url,
      articleCount: items.length,
      newestReturnedPublicationDate:
        items.length > 0 ? items[0]!.publicationDate.toISOString() : null,
      upstreamError: upstreamErrors.get(url) ?? null,
    })),
  });

  // ── Populate in-memory cache ─────────────────────────────────────────────
  // When feeds were refreshed upstream, other cached URL-set entries for this
  // user may contain stale article data. Invalidate everything first, then
  // store the fresh result so subsequent requests hit the cache.
  if (refreshedCount > 0) feedFetcherDependencies.invalidateUserCache(userId);
  feedFetcherDependencies.setCachedBatch(userId, allowedUrls, {
    articles: articleMap,
    errors: upstreamErrors,
    lastFetchedByUrl,
  });

  return {
    articles: articleMap,
    errors: upstreamErrors,
    refreshedCount,
    cachedCount: allowedUrls.length - refreshedCount,
    cooldownLimitedCount,
    resolution: refreshedCount > 0 ? ("upstream" as const) : ("cache" as const),
    lastFetchedByUrl,
  };
}

// ─── Single-feed wrapper ──────────────────────────────────────────────────────

/** Thrown when an upstream feed refresh fails so callers can return a proper error. */
class UpstreamFeedError extends Error {
  constructor(feedUrl: string, cause: string) {
    super(`Upstream feed fetch failed for ${feedUrl}: ${cause}`);
    this.name = "UpstreamFeedError";
  }
}

export function isUpstreamFeedError(
  error: unknown,
): error is UpstreamFeedError {
  return (
    error instanceof UpstreamFeedError ||
    (error instanceof Error && error.name === "UpstreamFeedError")
  );
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
  const [userSource] = await db
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

  if (!userSource) throw new FeedSourceNotFoundError(feedUrl);

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
      id: articles.id,
      title: articles.title,
      link: articles.link,
      content: articles.content,
      publicationDate: articles.publicationDate,
      feedId: articles.feedId,
      lastChecked: articles.lastChecked,
      isRead: sql<boolean>`coalesce(${articleStatuses.isRead}, false)`,
      isStarred: sql<boolean>`coalesce(${articleStatuses.isStarred}, false)`,
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
