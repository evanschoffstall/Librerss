import { getDb } from "@/lib/db/db";
import { feedCategories, feeds } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

type FeedDbExecutor =
  | ReturnType<typeof getDb>
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

type FeedRecordRow = {
  id: number;
  url: string;
  lastFetched: Date;
  lastFetchError: string | null;
};

export const feedRecordFields = {
  id: feeds.id,
  url: feeds.url,
  lastFetched: feeds.lastFetched,
  lastFetchError: feeds.lastFetchError,
};

export async function findFeedIdByUrl(
  executor: FeedDbExecutor,
  feedUrl: string,
): Promise<number | null> {
  const [feed] = await executor
    .select({ id: feeds.id })
    .from(feeds)
    .where(eq(feeds.url, feedUrl))
    .limit(1);

  return feed?.id ?? null;
}

// Single-query upsert: always returns the row whether inserted or already existing.
// ON CONFLICT DO UPDATE with a no-op SET guarantees RETURNING always fires.
export async function ensureFeedRecordByUrl(
  executor: FeedDbExecutor,
  feedUrl: string,
): Promise<FeedRecordRow> {
  const [record] = await executor
    .insert(feeds)
    .values({ url: feedUrl })
    .onConflictDoUpdate({ target: feeds.url, set: { url: feedUrl } })
    .returning(feedRecordFields);

  if (!record) {
    throw new Error("Unable to resolve feed record");
  }

  return record;
}

export async function replaceUserFeedCategory(
  executor: FeedDbExecutor,
  {
    userId,
    feedId,
    category,
  }: {
    userId: number;
    feedId: number;
    category: string;
  },
): Promise<void> {
  await executor
    .insert(feedCategories)
    .values({
      userId,
      feedId,
      category,
    })
    .onConflictDoUpdate({
      target: [feedCategories.userId, feedCategories.feedId],
      set: { category },
    });
}

export async function removeUserFeedCategory(
  executor: FeedDbExecutor,
  {
    userId,
    feedId,
    category,
  }: {
    userId: number;
    feedId: number;
    category?: string;
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
