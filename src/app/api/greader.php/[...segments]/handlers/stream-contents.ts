import { getSearchParams } from "@/lib/api/http";
import { type SessionUser } from "@/lib/auth/session";
import { canUseArticleStatusesTable } from "@/lib/core/article-status";
import { buildStreamConditions } from "@/lib/core/stream-conditions";
import {
  FEED_STREAM_PREFIX,
  READING_LIST_STREAM,
  STARRED_STATE,
} from "@/lib/core/stream-ids";
import { getDb } from "@/lib/db/db";
import {
  articleStatuses,
  articles,
  feedCategories,
  feedSources,
  feeds,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { withResolvedCategoryByUrl } from "../services/categories";
import { ListedArticle, mapArticleAsItem } from "../services/mappers";
import {
  buildUserArticleStatusJoin,
  buildUserCategoryJoin,
  buildUserFeedJoin,
} from "../services/stream-joins";
import {
  parseOlderThanDate,
  parseStreamId,
  parseStreamPaging,
} from "../services/stream-service";
import { maybeRefreshGReaderStreamFeeds } from "./stream-refresh";

export async function handleStreamContents(
  user: SessionUser,
  request: NextRequest,
  resource: string,
): Promise<Response> {
  const streamId = parseStreamId(resource);
  const isReadingList = streamId === READING_LIST_STREAM;
  const isStarredStream = streamId === STARRED_STATE;
  const isFeed = streamId.startsWith(FEED_STREAM_PREFIX);

  if (!isReadingList && !isFeed && !isStarredStream) {
    return NextResponse.json({ id: streamId, items: [] });
  }

  const feedUrl = isFeed ? streamId.slice(FEED_STREAM_PREFIX.length) : null;
  const searchParams = getSearchParams(request);
  const { limit, offset, continuationId, isNetNewsWire } = parseStreamPaging(
    searchParams,
    request.headers.get("user-agent") ?? "",
  );
  const sinceDate = parseOlderThanDate(searchParams);

  await maybeRefreshGReaderStreamFeeds(
    user.userId,
    streamId,
    "greader.stream.contents",
  );

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();
  const userFeedJoin = buildUserFeedJoin(user.userId);
  const userCategoryJoin = buildUserCategoryJoin();
  const userStatusJoin = buildUserArticleStatusJoin(user.userId);

  if (isStarredStream && !useArticleStatuses) {
    return NextResponse.json({
      id: streamId,
      direction: "ltr",
      updated: Math.floor(Date.now() / 1000),
      items: [],
    });
  }

  async function queryRows(dateFilter: Date | null): Promise<ListedArticle[]> {
    const conditions = buildStreamConditions({
      feedUrl,
      dateFilter,
      continuationId,
      starredOnly: isStarredStream,
      useArticleStatuses,
    });

    const baseSelect = {
      articleId: articles.id,
      title: articles.title,
      link: articles.link,
      content: articles.content,
      publicationDate: articles.publicationDate,
      sourceName: feedSources.name,
      sourceUrl: feedSources.url,
      category: feedCategories.category,
    };

    const fromClause = db
      .select(
        useArticleStatuses
          ? {
              ...baseSelect,
              isRead: articleStatuses.isRead,
              isStarred: articleStatuses.isStarred,
            }
          : {
              ...baseSelect,
              isRead: sql<boolean>`false`,
              isStarred: sql<boolean>`false`,
            },
      )
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(feedSources, userFeedJoin)
      .leftJoin(feedCategories, userCategoryJoin);

    if (useArticleStatuses) {
      return fromClause
        .leftJoin(articleStatuses, userStatusJoin)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(articles.id))
        .limit(limit)
        .offset(offset);
    }

    return fromClause
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

  const nextContinuationId =
    rows.length === limit ? rows.at(-1)?.articleId : null;

  logger.info("[greader] stream/contents", {
    userId: user.userId,
    streamId,
    limit,
    isNetNewsWire,
    offset,
    continuationId,
    ot: searchParams.get("ot"),
    itemCount: rows.length,
    usedOtFallback,
    continuation: nextContinuationId ? String(nextContinuationId) : null,
  });

  const normalizedRows = await withResolvedCategoryByUrl(
    user.userId,
    rows,
    (row) => row.sourceUrl,
  );

  return NextResponse.json({
    id: streamId,
    direction: "ltr",
    updated: Math.floor(Date.now() / 1000),
    continuation: nextContinuationId ? String(nextContinuationId) : undefined,
    items: normalizedRows.map(mapArticleAsItem),
  });
}
