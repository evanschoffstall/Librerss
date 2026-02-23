import { parseFormOrQueryParams } from "@/lib/api/request";
import { type SessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/db";
import {
  articleStatuses,
  articles,
  feedCategories,
  feedSources,
  feeds,
} from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { MAX_STREAM_ITEMS } from "../constants";
import { canUseArticleStatusesTable } from "../utils/article-status";
import { mapArticleAsItem } from "../utils/mappers";
import { parseDistinctReaderArticleIds } from "../utils/reader-item-params";

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
    console.info("[greader] stream/items/contents", {
      userId: user.userId,
      requestedItemCount: 0,
      returnedItemCount: 0,
    });

    return NextResponse.json({
      id: "user/-/state/com.google/reading-list",
      updated: Math.floor(Date.now() / 1000),
      items: [],
    });
  }

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

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

  const rows = await (useArticleStatuses
    ? db
        .select({
          ...baseSelect,
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
          feedCategories,
          and(
            eq(feedCategories.userId, feedSources.userId),
            eq(feedCategories.feedId, feeds.id),
          ),
        )
        .leftJoin(
          articleStatuses,
          and(
            eq(articleStatuses.userId, user.userId),
            eq(articleStatuses.articleId, articles.id),
          ),
        )
        .where(inArray(articles.id, articleIds))
    : db
        .select({
          ...baseSelect,
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
        .leftJoin(
          feedCategories,
          and(
            eq(feedCategories.userId, feedSources.userId),
            eq(feedCategories.feedId, feeds.id),
          ),
        )
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

  console.info("[greader] stream/items/contents", {
    userId: user.userId,
    requestedItemCount: articleIds.length,
    returnedItemCount: rows.length,
  });

  return NextResponse.json({
    id: "user/-/state/com.google/reading-list",
    updated: Math.floor(Date.now() / 1000),
    items: rows.map(mapArticleAsItem),
  });
}
