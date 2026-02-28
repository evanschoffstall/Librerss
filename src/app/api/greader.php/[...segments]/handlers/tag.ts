import { parseFormOrQueryParams } from "@/lib/api/http";
import { textResponse } from "@/lib/api/http";
import { type SessionUser } from "@/lib/auth/session";
import {
  canUseArticleStatusesTable,
  upsertArticleStatuses,
} from "@/lib/core/article-status";
import { markStreamAsRead } from "@/lib/core/mark-stream-read";
import { getDb } from "@/lib/db/db";
import { articleStatuses, articles, feedSources, feeds } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  FEED_STREAM_PREFIX,
  MAX_STREAM_ITEMS,
  READING_LIST_STREAM,
  TAG_MUTATIONS,
} from "../constants";
import { parseDistinctReaderArticleIds } from "../services/reader-item-params";

export async function handleMarkAllAsRead(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  if (params instanceof Response) {
    return params;
  }
  const stream = params.get("s") ?? READING_LIST_STREAM;
  const ts = Number(params.get("ts"));

  if (!Number.isFinite(ts) || ts <= 0) {
    return textResponse("Error=MissingTimestamp\n", 400);
  }

  await markStreamAsRead(user.userId, stream);

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
        id: READING_LIST_STREAM,
        count: totalUnread,
        newestItemTimestampUsec: "0",
      },
      ...rows.map((row) => ({
        id: `${FEED_STREAM_PREFIX}${row.sourceUrl}`,
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
  if (params instanceof Response) {
    return params;
  }
  const articleIds = parseDistinctReaderArticleIds(params.getAll("i"), {
    maxItems: MAX_STREAM_ITEMS,
  });

  if (articleIds.length === 0) {
    return textResponse("Error=InvalidParameters\n", 400);
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
