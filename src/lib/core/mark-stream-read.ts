import {
  canUseArticleStatusesTable,
  upsertArticleStatuses,
} from "./article-status";
import { getDb } from "@/lib/db/db";
import { articleStatuses, articles, feedSources, feeds } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// Upper bound for mark-all-as-read to prevent unbounded queries.
const MARK_ALL_READ_LIMIT = 10_000;

/**
 * Mark all articles in a stream as read for the given user.
 *
 * Shared by the web UI `/api/articles/mark-all-read` route and the
 * GReader-compatible `/api/greader.php/.../mark-all-as-read` handler.
 */
export async function markStreamAsRead(
  userId: number,
  stream: string,
): Promise<void> {
  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  const rows = stream.startsWith("feed/")
    ? await db
        .select({ articleId: articles.id })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(
          feedSources,
          and(eq(feedSources.url, feeds.url), eq(feedSources.userId, userId)),
        )
        .where(eq(feeds.url, stream.slice("feed/".length)))
        .limit(MARK_ALL_READ_LIMIT)
    : stream === "user/-/state/com.google/starred" && useArticleStatuses
      ? await db
          .select({ articleId: articles.id })
          .from(articles)
          .innerJoin(feeds, eq(feeds.id, articles.feedId))
          .innerJoin(
            feedSources,
            and(eq(feedSources.url, feeds.url), eq(feedSources.userId, userId)),
          )
          .innerJoin(
            articleStatuses,
            and(
              eq(articleStatuses.userId, userId),
              eq(articleStatuses.articleId, articles.id),
            ),
          )
          .where(eq(articleStatuses.isStarred, true))
          .limit(MARK_ALL_READ_LIMIT)
      : stream === "user/-/state/com.google/starred"
        ? []
        : await db
            .select({ articleId: articles.id })
            .from(articles)
            .innerJoin(feeds, eq(feeds.id, articles.feedId))
            .innerJoin(
              feedSources,
              and(
                eq(feedSources.url, feeds.url),
                eq(feedSources.userId, userId),
              ),
            )
            .limit(MARK_ALL_READ_LIMIT);

  await upsertArticleStatuses(
    userId,
    rows.map((row) => row.articleId),
    { isRead: true },
  );
}
