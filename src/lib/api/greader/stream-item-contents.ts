import { eq, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { withResolvedCategoryByUrl } from "./categories";
import { MAX_STREAM_ITEMS } from "./constants";
import { mapArticleAsItem } from "./mappers";
import { parseDistinctReaderArticleIds } from "./reader-item-params";
import {
  buildUserArticleStatusJoin,
  buildUserCategoryJoin,
  buildUserFeedJoin,
} from "./stream-joins";

import { parseFormOrQueryParams } from "@/lib/api/http";
import { type SessionUser } from "@/lib/auth/session";
import { canUseArticleStatusesTable } from "@/lib/core/article-status";
import { READING_LIST_STREAM } from "@/lib/core/stream-ids";
import { getDb } from "@/lib/db/db";
import {
  articles,
  articleStatuses,
  feedCategories,
  feeds,
  feedSources,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";

export async function handleStreamItemContents(
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
    logger.info("[greader] stream/items/contents", {
      requestedItemCount: 0,
      returnedItemCount: 0,
      userId: user.userId,
    });

    return NextResponse.json({
      id: READING_LIST_STREAM,
      items: [],
      updated: Math.floor(Date.now() / 1000),
    });
  }

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();
  const userFeedJoin = buildUserFeedJoin(user.userId);
  const userCategoryJoin = buildUserCategoryJoin();
  const userStatusJoin = buildUserArticleStatusJoin(user.userId);

  const baseSelect = {
    articleId: articles.id,
    category: feedCategories.category,
    content: articles.content,
    link: articles.link,
    publicationDate: articles.publicationDate,
    sourceName: feedSources.name,
    sourceUrl: feedSources.url,
    title: articles.title,
  };

  const rows = await (useArticleStatuses
    ? db
        .select({
          ...baseSelect,
          isRead: articleStatuses.isRead,
          isStarred: articleStatuses.isStarred,
        })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(feedSources, userFeedJoin)
        .leftJoin(feedCategories, userCategoryJoin)
        .leftJoin(articleStatuses, userStatusJoin)
        .where(inArray(articles.id, articleIds))
    : db
        .select({
          ...baseSelect,
          isRead: sql<boolean>`false`,
          isStarred: sql<boolean>`false`,
        })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(feedSources, userFeedJoin)
        .leftJoin(feedCategories, userCategoryJoin)
        .where(inArray(articles.id, articleIds)));

  const articleIndex = new Map<number, number>(
    articleIds.map((id, index) => [id, index]),
  );

  rows.sort((left, right) => {
    const leftOrder =
      articleIndex.get(left.articleId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder =
      articleIndex.get(right.articleId) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });

  logger.info("[greader] stream/items/contents", {
    requestedItemCount: articleIds.length,
    returnedItemCount: rows.length,
    userId: user.userId,
  });

  const normalizedRows = await withResolvedCategoryByUrl(
    user.userId,
    rows,
    (row) => row.sourceUrl,
  );

  return NextResponse.json({
    id: READING_LIST_STREAM,
    items: normalizedRows.map(mapArticleAsItem),
    updated: Math.floor(Date.now() / 1000),
  });
}
