import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { MAX_STREAM_ITEMS, TAG_MUTATIONS } from "./constants";
import { parseDistinctReaderArticleIds } from "./reader-item-params";

import { parseFormOrQueryParams, textResponse } from "@/lib/api/http";
import { type SessionUser } from "@/lib/auth/session";
import {
  canUseArticleStatusesTable,
  upsertArticleStatuses,
} from "@/lib/core/article-status";
import { invalidateUserCache } from "@/lib/core/feed-cache";
import { markStreamAsRead } from "@/lib/core/mark-stream-read";
import { FEED_STREAM_PREFIX, READING_LIST_STREAM } from "@/lib/core/stream-ids";
import { getDb } from "@/lib/db/db";

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

  invalidateUserCache(user.userId);
  return textResponse("OK\n");
}

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

  await markStreamAsRead(user.userId, stream, { beforeMs: ts / 1000 });

  invalidateUserCache(user.userId);
  return textResponse("OK\n");
}

export async function handleUnreadCount(user: SessionUser): Promise<Response> {
  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  // Use correlated subqueries instead of a 4-table LEFT JOIN + GROUP BY.
  // The old query joined feedSources→feeds→articles→articleStatuses for every
  // article row, then aggregated. The correlated approach lets PostgreSQL use
  // per-feed indexes (article_feed_id_idx) and per-user-article indexes
  // (article_status_user_article_idx) independently per feed.
  // The read-count subquery uses a JOIN instead of article_id IN (subquery),
  // giving the planner a hash/loop join strategy instead of a semi-join.
  interface UnreadRow {
    sourceUrl: string;
    unreadCount: number;
  }
  const rows: UnreadRow[] = useArticleStatuses
    ? await db
        .execute<UnreadRow>(
          sql`
        SELECT fs.url AS "sourceUrl",
          (SELECT count(*)::int FROM "Article" a WHERE a.feed_id = f.id) -
          COALESCE((
            SELECT count(*)::int
            FROM "ArticleStatus" s
            INNER JOIN "Article" a2 ON a2.id = s.article_id AND a2.feed_id = f.id
            WHERE s.user_id = ${user.userId} AND s.is_read = true
          ), 0) AS "unreadCount"
        FROM "FeedSource" fs
        INNER JOIN "Feed" f ON f.url = fs.url
        WHERE fs.user_id = ${user.userId} AND fs.enabled = true
      `,
        )
        .then((r) => (Array.isArray(r) ? r : (r as { rows: UnreadRow[] }).rows))
    : await db
        .execute<UnreadRow>(
          sql`
        SELECT fs.url AS "sourceUrl",
          (SELECT count(*)::int FROM "Article" a WHERE a.feed_id = f.id) AS "unreadCount"
        FROM "FeedSource" fs
        INNER JOIN "Feed" f ON f.url = fs.url
        WHERE fs.user_id = ${user.userId} AND fs.enabled = true
      `,
        )
        .then((r) =>
          Array.isArray(r) ? r : (r as { rows: UnreadRow[] }).rows,
        );

  const totalUnread = rows.reduce(
    (acc, row) => acc + Number(row.unreadCount ?? 0),
    0,
  );

  return NextResponse.json({
    max: MAX_STREAM_ITEMS,
    unreadcounts: [
      {
        count: totalUnread,
        id: READING_LIST_STREAM,
        newestItemTimestampUsec: "0",
      },
      ...rows.map((row) => ({
        count: Number(row.unreadCount ?? 0),
        id: `${FEED_STREAM_PREFIX}${row.sourceUrl}`,
        newestItemTimestampUsec: "0",
      })),
    ],
  });
}
