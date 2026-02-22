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
import { articleStatuses, articles, feeds, feedSources } from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type FeedRecord, refreshFeedFromUpstream, shouldRefreshFeed } from "./feed-refresh";

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

async function ensureFeedRecord(
  db: ReturnType<typeof getDb>,
  feedUrl: string,
): Promise<FeedRecord> {
  const [existing] = await db
    .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
    .from(feeds)
    .where(eq(feeds.url, feedUrl))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(feeds)
    .values({ url: feedUrl })
    .onConflictDoNothing({ target: feeds.url })
    .returning({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched });

  if (created) return created;

  // Concurrent insert — re-select.
  const [persisted] = await db
    .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
    .from(feeds)
    .where(eq(feeds.url, feedUrl))
    .limit(1);

  if (!persisted) throw new Error("Unable to resolve feed record");
  return persisted;
}

// ─── Batch fetch ──────────────────────────────────────────────────────────────

export async function fetchAndCacheFeedArticlesBatch(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedUrls: string[],
  { skipRefresh = false }: { skipRefresh?: boolean } = {},
): Promise<Map<string, ArticleRow[]>> {
  if (feedUrls.length === 0) return new Map();

  // 1. Ownership check
  const ownedRows = await db
    .select({ url: feedSources.url })
    .from(feedSources)
    .where(and(eq(feedSources.userId, userId), inArray(feedSources.url, feedUrls)));

  const ownedUrlSet = new Set(ownedRows.map((r) => r.url));
  const allowedUrls = feedUrls.filter((u) => ownedUrlSet.has(u));
  if (allowedUrls.length === 0) return new Map();

  // 2. Load existing Feed records
  const existingFeeds = await db
    .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
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
      .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
      .from(feeds)
      .where(inArray(feeds.url, missingUrls));

    for (const f of resolvedFeeds) feedByUrl.set(f.url, f);
  }

  // 4. Refresh stale feeds in parallel
  if (!skipRefresh) {
    const staleFeeds = allowedUrls
      .map((u) => feedByUrl.get(u))
      .filter((f): f is FeedRecord => Boolean(f) && shouldRefreshFeed(f!.lastFetched));

    if (staleFeeds.length > 0) {
      await Promise.allSettled(
        staleFeeds.map((feed) => refreshFeedFromUpstream(db, feed)),
      );
    }
  }

  // 5. Read articles with ROW_NUMBER() window function (1 query for all feeds)
  const feedIds = allowedUrls
    .map((u) => feedByUrl.get(u)?.id)
    .filter((id): id is number => id !== undefined);

  if (feedIds.length === 0) return new Map(allowedUrls.map((u) => [u, []]));

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

  return result;
}

// ─── Single-feed wrapper ──────────────────────────────────────────────────────

/**
 * Fetches and caches articles for one feed URL.
 * @throws {FeedSourceNotFoundError} if userId doesn't own the feed.
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

  const feed = await ensureFeedRecord(db, feedUrl);

  if (shouldRefreshFeed(feed.lastFetched)) {
    await refreshFeedFromUpstream(db, feed);
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
