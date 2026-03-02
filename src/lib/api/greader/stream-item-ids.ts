import { getSearchParams } from "@/lib/api/http";
import { type SessionUser } from "@/lib/auth/session";
import { canUseArticleStatusesTable } from "@/lib/core/article-status";
import { buildStreamConditions } from "@/lib/core/stream-conditions";
import * as StreamIds from "@/lib/core/stream-ids";
import { getDb } from "@/lib/db/db";
import { articleStatuses, articles, feedSources, feeds } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { isSafePositiveItemId } from "@/lib/utils/validation";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { buildUserArticleStatusJoin, buildUserFeedJoin } from "./stream-joins";
import { maybeRefreshGReaderStreamFeeds } from "./stream-refresh";
import {
  parseOlderThanDate,
  parseStreamPaging,
  shouldExcludeReadFromStream,
} from "./stream-service";

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  const message = String(candidate.message ?? "").toLowerCase();
  return candidate.code === "42P01" || message.includes("does not exist");
}

export async function handleStreamItemIds(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const searchParams = getSearchParams(request);
  const streamId = searchParams.get("s") ?? StreamIds.READING_LIST_STREAM;
  const isFeed = streamId.startsWith(StreamIds.FEED_STREAM_PREFIX);
  const feedUrl = isFeed
    ? streamId.slice(StreamIds.FEED_STREAM_PREFIX.length)
    : null;
  const excludeRead = shouldExcludeReadFromStream(searchParams.getAll("xt"));

  const { limit, offset, continuationId, isNetNewsWire } = parseStreamPaging(
    searchParams,
    request.headers.get("user-agent") ?? "",
  );
  const sinceDate = parseOlderThanDate(searchParams);

  await maybeRefreshGReaderStreamFeeds(
    user.userId,
    streamId,
    "greader.stream.item-ids",
  );

  const db = getDb();
  let useArticleStatuses = await canUseArticleStatusesTable();
  const userFeedJoin = buildUserFeedJoin(user.userId);
  const userStatusJoin = buildUserArticleStatusJoin(user.userId);

  if (streamId === StreamIds.STARRED_STATE && !useArticleStatuses) {
    return NextResponse.json({ itemRefs: [], continuation: undefined });
  }

  async function queryRows(dateFilter: Date | null): Promise<
    Array<{
      articleId: number;
      isRead: boolean | null;
      isStarred: boolean | null;
    }>
  > {
    const conditions = buildStreamConditions({
      feedUrl,
      dateFilter,
      continuationId,
      starredOnly: streamId === StreamIds.STARRED_STATE,
      excludeRead,
      useArticleStatuses,
    });

    if (useArticleStatuses) {
      return db
        .select({
          articleId: articles.id,
          isRead: articleStatuses.isRead,
          isStarred: articleStatuses.isStarred,
        })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(feedSources, userFeedJoin)
        .leftJoin(articleStatuses, userStatusJoin)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(articles.id))
        .limit(limit)
        .offset(offset);
    }

    return db
      .select({
        articleId: articles.id,
        isRead: sql<boolean>`false`,
        isStarred: sql<boolean>`false`,
      })
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(feedSources, userFeedJoin)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(articles.id))
      .limit(limit)
      .offset(offset);
  }

  let rows: Array<{
    articleId: number;
    isRead: boolean | null;
    isStarred: boolean | null;
  }>;

  try {
    rows = await queryRows(sinceDate);
  } catch (error) {
    if (!useArticleStatuses || !isMissingRelationError(error)) {
      throw error;
    }

    useArticleStatuses = false;
    if (streamId === StreamIds.STARRED_STATE) {
      return NextResponse.json({ itemRefs: [], continuation: undefined });
    }
    rows = await queryRows(sinceDate);
  }
  let usedOtFallback = false;

  if (rows.length === 0 && sinceDate) {
    rows = await queryRows(null);
    usedOtFallback = true;
  }

  const safeRows = rows.filter((row) => isSafePositiveItemId(row.articleId));
  const itemIds = safeRows.map((row) => row.articleId);
  const continuation =
    safeRows.length === limit
      ? (safeRows.at(-1)?.articleId?.toString() ?? undefined)
      : undefined;

  logger.info("[greader] stream/items/ids", {
    userId: user.userId,
    streamId,
    limit,
    isNetNewsWire,
    offset,
    continuationId,
    ot: searchParams.get("ot"),
    excludeRead,
    itemRefCount: safeRows.length,
    droppedUnsafeItemRefCount: rows.length - safeRows.length,
    usedOtFallback,
    minItemId: itemIds.length > 0 ? Math.min(...itemIds) : null,
    maxItemId: itemIds.length > 0 ? Math.max(...itemIds) : null,
    sampleItemIds: itemIds.slice(0, 5),
    continuation: continuation ?? null,
  });

  return NextResponse.json({
    itemRefs: safeRows.map((row) => ({ id: String(row.articleId) })),
    continuation,
  });
}
