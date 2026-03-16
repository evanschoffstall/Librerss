import { and, eq, lt } from "drizzle-orm";

import { getDb } from "@/lib/db/db";
import {
  articles,
  articleStatuses,
  feedCategories,
  feeds,
  feedSources,
} from "@/lib/db/schema";

import {
  canUseArticleStatusesTable,
  upsertArticleStatuses,
} from "./article-status";
import {
  FEED_STREAM_PREFIX,
  parseUserLabel,
  STARRED_STATE,
} from "./stream-ids";

// Upper bound for mark-all-as-read to prevent unbounded queries.
const MARK_ALL_READ_LIMIT = 10_000;

/**
 * Mark all articles in a stream as read for the given user.
 *
 * Shared by mark-all-read flows that operate on feed, label, or starred
 * streams.
 */
export async function markStreamAsRead(
  userId: number,
  stream: string,
  deps?: {
    /** Milliseconds since epoch — only mark articles published before this time. */
    beforeMs?: number;

    canUseArticleStatusesTableFn?: typeof canUseArticleStatusesTable;
    db?: ReturnType<typeof getDb>;
    upsertArticleStatusesFn?: typeof upsertArticleStatuses;
  },
): Promise<void> {
  const userLabel = parseUserLabel(stream);

  const db = deps?.db ?? getDb();
  const canUseArticleStatuses =
    deps?.canUseArticleStatusesTableFn ?? canUseArticleStatusesTable;
  const upsertStatuses = deps?.upsertArticleStatusesFn ?? upsertArticleStatuses;
  const beforeDate = deps?.beforeMs ? new Date(deps.beforeMs) : undefined;

  const useArticleStatuses = await canUseArticleStatuses();

  const enabledJoin = and(
    eq(feedSources.url, feeds.url),
    eq(feedSources.userId, userId),
    eq(feedSources.enabled, true),
  );

  let rows: { articleId: number }[];

  if (stream.startsWith(FEED_STREAM_PREFIX)) {
    rows = await db
      .select({ articleId: articles.id })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(feedSources, enabledJoin)
      .where(
        and(
          eq(feeds.url, stream.slice(FEED_STREAM_PREFIX.length)),
          beforeDate ? lt(articles.publicationDate, beforeDate) : undefined,
        ),
      )
      .limit(MARK_ALL_READ_LIMIT);
  } else if (stream === STARRED_STATE && useArticleStatuses) {
    rows = await db
      .select({ articleId: articles.id })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(feedSources, enabledJoin)
      .innerJoin(
        articleStatuses,
        and(
          eq(articleStatuses.userId, userId),
          eq(articleStatuses.articleId, articles.id),
        ),
      )
      .where(
        and(
          eq(articleStatuses.isStarred, true),
          beforeDate ? lt(articles.publicationDate, beforeDate) : undefined,
        ),
      )
      .limit(MARK_ALL_READ_LIMIT);
  } else if (stream === STARRED_STATE) {
    rows = [];
  } else if (parseUserLabel(stream) !== null) {
    rows = await db
      .select({ articleId: articles.id })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(feedSources, enabledJoin)
      .innerJoin(
        feedCategories,
        and(
          eq(feedCategories.feedId, feeds.id),
          eq(feedCategories.userId, userId),
          eq(feedCategories.category, userLabel ?? ""),
        ),
      )
      .where(beforeDate ? lt(articles.publicationDate, beforeDate) : undefined)
      .limit(MARK_ALL_READ_LIMIT);
  } else {
    rows = await db
      .select({ articleId: articles.id })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(feedSources, enabledJoin)
      .where(beforeDate ? lt(articles.publicationDate, beforeDate) : undefined)
      .limit(MARK_ALL_READ_LIMIT);
  }

  await upsertStatuses(
    userId,
    rows.map((row) => row.articleId),
    { isRead: true },
  );
}
