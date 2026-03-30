/**
 * Internal helpers for fetchAndCacheFeedArticlesBatch.
 * Each helper handles one distinct step of the batch feed-fetch pipeline.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import type { getDb } from "@/lib/db/db";

import { feedRecordFields } from "@/lib/db/feed-records";
import { feeds, feedSources } from "@/lib/db/schema";

import { type FeedRecord } from "./feed-refresh";

export { mapRowsToArticleMap, queryTopArticlesPerFeed } from "./feed-batch-pipeline-articles";
export { buildRefreshPlan, executeParallelRefreshes } from "./feed-batch-pipeline-refresh";
export type { ArticleRow, RankedRow } from "./feed-batch-pipeline.types";

// ─── Step 1–3: Ownership + feed record resolution ────────────────────────────

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
      proxyEnabled: feedSources.proxyEnabled,
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
        proxyEnabled: row.proxyEnabled,
        url: row.feedUrl,
      });
    }
  }

  const missingUrls = allowedUrls.filter((u) => !feedByUrl.has(u));
  if (missingUrls.length > 0) {
    const sourceProxyEnabledByUrl = new Map(
      joinedRows.map((row) => [row.sourceUrl, row.proxyEnabled] as const),
    );

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

    for (const f of newFeeds) {
      feedByUrl.set(f.url, {
        ...f,
        proxyEnabled: sourceProxyEnabledByUrl.get(f.url) === true,
      });
    }
  }

  return { allowedUrls, feedByUrl };
}

