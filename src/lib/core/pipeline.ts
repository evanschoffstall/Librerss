/**
 * Internal helpers for fetchAndCacheFeedArticlesBatch.
 * Each helper handles one distinct step of the batch feed-fetch pipeline.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { type FeedRecord } from "./refresher";

type DbMod = typeof import("@/lib/db");

export {
  mapRowsToArticleMap,
  queryTopArticlesPerFeed,
} from "./article-batches";
export type { ArticleRow, RankedRow } from "./batch-types";
export { buildRefreshPlan, executeParallelRefreshes } from "./refresh-plans";

/**
 * Verifies ownership of the requested URLs, loads (or creates) their Feed
 * records, and returns the allowed URL list with the feed-by-URL map.
 * Returns null when no URLs are owned by the user.
 *
 * Uses a single JOIN query to resolve both ownership and feed records in one
 * DB round-trip (previously two separate queries).
 */
export async function resolveAuthorizedFeedRecords(
  db: ReturnType<DbMod["getDb"]>,
  userId: number,
  feedUrls: string[],
): Promise<null | {
  allowedUrls: string[];
  feedByUrl: Map<string, FeedRecord>;
}> {
  const joinedRows = await listAuthorizedFeedRows(db, userId, feedUrls);
  return resolveAuthorizedFeedRecordResult(db, feedUrls, joinedRows);
}

async function insertMissingFeedRecords(
  db: ReturnType<DbMod["getDb"]>,
  joinedRows: { proxyEnabled: boolean | null; sourceUrl: string }[],
  missingUrls: string[],
  feedByUrl: Map<string, FeedRecord>,
): Promise<void> {
  if (missingUrls.length === 0) {
    return;
  }

  const { feedRecordFields, feeds } = await import("@/lib/db");
  const sourceProxyEnabledByUrl = new Map(
    joinedRows.map((row) => [row.sourceUrl, row.proxyEnabled] as const),
  );
  const newFeeds = await db
    .insert(feeds)
    .values(missingUrls.map((url) => ({ url })))
    .onConflictDoUpdate({
      set: { url: sql`excluded.url` },
      target: feeds.url,
    })
    .returning(feedRecordFields);

  for (const feed of newFeeds) {
    feedByUrl.set(feed.url, {
      ...feed,
      proxyEnabled: sourceProxyEnabledByUrl.get(feed.url) === true,
    });
  }
}

async function listAuthorizedFeedRows(
  db: ReturnType<DbMod["getDb"]>,
  userId: number,
  feedUrls: string[],
) {
  const { feeds, feedSources } = await import("@/lib/db");
  return db
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
}

function resolveAllowedUrls(
  feedUrls: string[],
  joinedRows: { sourceUrl: string }[],
): string[] {
  const ownedUrls = new Set(joinedRows.map((row) => row.sourceUrl));
  return feedUrls.filter((url) => ownedUrls.has(url));
}

async function resolveAuthorizedFeedRecordResult(
  db: ReturnType<DbMod["getDb"]>,
  feedUrls: string[],
  joinedRows: Awaited<ReturnType<typeof listAuthorizedFeedRows>>,
) {
  if (joinedRows.length === 0) {
    return null;
  }

  const allowedUrls = resolveAllowedUrls(feedUrls, joinedRows);
  if (allowedUrls.length === 0) {
    return null;
  }

  const feedByUrl = new Map<string, FeedRecord>();
  setExistingFeedRecords(joinedRows, feedByUrl);
  await insertMissingFeedRecords(
    db,
    joinedRows,
    allowedUrls.filter((url) => !feedByUrl.has(url)),
    feedByUrl,
  );

  return { allowedUrls, feedByUrl };
}

// ─── Step 1–3: Ownership + feed record resolution ────────────────────────────

// ─── Step 4: Parallel upstream refresh ───────────────────────────────────────

function setExistingFeedRecords(
  joinedRows: {
    feedId: null | number;
    feedUrl: null | string;
    lastFetched: Date | null;
    lastFetchError: null | string;
    proxyEnabled: boolean | null;
    sourceUrl: string;
  }[],
  feedByUrl: Map<string, FeedRecord>,
): void {
  for (const row of joinedRows) {
    if (
      row.feedId === null ||
      row.feedUrl === null ||
      row.lastFetched === null
    ) {
      continue;
    }

    feedByUrl.set(row.sourceUrl, {
      id: row.feedId,
      lastFetched: row.lastFetched,
      lastFetchError: row.lastFetchError,
      proxyEnabled: row.proxyEnabled ?? undefined,
      url: row.feedUrl,
    });
  }
}
