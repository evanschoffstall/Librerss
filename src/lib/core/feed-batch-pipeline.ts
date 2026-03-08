/**
 * Internal helpers for fetchAndCacheFeedArticlesBatch.
 * Each helper handles one distinct step of the batch feed-fetch pipeline.
 */

import { CONFIG } from "@/lib/config";
import type { getDb } from "@/lib/db/db";
import { feedRecordFields } from "@/lib/db/feed-records";
import { feeds, feedSources } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { normalizeArticleHtmlSpacing } from "@/lib/sanitize";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  type FeedRecord,
  type UpstreamRefreshResult,
  refreshFeedFromUpstream,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
} from "./feed-refresh";

// ─── Concurrency helper ──────────────────────────────────────────────────────

async function settledWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]!() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return results;
}

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
 *
 * Uses a single JOIN query to resolve both ownership and feed records in one
 * DB round-trip (previously two separate queries).
 */
export async function resolveAuthorizedFeedRecords(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedUrls: string[],
): Promise<{
  allowedUrls: string[];
  feedByUrl: Map<string, FeedRecord>;
} | null> {
  // Single query: ownership check + feed record load via LEFT JOIN.
  const joinedRows = await db
    .select({
      sourceUrl: feedSources.url,
      feedId: feeds.id,
      feedUrl: feeds.url,
      lastFetched: feeds.lastFetched,
      lastFetchError: feeds.lastFetchError,
    })
    .from(feedSources)
    .leftJoin(feeds, eq(feeds.url, feedSources.url))
    .where(
      and(
        eq(feedSources.userId, userId),
        eq(feedSources.enabled, true),
        inArray(feedSources.url, feedUrls),
      ),
    );

  if (joinedRows.length === 0) return null;

  const allowedUrls = feedUrls.filter((u) =>
    joinedRows.some((r) => r.sourceUrl === u),
  );
  if (allowedUrls.length === 0) return null;

  const feedByUrl = new Map<string, FeedRecord>();
  for (const row of joinedRows) {
    if (
      row.feedId !== null &&
      row.feedUrl !== null &&
      row.lastFetched !== null
    ) {
      feedByUrl.set(row.sourceUrl, {
        id: row.feedId,
        url: row.feedUrl,
        lastFetched: row.lastFetched,
        lastFetchError: row.lastFetchError,
      });
    }
  }

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
): Promise<{
  errors: Map<string, string>;
  refreshedCount: number;
  cooldownLimitedCount: number;
  refreshedUrls: Set<string>;
}> {
  const upstreamErrors = new Map<string, string>();
  const refreshedUrls = new Set<string>();
  let cooldownLimitedCount = 0;

  if (!skipRefresh) {
    // For force-refresh, also retry feeds with a stored error regardless of cooldown —
    // the cooldown guards auto-cycles, but user-initiated retries should always run.
    const canRefresh = (f: FeedRecord): boolean =>
      forceRefresh
        ? shouldForceRefreshFeed(f.lastFetched) || f.lastFetchError !== null
        : shouldRefreshFeed(f.lastFetched);

    const staleFeeds = allowedUrls
      .map((u) => feedByUrl.get(u))
      .filter((f): f is FeedRecord => f !== undefined && canRefresh(f));

    for (const f of staleFeeds) refreshedUrls.add(f.url);

    if (forceRefresh) {
      cooldownLimitedCount = allowedUrls.filter((u) => {
        const f = feedByUrl.get(u);
        return (
          f &&
          !shouldForceRefreshFeed(f.lastFetched) &&
          f.lastFetchError === null
        );
      }).length;
    }

    if (staleFeeds.length > 0) {
      const concurrency: number = CONFIG.FEED_BATCH_CONCURRENCY ?? 8;
      const results = await settledWithConcurrency(
        staleFeeds.map((feed) => () => refreshFeedFromUpstream(db, feed)),
        concurrency,
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

  return {
    errors: upstreamErrors,
    refreshedCount: refreshedUrls.size,
    cooldownLimitedCount,
    refreshedUrls,
  };
}

// ─── Step 5: Query articles ───────────────────────────────────────────────────

export async function queryTopArticlesPerFeed(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedIds: number[],
): Promise<RankedRow[]> {
  // LATERAL JOIN lets PostgreSQL use the (feed_id, publication_date) composite
  // index to grab only the top-N rows per feed via an index scan, instead of
  // the ROW_NUMBER() window function which scans ALL rows before filtering.
  const queryResult = await db.execute<RankedRow>(sql`
    SELECT a.id, a.title, a.link, a.content,
           a.publication_date AS "publicationDate",
           a.feed_id          AS "feedId",
           a.last_checked     AS "lastChecked",
           COALESCE(s.is_read, false)    AS "isRead",
           COALESCE(s.is_starred, false) AS "isStarred"
    FROM unnest(ARRAY[${sql.join(
      feedIds.map((id) => sql`${id}`),
      sql`, `,
    )}]::int[]) AS fid(id)
    CROSS JOIN LATERAL (
      SELECT sub.id, sub.title, sub.link, sub.content,
             sub.publication_date, sub.feed_id, sub.last_checked
      FROM "Article" sub
      WHERE sub.feed_id = fid.id
      ORDER BY sub.publication_date DESC
      LIMIT ${CONFIG.MAX_ARTICLES_PER_FEED}
    ) a
    LEFT JOIN "ArticleStatus" s
      ON s.article_id = a.id AND s.user_id = ${userId}
    ORDER BY a.publication_date DESC
  `);

  return Array.isArray(queryResult)
    ? (queryResult as RankedRow[])
    : (queryResult as { rows: RankedRow[] }).rows;
}

// ─── Step 5b: Result assembly ─────────────────────────────────────────────────

function isValidRankedRow(row: RankedRow): boolean {
  return (
    (typeof row.id === "number" || typeof row.id === "string") &&
    (typeof row.title === "string" || row.title === null) &&
    (typeof row.link === "string" || row.link === null) &&
    (typeof row.content === "string" || row.content === null) &&
    (typeof row.publicationDate === "string" ||
      row.publicationDate instanceof Date) &&
    (typeof row.feedId === "number" || typeof row.feedId === "string") &&
    (typeof row.lastChecked === "string" || row.lastChecked instanceof Date) &&
    (typeof row.isRead === "boolean" ||
      row.isRead === null ||
      typeof row.isRead === "number") &&
    (typeof row.isStarred === "boolean" ||
      row.isStarred === null ||
      typeof row.isStarred === "number")
  );
}

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
    // SECURITY: Validate row shape before coercion to prevent NaN/undefined injection
    if (!isValidRankedRow(row)) {
      logger.warn("Skipping malformed article row from database", {
        rowKeys: Object.keys(row),
      });
      continue;
    }

    const url = idToUrl.get(Number(row.feedId));
    if (!url) continue;

    const id = Number(row.id);
    const feedId = Number(row.feedId);

    // Additional safety: reject NaN after coercion
    if (!Number.isFinite(id) || !Number.isFinite(feedId)) {
      logger.warn("Skipping article with invalid numeric ID", {
        id: row.id,
        feedId: row.feedId,
      });
      continue;
    }

    result.get(url)!.push({
      id,
      title: String(row.title ?? ""),
      link: String(row.link ?? ""),
      content: normalizeArticleHtmlSpacing(String(row.content ?? "")),
      publicationDate: new Date(row.publicationDate as string | Date),
      feedId,
      lastChecked: new Date(row.lastChecked as string | Date),
      isRead: Boolean(row.isRead),
      isStarred: Boolean(row.isStarred),
    });
  }

  return result;
}
