/**
 * Public API for fetching and caching feed articles.
 *
 * DB access pattern for batch (regardless of N):
 *   1. One SELECT to verify ownership of all URLs.
 *   2. One SELECT to load all Feed records + lastFetched timestamps.
 *   3. If any Feed records are missing: one INSERT + one SELECT to resolve them.
 *   4. All stale upstream HTTP refreshes run in parallel (Promise.allSettled).
 *   5. One window-function SELECT to retrieve top-N articles per feed.
 */

import { CONFIG } from "@/lib/config";
import type { getDb } from "@/lib/db/db";
import { ensureFeedRecordByUrl } from "@/lib/db/feed-records";
import { articles, articleStatuses, feeds, feedSources } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  type ArticleRow,
  buildRefreshPlan,
  executeParallelRefreshes,
  mapRowsToArticleMap,
  queryTopArticlesPerFeed,
  resolveAuthorizedFeedRecords,
} from "./feed-batch-helpers";
import {
  type FeedRecord,
  refreshFeedFromUpstream,
  shouldRefreshFeed,
} from "./feed-refresh";

// Re-export for callers that still reference these from here.
export { isAllowedFeedUrl, PUBLIC_FEED_URL_ERROR } from "./feed-url-validator";

const DIAG = CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED;

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
  lastFetchedByUrl: Map<string, Date>;
};

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
  if (feedUrls.length === 0)
    return {
      articles: new Map(),
      errors: new Map(),
      refreshedCount: 0,
      cachedCount: 0,
      lastFetchedByUrl: new Map(),
    };

  if (DIAG) {
    logger.info("Batch feed fetch started", {
      userId,
      requestedUrlCount: feedUrls.length,
      skipRefresh,
      forceRefresh,
      requestSource,
    });
  }

  const resolved = await resolveAuthorizedFeedRecords(db, userId, feedUrls);
  if (!resolved) {
    if (DIAG) {
      logger.warn("Batch feed fetch denied: no owned URLs", {
        userId,
        requestedUrlCount: feedUrls.length,
      });
    }
    return {
      articles: new Map(),
      errors: new Map(),
      refreshedCount: 0,
      cachedCount: 0,
      lastFetchedByUrl: new Map(),
    };
  }

  const { allowedUrls, feedByUrl } = resolved;

  if (DIAG) {
    const plan = buildRefreshPlan(
      feedByUrl,
      allowedUrls,
      skipRefresh,
      forceRefresh,
    );
    logger.info("Batch feed refresh plan", {
      userId,
      requestSource,
      allowedUrlCount: allowedUrls.length,
      missingFeedRecordCount: allowedUrls.filter((u) => !feedByUrl.has(u))
        .length,
      plan,
    });
  }

  const { errors: upstreamErrors, refreshedCount } =
    await executeParallelRefreshes(
      db,
      feedByUrl,
      allowedUrls,
      skipRefresh,
      forceRefresh,
    );

  if (DIAG && !skipRefresh) {
    if (refreshedCount > 0) {
      logger.info("Batch feed upstream refresh executed", {
        userId,
        requestSource,
        refreshedFeedCount: refreshedCount,
        failedFeedCount: upstreamErrors.size,
        failedUrls: [...upstreamErrors.keys()],
      });
    } else {
      logger.info("Batch feed refresh skipped: all feeds fresh", {
        userId,
        requestSource,
        allowedUrlCount: allowedUrls.length,
      });
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
      lastFetchedByUrl: new Map(),
    };
  }

  const currentLastFetchedRows = await db
    .select({ url: feeds.url, lastFetched: feeds.lastFetched })
    .from(feeds)
    .where(inArray(feeds.url, allowedUrls));

  const lastFetchedByUrl = new Map<string, Date>(
    currentLastFetchedRows.map((row) => [row.url, row.lastFetched]),
  );

  const rows = await queryTopArticlesPerFeed(db, userId, feedIds);
  const result = mapRowsToArticleMap(rows, feedByUrl, allowedUrls);

  if (DIAG) {
    logger.info("Batch feed fetch completed", {
      userId,
      requestSource,
      feedCount: result.size,
      totalArticles: rows.length,
      upstreamErrorCount: upstreamErrors.size,
      articlesByUrl: [...result.entries()].map(([url, items]) => ({
        url,
        articleCount: items.length,
        newestReturnedPublicationDate:
          items.length > 0 ? items[0].publicationDate.toISOString() : null,
        upstreamError: upstreamErrors.get(url) ?? null,
      })),
    });
  }

  const cachedCount = allowedUrls.length - refreshedCount;
  return {
    articles: result,
    errors: upstreamErrors,
    refreshedCount,
    cachedCount,
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
    .where(and(eq(feedSources.userId, userId), eq(feedSources.url, feedUrl)))
    .limit(1);

  if (!userSource) throw new FeedSourceNotFoundError(feedUrl);

  const feed = (await ensureFeedRecordByUrl(db, feedUrl)) as FeedRecord;

  const needsRefresh = shouldRefreshFeed(feed.lastFetched);
  if (needsRefresh) {
    const result = await refreshFeedFromUpstream(db, feed);
    if (!result.ok) {
      throw new UpstreamFeedError(feedUrl, result.error);
    }
    logger.info(`📡 Single feed: 1 refreshed, 0 cached`);
  } else {
    logger.info(`💾 Single feed: 0 refreshed, 1 cached`);
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
