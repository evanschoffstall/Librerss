import { type SessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/db";
import { articleStatuses, articles, feedSources, feeds } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  canUseArticleStatusesTable,
  isSafePositiveItemId,
} from "@/lib/core/article-status";
import { parseOlderThanDate, parseStreamPaging } from "../utils/stream";
import { buildStreamConditions } from "@/lib/core/stream-conditions";

export async function handleStreamItemIds(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;
  const streamId =
    searchParams.get("s") ?? "user/-/state/com.google/reading-list";
  const isFeed = streamId.startsWith("feed/");
  const feedUrl = isFeed ? streamId.slice("feed/".length) : null;
  const excludeRead = searchParams
    .getAll("xt")
    .some((value) => value === "user/-/state/com.google/read");

  const { limit, offset, continuationId, isNetNewsWire } = parseStreamPaging(
    searchParams,
    request.headers.get("user-agent") ?? "",
  );
  const sinceDate = parseOlderThanDate(searchParams);

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  if (streamId === "user/-/state/com.google/starred" && !useArticleStatuses) {
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
      starredOnly: streamId === "user/-/state/com.google/starred",
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
        .innerJoin(
          feedSources,
          and(
            eq(feedSources.url, feeds.url),
            eq(feedSources.userId, user.userId),
          ),
        )
        .leftJoin(
          articleStatuses,
          and(
            eq(articleStatuses.userId, user.userId),
            eq(articleStatuses.articleId, articles.id),
          ),
        )
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
      .innerJoin(
        feedSources,
        and(
          eq(feedSources.url, feeds.url),
          eq(feedSources.userId, user.userId),
        ),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(articles.id))
      .limit(limit)
      .offset(offset);
  }

  let rows = await queryRows(sinceDate);
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
