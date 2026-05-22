/**
 * Internal helpers for fetchAndCacheFeedArticlesBatch.
 * Each helper handles one distinct step of the batch feed-fetch pipeline.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import { type FeedRecord } from "@/lib/core/refresh";

/**
 * Defines the DB mod type.
 */
type DbMod = typeof import("@/lib/db");

export {
  mapRowsToArticleMap,
  queryTopArticlesPerFeed,
} from "./article-batches";
export type { ArticleRow, RankedRow } from "./batch-types";
export {
  BATCH_REFRESH_BUDGET_EXHAUSTED_MESSAGE,
  buildRefreshPlan,
  executeParallelRefreshes,
} from "@/lib/core/refresh";

/**
 * Resolve the authorized feed records.
 * @param db - The db.
 * @param userId - The user ID.
 * @param feedUrls - The feed urls.
 * @returns The authorized feed records.
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

/**
 * Insert feed records for URLs not yet present in the feeds table, then add them to the URL-keyed map.
 * @param db - The db.
 * @param joinedRows - The joined rows.
 * @param missingUrls - The missing urls.
 * @param feedByUrl - The feed by url.
 */
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

/**
 * Query all feed-source rows that the user owns and that match the requested URLs.
 * @param db - The db.
 * @param userId - The user ID.
 * @param feedUrls - The feed urls.
 * @returns Rows joining feedSources and feeds for the authorized URLs.
 */
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

/**
 * Resolve the allowed urls.
 * @param feedUrls - The feed urls.
 * @param joinedRows - The joined rows.
 * @returns The allowed urls.
 */
function resolveAllowedUrls(
  feedUrls: string[],
  joinedRows: { sourceUrl: string }[],
): string[] {
  const ownedUrls = new Set(joinedRows.map((row) => row.sourceUrl));
  return feedUrls.filter((url) => ownedUrls.has(url));
}

/**
 * Resolve the authorized feed record result.
 * @param db - The db.
 * @param feedUrls - The feed urls.
 * @param joinedRows - The joined rows.
 * @returns The authorized feed record result.
 */
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

/**
 * Populate the URL-keyed feed map with rows that already have a feeds table entry.
 * @param joinedRows - The joined rows.
 * @param feedByUrl - The feed by url.
 */
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
