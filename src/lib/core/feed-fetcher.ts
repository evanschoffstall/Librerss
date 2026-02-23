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
  type FeedRecord,
  type UpstreamRefreshResult,
  refreshFeedFromUpstream,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
} from "./feed-refresh";

// Re-export for callers that still reference these from here.
export { isAllowedFeedUrl, PUBLIC_FEED_URL_ERROR } from "./feed-url-validator";

// ─── Error types ──────────────────────────────────────────────────────────────

/** Returned when the authenticated user doesn't own the requested feed source. */
export class FeedSourceNotFoundError extends Error {
  constructor(feedUrl: string) {
    super(`Feed source not found for URL: ${feedUrl}`);
    this.name = "FeedSourceNotFoundError";
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type ArticleRow = {
  id: number;
  title: string;
  link: string;
  content: string;
  publicationDate: Date;
  feedId: number;
  lastChecked: Date;
  isRead: boolean;
  isStarred: boolean;
};

// ─── Batch fetch ──────────────────────────────────────────────────────────────

export type BatchFeedResult = {
  articles: Map<string, ArticleRow[]>;
  errors: Map<string, string>;
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
  if (feedUrls.length === 0) return { articles: new Map(), errors: new Map() };

  if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
    logger.info("Batch feed fetch started", {
      userId,
      requestedUrlCount: feedUrls.length,
      skipRefresh,
      forceRefresh,
      requestSource,
    });
  }

  // 1. Ownership check
  const ownedRows = await db
    .select({ url: feedSources.url })
    .from(feedSources)
    .where(
      and(eq(feedSources.userId, userId), inArray(feedSources.url, feedUrls)),
    );

  const ownedUrlSet = new Set(ownedRows.map((r) => r.url));
  const allowedUrls = feedUrls.filter((u) => ownedUrlSet.has(u));
  if (allowedUrls.length === 0) {
    if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
      logger.warn("Batch feed fetch denied: no owned URLs", {
        userId,
        requestedUrlCount: feedUrls.length,
      });
    }
    return { articles: new Map(), errors: new Map() };
  }

  // 2. Load existing Feed records
  const existingFeeds = await db
    .select({
      id: feeds.id,
      url: feeds.url,
      lastFetched: feeds.lastFetched,
      lastFetchError: feeds.lastFetchError,
    })
    .from(feeds)
    .where(inArray(feeds.url, allowedUrls));

  const feedByUrl = new Map<string, FeedRecord>(
    existingFeeds.map((f) => [f.url, f]),
  );

  // 3. Create missing Feed records
  const missingUrls = allowedUrls.filter((u) => !feedByUrl.has(u));
  if (missingUrls.length > 0) {
    await db
      .insert(feeds)
      .values(missingUrls.map((url) => ({ url })))
      .onConflictDoNothing({ target: feeds.url });

    const resolvedFeeds = await db
      .select({
        id: feeds.id,
        url: feeds.url,
        lastFetched: feeds.lastFetched,
        lastFetchError: feeds.lastFetchError,
      })
      .from(feeds)
      .where(inArray(feeds.url, missingUrls));

    for (const f of resolvedFeeds) feedByUrl.set(f.url, f);
  }

  const refreshPlan = allowedUrls.map((url) => {
    const feed = feedByUrl.get(url);
    if (!feed) {
      return { url, decision: "missing-feed-record" as const };
    }
    if (skipRefresh) {
      return { url, decision: "skip-refresh-flag" as const };
    }

    const isStale = shouldRefreshFeed(feed.lastFetched);
    const canForceRefresh = shouldForceRefreshFeed(feed.lastFetched);
    if (forceRefresh && canForceRefresh) {
      return {
        url,
        decision: "refresh-force" as const,
        lastFetched: feed.lastFetched,
      };
    }

    if (forceRefresh && !canForceRefresh) {
      return {
        url,
        decision: "force-cooldown-use-cache" as const,
        lastFetched: feed.lastFetched,
      };
    }

    return {
      url,
      decision: isStale ? ("refresh-stale" as const) : ("use-cache" as const),
      lastFetched: feed.lastFetched,
    };
  });

