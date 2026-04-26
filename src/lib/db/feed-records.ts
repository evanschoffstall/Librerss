import { and, eq } from "drizzle-orm";

import type { getDb } from "@/lib/db/db";

import { feedCategories, feeds } from "@/lib/db/schema";

/**
 * Defines the feed DB executor type.
 */
type FeedDbExecutor =
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]
  | ReturnType<typeof getDb>;

/**
 * Describes the feed record row.
 */
interface FeedRecordRow {
  id: number;
  lastFetched: Date;
  lastFetchError: null | string;
  url: string;
}

export const feedRecordFields = {
  id: feeds.id,
  lastFetched: feeds.lastFetched,
  lastFetchError: feeds.lastFetchError,
  url: feeds.url,
};

/**
 * Describes the options for remove user feed category.
 */
interface RemoveUserFeedCategoryOptions {
  category?: string;
  feedId: number;
  userId: number;
}

/**
 * Describes the options for replace user feed category.
 */
interface ReplaceUserFeedCategoryOptions {
  category: string;
  feedId: number;
  userId: number;
}
// Single-query upsert: always returns the row whether inserted or already existing.
// ON CONFLICT DO UPDATE with a no-op SET guarantees RETURNING always fires.
/**
 * Process the ensure feed record by url.
 * @param executor - The executor.
 * @param feedUrl - The feed url.
 * @returns The ensure feed record by url.
 */
export async function ensureFeedRecordByUrl(
  executor: FeedDbExecutor,
  feedUrl: string,
): Promise<FeedRecordRow> {
  const records = await executor
    .insert(feeds)
    .values({ url: feedUrl })
    .onConflictDoUpdate({ set: { url: feedUrl }, target: feeds.url })
    .returning(feedRecordFields);

  if (records.length === 0) {
    throw new Error("Unable to resolve feed record");
  }

  return records[0];
}

/**
 * Process the find feed id by url.
 * @param executor - The executor.
 * @param feedUrl - The feed url.
 * @returns The find feed id by url.
 */
export async function findFeedIdByUrl(
  executor: FeedDbExecutor,
  feedUrl: string,
): Promise<null | number> {
  const feedsByUrl = await executor
    .select({ id: feeds.id })
    .from(feeds)
    .where(eq(feeds.url, feedUrl))
    .limit(1);

  return feedsByUrl.length === 0 ? null : feedsByUrl[0].id;
}
/**
 * Process the remove user feed category.
 * @param executor - The executor.
 * @param options - The options used to process the remove user feed category.
 */
export async function removeUserFeedCategory(
  executor: FeedDbExecutor,
  options: RemoveUserFeedCategoryOptions,
): Promise<void> {
  const { category, feedId, userId } = options;
  await executor
    .delete(feedCategories)
    .where(
      category
        ? and(
            eq(feedCategories.userId, userId),
            eq(feedCategories.feedId, feedId),
            eq(feedCategories.category, category),
          )
        : and(
            eq(feedCategories.userId, userId),
            eq(feedCategories.feedId, feedId),
          ),
    );
}

/**
 * Process the replace user feed category.
 * @param executor - The executor.
 * @param options - The options used to process the replace user feed category.
 */
export async function replaceUserFeedCategory(
  executor: FeedDbExecutor,
  options: ReplaceUserFeedCategoryOptions,
): Promise<void> {
  const { category, feedId, userId } = options;
  await executor
    .insert(feedCategories)
    .values({
      category,
      feedId,
      userId,
    })
    .onConflictDoUpdate({
      set: { category },
      target: [feedCategories.userId, feedCategories.feedId],
    });
}
