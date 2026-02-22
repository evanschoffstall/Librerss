import { parseFormOrQueryParams } from "@/lib/api/request";
import { type SessionUser } from "@/lib/auth/session";
import { parseReaderItemId } from "@/lib/core/reader-item-id";
import { getDb } from "@/lib/db/db";
import {
  articleStatuses,
  articles,
  feedSources,
  feeds,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  canUseArticleStatusesTable,
  upsertArticleStatuses,
} from "./article-statuses";
import { TAG_MUTATIONS, MAX_STREAM_ITEMS } from "./constants";
import { textResponse } from "./responses";

export async function handleMarkAllAsRead(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  const stream = params.get("s") ?? "user/-/state/com.google/reading-list";

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  const rows = stream.startsWith("feed/")
    ? await db
        .select({ articleId: articles.id })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(
          feedSources,
          and(eq(feedSources.url, feeds.url), eq(feedSources.userId, user.userId)),
        )
        .where(eq(feeds.url, stream.slice("feed/".length)))
    : stream === "user/-/state/com.google/starred" && useArticleStatuses
      ? await db
          .select({ articleId: articles.id })
          .from(articles)
          .innerJoin(feeds, eq(feeds.id, articles.feedId))
          .innerJoin(
            feedSources,
            and(eq(feedSources.url, feeds.url), eq(feedSources.userId, user.userId)),
          )
          .innerJoin(
            articleStatuses,
            and(
              eq(articleStatuses.userId, user.userId),
              eq(articleStatuses.articleId, articles.id),
            ),
          )
          .where(eq(articleStatuses.isStarred, true))
      : stream === "user/-/state/com.google/starred"
        ? []
        : await db
            .select({ articleId: articles.id })
            .from(articles)
            .innerJoin(feeds, eq(feeds.id, articles.feedId))
            .innerJoin(
              feedSources,
              and(eq(feedSources.url, feeds.url), eq(feedSources.userId, user.userId)),
            );

  await upsertArticleStatuses(
    user.userId,
    rows.map((row) => row.articleId),
    { isRead: true },
  );

  return textResponse("OK\n");
}

export async function handleUnreadCount(user: SessionUser): Promise<Response> {
  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  const rows = await (useArticleStatuses
    ? db
        .select({
          sourceUrl: feedSources.url,
          unreadCount: sql<number>`sum(case when coalesce(${articleStatuses.isRead}, false) = false then 1 else 0 end)`,
        })
        .from(feedSources)
        .innerJoin(feeds, eq(feeds.url, feedSources.url))
        .leftJoin(articles, eq(articles.feedId, feeds.id))
        .leftJoin(
          articleStatuses,
          and(
            eq(articleStatuses.userId, user.userId),
            eq(articleStatuses.articleId, articles.id),
          ),
        )
        .where(eq(feedSources.userId, user.userId))
        .groupBy(feedSources.url)
    : db
        .select({
          sourceUrl: feedSources.url,
          unreadCount: sql<number>`count(${articles.id})`,
        })
        .from(feedSources)
        .innerJoin(feeds, eq(feeds.url, feedSources.url))
        .leftJoin(articles, eq(articles.feedId, feeds.id))
        .where(eq(feedSources.userId, user.userId))
        .groupBy(feedSources.url));

  const totalUnread = rows.reduce(
    (acc, row) => acc + Number(row.unreadCount ?? 0),
    0,
  );

  return NextResponse.json({
    max: MAX_STREAM_ITEMS,
    unreadcounts: [
      {
        id: "user/-/state/com.google/reading-list",
        count: totalUnread,
        newestItemTimestampUsec: "0",
      },
      ...rows.map((row) => ({
        id: `feed/${row.sourceUrl}`,
        count: Number(row.unreadCount ?? 0),
        newestItemTimestampUsec: "0",
      })),
    ],
  });
}

export async function handleEditTag(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  const articleIds = Array.from(
    new Set(
      params
        .getAll("i")
        .map((value) => parseReaderItemId(value))
        .filter((value): value is number => value !== null),
    ),
  );

  if (articleIds.length === 0) {
    return textResponse("OK\n");
  }

  const addTags = params.getAll("a");
  const removeTags = params.getAll("r");

  for (const mutation of TAG_MUTATIONS) {
    const tags = mutation.target === "a" ? addTags : removeTags;
    if (!tags.includes(mutation.tag)) continue;
    await upsertArticleStatuses(user.userId, articleIds, mutation.patch);
  }

  return textResponse("OK\n");
}