  if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
    logger.info("Batch feed refresh plan", {
      userId,
      requestSource,
      allowedUrlCount: allowedUrls.length,
      missingFeedRecordCount: missingUrls.length,
      plan: refreshPlan,
    });
  }

  // 4. Refresh stale feeds in parallel, tracking upstream errors
  const upstreamErrors = new Map<string, string>();

  if (!skipRefresh) {
    const staleFeeds = allowedUrls
      .map((u) => feedByUrl.get(u))
      .filter((f): f is FeedRecord => {
        if (!f) {
          return false;
        }

        return forceRefresh
          ? shouldForceRefreshFeed(f.lastFetched)
          : shouldRefreshFeed(f.lastFetched);
      });

    if (staleFeeds.length > 0) {
      const refreshResults = await Promise.allSettled(
        staleFeeds.map(
          async (
            feed,
          ): Promise<{ url: string; result: UpstreamRefreshResult }> => {
            const result = await refreshFeedFromUpstream(db, feed);
            return { url: feed.url, result };
          },
        ),
      );

      for (const settlement of refreshResults) {
        if (settlement.status === "fulfilled") {
          const { url, result } = settlement.value;
          if (!result.ok) {
            upstreamErrors.set(url, result.error);
          }
        } else {
          // Promise itself rejected (shouldn't happen since refreshFeedFromUpstream catches)
          logger.warn("Unexpected refresh settlement rejection", {
            reason: String(settlement.reason),
          });
        }
      }

      if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
        logger.info("Batch feed upstream refresh executed", {
          userId,
          requestSource,
          refreshedFeedCount: staleFeeds.length,
          failedFeedCount: upstreamErrors.size,
          failedUrls: [...upstreamErrors.keys()],
        });
      }
    } else {
      if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
        logger.info("Batch feed refresh skipped: all feeds fresh", {
          userId,
          requestSource,
          allowedUrlCount: allowedUrls.length,
        });
      }
    }
  }

  // 4b. For feeds that weren't refreshed this cycle, surface any persisted
  // upstream error so the client still sees the failure status.
  for (const url of allowedUrls) {
    if (upstreamErrors.has(url)) continue; // already tracked from this refresh
    const feed = feedByUrl.get(url);
    if (feed?.lastFetchError) {
      upstreamErrors.set(url, feed.lastFetchError);
    }
  }

  // 5. Read articles with ROW_NUMBER() window function (1 query for all feeds)
  const feedIds = allowedUrls
    .map((u) => feedByUrl.get(u)?.id)
    .filter((id): id is number => id !== undefined);

  if (feedIds.length === 0)
    return {
      articles: new Map(allowedUrls.map((u) => [u, []])),
      errors: upstreamErrors,
    };

  type RankedRow = {
    id: unknown;
    title: unknown;
    link: unknown;
    content: unknown;
    publicationDate: unknown;
    feedId: unknown;
    lastChecked: unknown;
    isRead: unknown;
    isStarred: unknown;
  };

  const queryResult = await db.execute<RankedRow>(sql`
    SELECT id, title, link, content,
           publication_date AS "publicationDate",
           feed_id          AS "feedId",
           last_checked     AS "lastChecked",
           "isRead",
           "isStarred"
    FROM (
      SELECT a.id,
             a.title,
             a.link,
             a.content,
             a.publication_date,
             a.feed_id,
             a.last_checked,
             COALESCE(s.is_read, false) AS "isRead",
             COALESCE(s.is_starred, false) AS "isStarred",
             ROW_NUMBER() OVER (
               PARTITION BY a.feed_id ORDER BY a.publication_date DESC
             ) AS rn
      FROM "Article" a
      LEFT JOIN "ArticleStatus" s
        ON s.article_id = a.id AND s.user_id = ${userId}
      WHERE a.feed_id IN (${sql.join(
        feedIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    ) ranked
    WHERE rn <= ${CONFIG.MAX_ARTICLES_PER_FEED}
    ORDER BY publication_date DESC
  `);

  const rows: RankedRow[] = Array.isArray(queryResult)
    ? queryResult
    : (queryResult as { rows: RankedRow[] }).rows;

  const idToUrl = new Map<number, string>(
    allowedUrls
      .map((u): [number, string] | null => {
        const id = feedByUrl.get(u)?.id;
        return id !== undefined ? [id, u] : null;
      })
      .filter((e): e is [number, string] => e !== null),
  );

  const result = new Map<string, ArticleRow[]>(allowedUrls.map((u) => [u, []]));

  for (const row of rows) {
    const url = idToUrl.get(Number(row.feedId));
    if (!url) continue;
    result.get(url)!.push({
      id: Number(row.id),
      title: String(row.title),
      link: String(row.link),
      content: String(row.content),
      publicationDate: new Date(row.publicationDate as string | Date),
      feedId: Number(row.feedId),
      lastChecked: new Date(row.lastChecked as string | Date),
      isRead: Boolean(row.isRead),
      isStarred: Boolean(row.isStarred),
    });
  }

  if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
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

  return { articles: result, errors: upstreamErrors };
}

// ─── Single-feed wrapper ──────────────────────────────────────────────────────

/** Thrown when an upstream feed refresh fails so callers can return a proper error. */
export class UpstreamFeedError extends Error {
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
  const [userSource] = await db
    .select({ id: feedSources.id })
    .from(feedSources)
    .where(and(eq(feedSources.userId, userId), eq(feedSources.url, feedUrl)))
    .limit(1);

  if (!userSource) throw new FeedSourceNotFoundError(feedUrl);

  const feed = (await ensureFeedRecordByUrl(db, feedUrl)) as FeedRecord;

  if (shouldRefreshFeed(feed.lastFetched)) {
    const result = await refreshFeedFromUpstream(db, feed);
    if (!result.ok) {
      throw new UpstreamFeedError(feedUrl, result.error);
    }
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
