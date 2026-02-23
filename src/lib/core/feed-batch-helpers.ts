/**
 * Internal helpers for fetchAndCacheFeedArticlesBatch.
 * Each helper handles one distinct step of the batch feed-fetch pipeline.
 */

import { CONFIG } from "@/lib/config";
import type { getDb } from "@/lib/db/db";
import { feedRecordFields } from "@/lib/db/feed-records";
import { feeds, feedSources } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  type FeedRecord,
  type UpstreamRefreshResult,
  refreshFeedFromUpstream,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
} from "./feed-refresh";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArticleRow = {
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

type RefreshDecision = {
  url: string;
  decision:
    | "missing-feed-record"
    | "skip-refresh-flag"
    | "refresh-force"
    | "force-cooldown-use-cache"
    | "refresh-stale"
    | "use-cache";
  lastFetched?: Date;
};

// ─── Step 1–3: Ownership + feed record resolution ────────────────────────────

/**
 * Verifies ownership of the requested URLs, loads (or creates) their Feed
 * records, and returns the allowed URL list with the feed-by-URL map.
 * Returns null when no URLs are owned by the user.
 */
export async function resolveAuthorizedFeedRecords(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedUrls: string[],
): Promise<{
  allowedUrls: string[];
  feedByUrl: Map<string, FeedRecord>;
} | null> {
  const ownedRows = await db
    .select({ url: feedSources.url })
    .from(feedSources)
    .where(
      and(eq(feedSources.userId, userId), inArray(feedSources.url, feedUrls)),
    );

  const ownedUrlSet = new Set(ownedRows.map((r) => r.url));
  const allowedUrls = feedUrls.filter((u) => ownedUrlSet.has(u));
  if (allowedUrls.length === 0) return null;

  const existingFeeds = await db
    .select(feedRecordFields)
    .from(feeds)
    .where(inArray(feeds.url, allowedUrls));

  const feedByUrl = new Map<string, FeedRecord>(
    existingFeeds.map((f) => [f.url, f]),
  );

  const missingUrls = allowedUrls.filter((u) => !feedByUrl.has(u));
  if (missingUrls.length > 0) {
    await db
      .insert(feeds)
      .values(missingUrls.map((url) => ({ url })))
      .onConflictDoNothing({ target: feeds.url });

    const resolvedFeeds = await db
      .select(feedRecordFields)
      .from(feeds)
      .where(inArray(feeds.url, missingUrls));

    for (const f of resolvedFeeds) feedByUrl.set(f.url, f);
  }

  return { allowedUrls, feedByUrl };
}

// ─── Step 3b: Refresh decisions (for diagnostics) ────────────────────────────

export function buildRefreshPlan(
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
  skipRefresh: boolean,
  forceRefresh: boolean,
): RefreshDecision[] {
  return allowedUrls.map((url) => {
    const feed = feedByUrl.get(url);
    if (!feed) return { url, decision: "missing-feed-record" };
    if (skipRefresh) return { url, decision: "skip-refresh-flag" };

    const isStale = shouldRefreshFeed(feed.lastFetched);
    const canForceRefresh = shouldForceRefreshFeed(feed.lastFetched);

    if (forceRefresh && (canForceRefresh || feed.lastFetchError !== null)) {
      return { url, decision: "refresh-force", lastFetched: feed.lastFetched };
    }
    if (forceRefresh && !canForceRefresh) {
      return {
        url,
        decision: "force-cooldown-use-cache",
        lastFetched: feed.lastFetched,
      };
    }
    return {
      url,
      decision: isStale ? "refresh-stale" : "use-cache",
      lastFetched: feed.lastFetched,
    };
  });
}

// ─── Step 4: Parallel upstream refresh ───────────────────────────────────────

/**
 * Runs all stale feed refreshes concurrently and surfaces both fresh and
 * persisted upstream errors. Returns the error map plus the count of feeds
 * that were actually refreshed (for diagnostics).
 */
export async function executeParallelRefreshes(
  db: ReturnType<typeof getDb>,
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
  skipRefresh: boolean,
  forceRefresh: boolean,
): Promise<{ errors: Map<string, string>; refreshedCount: number }> {
  const upstreamErrors = new Map<string, string>();
  let refreshedCount = 0;

  if (!skipRefresh) {
    const staleFeeds = allowedUrls
      .map((u) => feedByUrl.get(u))
      .filter((f): f is FeedRecord =>
        f
          ? forceRefresh
            ? // Bypass the cooldown for feeds with a stored error: the cooldown
              // exists to avoid hammering broken feeds on automatic cycles, but a
              // user-initiated force-refresh should always be able to retry them.
              shouldForceRefreshFeed(f.lastFetched) || f.lastFetchError !== null
            : shouldRefreshFeed(f.lastFetched)
          : false,
      );

    refreshedCount = staleFeeds.length;

    if (staleFeeds.length > 0) {
      const results = await Promise.allSettled(
        staleFeeds.map((feed) => refreshFeedFromUpstream(db, feed)),
      );

      for (const [index, settlement] of results.entries()) {
        const url = staleFeeds[index]?.url;
        if (!url) continue;

        if (settlement.status === "fulfilled") {
          const result: UpstreamRefreshResult = settlement.value;
          if (!result.ok) upstreamErrors.set(url, result.error);
        } else {
          const reason =
            settlement.reason instanceof Error
              ? settlement.reason.message
              : String(settlement.reason);
          upstreamErrors.set(url, reason);
          logger.warn("Unexpected refresh settlement rejection", {
            url,
            reason,
          });
        }
      }
    }
  }

  // Surface persisted upstream errors for feeds not refreshed this cycle
  for (const url of allowedUrls) {
    if (upstreamErrors.has(url)) continue;
    const feed = feedByUrl.get(url);
    if (feed?.lastFetchError) upstreamErrors.set(url, feed.lastFetchError);
  }

  return { errors: upstreamErrors, refreshedCount };
}

// ─── Step 5: Query articles ───────────────────────────────────────────────────

export async function queryTopArticlesPerFeed(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedIds: number[],
): Promise<RankedRow[]> {
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

  return Array.isArray(queryResult)
    ? (queryResult as RankedRow[])
    : (queryResult as { rows: RankedRow[] }).rows;
}

// ─── Step 5b: Result assembly ─────────────────────────────────────────────────

export function mapRowsToArticleMap(
  rows: RankedRow[],
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
): Map<string, ArticleRow[]> {
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
