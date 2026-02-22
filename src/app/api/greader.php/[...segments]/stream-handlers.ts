import { parseFormOrQueryParams } from "@/lib/api/request";
import { type SessionUser } from "@/lib/auth/session";
import { parseReaderItemId } from "@/lib/core/reader-item-id";
import { getDb } from "@/lib/db/db";
import {
  articleStatuses,
  articles,
  feedCategories,
  feedSources,
  feeds,
} from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { canUseArticleStatusesTable, isSafePositiveItemId } from "./article-statuses";
import { ListedArticle, mapArticleAsItem } from "./mappers";
import { parseStreamId, parseStreamPaging } from "./stream";

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
  const olderThanSec = Number.parseInt(searchParams.get("ot") ?? "", 10);
  const sinceDate = Number.isInteger(olderThanSec) ? new Date(olderThanSec * 1000) : null;

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
    const conditions: Parameters<typeof and> = [];

    if (feedUrl && dateFilter) {
      conditions.push(and(eq(feeds.url, feedUrl), gte(articles.publicationDate, dateFilter)));
    } else if (feedUrl) {
      conditions.push(eq(feeds.url, feedUrl));
    } else if (dateFilter) {
      conditions.push(gte(articles.publicationDate, dateFilter));
    }

    if (isStarredStream && useArticleStatuses) {
      conditions.push(eq(articleStatuses.isStarred, true));
    }

    if (continuationId) {
      conditions.push(lt(articles.id, continuationId));
    }

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
          ? { ...baseSelect, isRead: articleStatuses.isRead, isStarred: articleStatuses.isStarred }
          : { ...baseSelect, isRead: sql<boolean>`false`, isStarred: sql<boolean>`false` },
      )
      .from(articles)
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .innerJoin(
        feedSources,
        and(eq(feedSources.url, feeds.url), eq(feedSources.userId, user.userId)),
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

  const nextContinuationId = rows.length === limit ? rows.at(-1)?.articleId : null;

  console.info("[greader] stream/contents", {
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

export async function handleStreamItemIds(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;
  const streamId = searchParams.get("s") ?? "user/-/state/com.google/reading-list";
  const isFeed = streamId.startsWith("feed/");
  const feedUrl = isFeed ? streamId.slice("feed/".length) : null;
  const excludeRead = searchParams
    .getAll("xt")
    .some((v) => v === "user/-/state/com.google/read");

  const { limit, offset, continuationId, isNetNewsWire } = parseStreamPaging(
    searchParams,
    request.headers.get("user-agent") ?? "",
  );
  const olderThanSec = Number.parseInt(searchParams.get("ot") ?? "", 10);
  const sinceDate = Number.isInteger(olderThanSec) ? new Date(olderThanSec * 1000) : null;

  const db = getDb();
  const useArticleStatuses = await canUseArticleStatusesTable();

  if (streamId === "user/-/state/com.google/starred" && !useArticleStatuses) {
    return NextResponse.json({ itemRefs: [], continuation: undefined });
  }

  async function queryRows(dateFilter: Date | null): Promise<
    Array<{ articleId: number; isRead: boolean | null; isStarred: boolean | null }>
  > {
    const conditions: Parameters<typeof and> = [];

    if (feedUrl && dateFilter) {
      conditions.push(and(eq(feeds.url, feedUrl), gte(articles.publicationDate, dateFilter)));
    } else if (feedUrl) {
      conditions.push(eq(feeds.url, feedUrl));
    } else if (dateFilter) {
      conditions.push(gte(articles.publicationDate, dateFilter));
    }

    if (streamId === "user/-/state/com.google/starred" && useArticleStatuses) {
      conditions.push(eq(articleStatuses.isStarred, true));
    }

    if (excludeRead && useArticleStatuses) {
      conditions.push(sql`coalesce(${articleStatuses.isRead}, false) = false`);
    }

    if (continuationId) {
      conditions.push(lt(articles.id, continuationId));
    }

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
          and(eq(feedSources.url, feeds.url), eq(feedSources.userId, user.userId)),
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
        and(eq(feedSources.url, feeds.url), eq(feedSources.userId, user.userId)),
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
    safeRows.length === limit ? (safeRows.at(-1)?.articleId?.toString() ?? undefined) : undefined;

  console.info("[greader] stream/items/ids", {
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

export async function handleStreamItemContents(
  user: SessionUser,
  request: NextRequest,
): Promise<Response> {
  const params = await parseFormOrQueryParams(request);
  const itemRefs = params.getAll("i");
  const articleIds = Array.from(
    new Set(
      itemRefs
        .map((value) => parseReaderItemId(value))
        .filter((value): value is number => value !== null),
    ),
  );

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
        .select({ ...baseSelect, isRead: articleStatuses.isRead, isStarred: articleStatuses.isStarred })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(
          feedSources,
          and(eq(feedSources.url, feeds.url), eq(feedSources.userId, user.userId)),
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
        .select({ ...baseSelect, isRead: sql<boolean>`false`, isStarred: sql<boolean>`false` })
        .from(articles)
        .innerJoin(feeds, eq(feeds.id, articles.feedId))
        .innerJoin(
          feedSources,
          and(eq(feedSources.url, feeds.url), eq(feedSources.userId, user.userId)),
        )
        .leftJoin(
          feedCategories,
          and(
            eq(feedCategories.userId, feedSources.userId),
            eq(feedCategories.feedId, feeds.id),
          ),
        )
        .where(inArray(articles.id, articleIds)));

  rows.sort(
    (left, right) =>
      articleIds.indexOf(left.articleId) - articleIds.indexOf(right.articleId),
  );

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
