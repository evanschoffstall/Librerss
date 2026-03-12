import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/db";
import { feedCategories, feeds } from "@/lib/db/schema";

type FeedDbExecutor =
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]
  | ReturnType<typeof getDb>;

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

// Single-query upsert: always returns the row whether inserted or already existing.
// ON CONFLICT DO UPDATE with a no-op SET guarantees RETURNING always fires.
export async function ensureFeedRecordByUrl(
  executor: FeedDbExecutor,
  feedUrl: string,
): Promise<FeedRecordRow> {
  const [record] = await executor
    .insert(feeds)
    .values({ url: feedUrl })
    .onConflictDoUpdate({ set: { url: feedUrl }, target: feeds.url })
    .returning(feedRecordFields);

  if (!record) {
    throw new Error("Unable to resolve feed record");
  }

  return record;
}

export async function findFeedIdByUrl(
  executor: FeedDbExecutor,
  feedUrl: string,
): Promise<null | number> {
  const [feed] = await executor
    .select({ id: feeds.id })
    .from(feeds)
    .where(eq(feeds.url, feedUrl))
    .limit(1);

  return feed?.id ?? null;
}

export async function removeUserFeedCategory(
  executor: FeedDbExecutor,
  {
    category,
    feedId,
    userId,
  }: {
    category?: string;
    feedId: number;
    userId: number;
  },
): Promise<void> {
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

export async function replaceUserFeedCategory(
  executor: FeedDbExecutor,
  {
    category,
    feedId,
    userId,
  }: {
    category: string;
    feedId: number;
    userId: number;
  },
): Promise<void> {
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
