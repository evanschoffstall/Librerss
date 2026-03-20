/**
 * Internal helpers for fetchAndCacheFeedArticlesBatch.
 * Each helper handles one distinct step of the batch feed-fetch pipeline.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import type { getDb } from "@/lib/db/db";

import { CONFIG } from "@/lib/config";
import { ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH } from "@/lib/core/article-preview";
import { feedRecordFields } from "@/lib/db/feed-records";
import { feeds, feedSources } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { toPlainText } from "@/lib/sanitize";

import {
  type FeedRecord,
  refreshFeedFromUpstream,
  shouldForceRefreshFeed,
  shouldRefreshFeed,
  type UpstreamRefreshResult,
} from "./feed-refresh";

// ─── Concurrency helper ──────────────────────────────────────────────────────

export interface ArticleRow {
  content: string;
  feedId: number;
  hasFullContent?: boolean;
  id: number;
  isRead: boolean;
  isStarred: boolean;
  lastChecked: Date;
  link: string;
  publicationDate: Date;
  title: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RankedRow extends Record<string, unknown> {
  content: unknown;
  feedId: unknown;
  id: unknown;
  isRead: unknown;
  isStarred: unknown;
  lastChecked: unknown;
  link: unknown;
  publicationDate: unknown;
  title: unknown;
}

interface RefreshDecision {
  decision:
    | "force-cooldown-use-cache"
    | "missing-feed-record"
    | "refresh-force"
    | "refresh-stale"
    | "skip-refresh-flag"
    | "use-cache";
  lastFetched?: Date;
  url: string;
}

export function buildRefreshPlan(
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
  skipRefresh: boolean,
  forceRefresh: boolean,
): RefreshDecision[] {
  return allowedUrls.map((url) => {
    const feed = feedByUrl.get(url);
    if (!feed) return { decision: "missing-feed-record", url };
    if (skipRefresh) return { decision: "skip-refresh-flag", url };

    const isStale = shouldRefreshFeed(feed.lastFetched);
    const canForceRefresh = shouldForceRefreshFeed(feed.lastFetched);

    if (forceRefresh && (canForceRefresh || feed.lastFetchError !== null)) {
      return { decision: "refresh-force", lastFetched: feed.lastFetched, url };
    }
    if (forceRefresh && !canForceRefresh) {
      return {
        decision: "force-cooldown-use-cache",
        lastFetched: feed.lastFetched,
        url,
      };
    }
    return {
      decision: isStale ? "refresh-stale" : "use-cache",
      lastFetched: feed.lastFetched,
      url,
    };
  });
}

// ─── Step 1–3: Ownership + feed record resolution ────────────────────────────

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
  cooldownLimitedCount: number;
  errors: Map<string, string>;
  refreshedCount: number;
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
      const concurrency: number = CONFIG.FEED_BATCH_CONCURRENCY;
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
            reason,
            url,
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
    cooldownLimitedCount,
    errors: upstreamErrors,
    refreshedCount: refreshedUrls.size,
    refreshedUrls,
  };
}

// ─── Step 3b: Refresh decisions (for diagnostics) ────────────────────────────

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
        feedId: row.feedId,
        id: row.id,
      });
      continue;
    }

    const articlesForUrl = result.get(url);
    if (!articlesForUrl) continue;

    const previewSource = typeof row.content === "string" ? row.content : "";

    articlesForUrl.push({
      content: toPlainText(stripPreviewSpanWrappers(previewSource)),
      feedId,
      hasFullContent: false,
      id,
      isRead: Boolean(row.isRead),
      isStarred: Boolean(row.isStarred),
      lastChecked: new Date(row.lastChecked as Date | string),
      link: typeof row.link === "string" ? row.link : "",
      publicationDate: new Date(row.publicationDate as Date | string),
      title: typeof row.title === "string" ? row.title : "",
    });
  }

  return result;
}

export async function queryTopArticlesPerFeed(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedIds: number[],
): Promise<RankedRow[]> {
  // LATERAL JOIN lets PostgreSQL use the (feed_id, publication_date) composite
  // index to grab only the top-N rows per feed via an index scan, instead of
  // the ROW_NUMBER() window function which scans ALL rows before filtering.
  // The outer LIMIT caps total rows across the entire batch so an all-feeds
  // dashboard load cannot pull feedCount * MAX_ARTICLES_PER_FEED full article
  // bodies from Neon in one query. The inner projection strips HTML tags
  // before clipping the preview source so leading image/embed markup does not
  // consume the collapsed preview budget; final plain-text normalization still
  // happens in application code.
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
      SELECT sub.id,
             sub.title,
             sub.link,
             LEFT(
               regexp_replace(
                 regexp_replace(sub.content, '<[^>]+>', ' ', 'gi'),
                 '\\s+',
                 ' ',
                 'g'
               ),
               ${ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH}
             ) AS content,
             sub.publication_date, sub.feed_id, sub.last_checked
      FROM "Article" sub
      WHERE sub.feed_id = fid.id
      ORDER BY sub.publication_date DESC
      LIMIT ${CONFIG.MAX_ARTICLES_PER_FEED}
    ) a
    LEFT JOIN "ArticleStatus" s
      ON s.article_id = a.id AND s.user_id = ${userId}
    ORDER BY a.publication_date DESC
    LIMIT ${CONFIG.MAX_ALL_ARTICLES_LIMIT}
  `);

  return Array.isArray(queryResult)
    ? (queryResult as RankedRow[])
    : (queryResult as { rows: RankedRow[] }).rows;
}

// ─── Step 4: Parallel upstream refresh ───────────────────────────────────────

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
): Promise<null | {
  allowedUrls: string[];
  feedByUrl: Map<string, FeedRecord>;
}> {
  // Single query: ownership check + feed record load via LEFT JOIN.
  const joinedRows = await db
    .select({
      feedId: feeds.id,
      feedUrl: feeds.url,
      lastFetched: feeds.lastFetched,
      lastFetchError: feeds.lastFetchError,
      sourceUrl: feedSources.url,
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
        lastFetched: row.lastFetched,
        lastFetchError: row.lastFetchError,
        url: row.feedUrl,
      });
    }
  }

  const missingUrls = allowedUrls.filter((u) => !feedByUrl.has(u));
  if (missingUrls.length > 0) {
    // Insert missing feed records and get them back in one round-trip.
    // onConflictDoUpdate with a no-op SET guarantees RETURNING always fires
    // even when a concurrent insert beat us to it (race-safe).
    const newFeeds = await db
      .insert(feeds)
      .values(missingUrls.map((url) => ({ url })))
      .onConflictDoUpdate({
        set: { url: sql`excluded.url` },
        target: feeds.url,
      })
      .returning(feedRecordFields);

    for (const f of newFeeds) feedByUrl.set(f.url, f);
  }

  return { allowedUrls, feedByUrl };
}

// ─── Step 5: Query articles ───────────────────────────────────────────────────

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

// ─── Step 5b: Result assembly ─────────────────────────────────────────────────

async function settledWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results = [] as PromiseSettledResult<T>[];
  results.length = tasks.length;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (reason) {
        results[i] = { reason, status: "rejected" };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
  return results;
}

function stripPreviewSpanWrappers(value: string): string {
  return value.replace(/<\/?span\b[^>]*>/gi, "");
}
