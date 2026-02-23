import { type SessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/db";
import {
  articleStatuses,
  articles,
  feedCategories,
  feedSources,
  feeds,
} from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { canUseArticleStatusesTable } from "@/lib/core/article-status";
import { buildStreamConditions } from "@/lib/core/stream-conditions";
import { ListedArticle, mapArticleAsItem } from "../utils/mappers";
import {
  parseOlderThanDate,
  parseStreamId,
  parseStreamPaging,
} from "../utils/stream";

export async function handleStreamContents(
  user: SessionUser,
  request: NextRequest,
  resource: string,
): Promise<Response> {
  const streamId = parseStreamId(resource);
  const isReadingList = streamId === "user/-/state/com.google/reading-list";
  const isStarredStream = streamId === "user/-/state/com.google/starred";
  const isFeed = streamId.startsWith("feed/");

  if (!isReadingList && !isFeed && !isStarredStream) {
    return NextResponse.json({ id: streamId, items: [] });
  }

  const feedUrl = isFeed ? streamId.slice("feed/".length) : null;
  const searchParams = new URL(request.url).searchParams;
  const { limit, offset, continuationId, isNetNewsWire } = parseStreamPaging(
    searchParams,
    request.headers.get("user-agent") ?? "",
  );
  const sinceDate = parseOlderThanDate(searchParams);

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

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
      );

    if (useArticleStatuses) {
      return fromClause
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

  return NextResponse.json({
    id: streamId,
    direction: "ltr",
    updated: Math.floor(Date.now() / 1000),
    continuation: nextContinuationId ? String(nextContinuationId) : undefined,
    items: rows.map(mapArticleAsItem),
  });
}
