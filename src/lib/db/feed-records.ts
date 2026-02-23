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

async function findFeedRecordByUrl(
  executor: FeedDbExecutor,
  feedUrl: string,
): Promise<FeedRecordRow | null> {
  const [feed] = await executor
    .select({
      id: feeds.id,
      url: feeds.url,
      lastFetched: feeds.lastFetched,
      lastFetchError: feeds.lastFetchError,
    })
    .from(feeds)
    .where(eq(feeds.url, feedUrl))
    .limit(1);

  return feed ?? null;
}

export async function ensureFeedRecordByUrl(
  executor: FeedDbExecutor,
  feedUrl: string,
): Promise<FeedRecordRow> {
  const existing = await findFeedRecordByUrl(executor, feedUrl);
  if (existing) {
    return existing;
  }

  const [created] = await executor
    .insert(feeds)
    .values({ url: feedUrl })
    .onConflictDoNothing({ target: feeds.url })
    .returning({
      id: feeds.id,
      url: feeds.url,
      lastFetched: feeds.lastFetched,
      lastFetchError: feeds.lastFetchError,
    });

  if (created) {
    return created;
  }

  const persisted = await findFeedRecordByUrl(executor, feedUrl);
  if (!persisted) {
    throw new Error("Unable to resolve feed record");
  }

  return persisted;
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
