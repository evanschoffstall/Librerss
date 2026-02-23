/**
 * Drizzle query builders for GReader stream handlers.
 * Isolates DB select logic so handler functions stay thin.
 */

import { type SessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/db";
import {
  articleStatuses,
  articles,
  feedCategories,
  feedSources,
  feeds,
} from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { type ListedArticle } from "../utils/mappers";

// ── Shared types ──────────────────────────────────────────────────────────────

export type StreamRow = {
  articleId: number;
  isRead: boolean | null;
  isStarred: boolean | null;
};

type StreamConditionArgs = {
  feedUrl: string | null;
  dateFilter: Date | null;
  continuationId: number | null;
  starredOnly: boolean;
  excludeRead?: boolean;
  useArticleStatuses: boolean;
};

// ── Condition builder ─────────────────────────────────────────────────────────

export function buildStreamConditions({
  feedUrl,
  dateFilter,
  continuationId,
  starredOnly,
  excludeRead,
  useArticleStatuses,
}: StreamConditionArgs): Parameters<typeof and> {
  const conditions: Parameters<typeof and> = [];

  if (feedUrl && dateFilter) {
    conditions.push(
      and(eq(feeds.url, feedUrl), gte(articles.publicationDate, dateFilter)),
    );
  } else if (feedUrl) {
    conditions.push(eq(feeds.url, feedUrl));
  } else if (dateFilter) {
    conditions.push(gte(articles.publicationDate, dateFilter));
  }

  if (starredOnly && useArticleStatuses) {
    conditions.push(eq(articleStatuses.isStarred, true));
  }

  if (excludeRead && useArticleStatuses) {
    conditions.push(sql`coalesce(${articleStatuses.isRead}, false) = false`);
  }

  if (continuationId) {
    conditions.push(lt(articles.id, continuationId));
  }

  return conditions;
}

// ── stream/contents rows ──────────────────────────────────────────────────────

const BASE_ARTICLE_SELECT = {
  articleId: articles.id,
  title: articles.title,
  link: articles.link,
  content: articles.content,
  publicationDate: articles.publicationDate,
  sourceName: feedSources.name,
  sourceUrl: feedSources.url,
  category: feedCategories.category,
} as const;

export async function queryStreamContentsRows(
  user: SessionUser,
  {
    feedUrl,
    dateFilter,
    continuationId,
    starredOnly,
    useArticleStatuses,
    limit,
    offset,
  }: {
    feedUrl: string | null;
    dateFilter: Date | null;
    continuationId: number | null;
    starredOnly: boolean;
    useArticleStatuses: boolean;
    limit: number;
    offset: number;
  },
): Promise<ListedArticle[]> {
  const db = getDb();
  const conditions = buildStreamConditions({
    feedUrl,
    dateFilter,
    continuationId,
    starredOnly,
    useArticleStatuses,
  });

  const baseFrom = db
    .select(
      useArticleStatuses
        ? {
            ...BASE_ARTICLE_SELECT,
            isRead: articleStatuses.isRead,
            isStarred: articleStatuses.isStarred,
          }
        : {
            ...BASE_ARTICLE_SELECT,
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

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  if (useArticleStatuses) {
    return baseFrom
      .leftJoin(
        articleStatuses,
        and(
          eq(articleStatuses.userId, user.userId),
          eq(articleStatuses.articleId, articles.id),
        ),
      )
      .where(whereClause)
      .orderBy(desc(articles.id))
      .limit(limit)
      .offset(offset);
  }

  return baseFrom
    .where(whereClause)
    .orderBy(desc(articles.id))
    .limit(limit)
    .offset(offset);
}

// ── stream/items/ids rows ─────────────────────────────────────────────────────

export async function queryStreamItemIdRows(
  user: SessionUser,
  {
    feedUrl,
    dateFilter,
    continuationId,
    starredOnly,
    excludeRead,
    useArticleStatuses,
    limit,
    offset,
  }: {
    feedUrl: string | null;
    dateFilter: Date | null;
    continuationId: number | null;
    starredOnly: boolean;
    excludeRead: boolean;
    useArticleStatuses: boolean;
    limit: number;
    offset: number;
  },
): Promise<StreamRow[]> {
  const db = getDb();
  const conditions = buildStreamConditions({
    feedUrl,
    dateFilter,
    continuationId,
    starredOnly,
    excludeRead,
    useArticleStatuses,
  });

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
      .where(whereClause)
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
    .where(whereClause)
    .orderBy(desc(articles.id))
    .limit(limit)
    .offset(offset);
}

// ── stream/items/contents rows ────────────────────────────────────────────────

export async function queryStreamItemContentRows(
  user: SessionUser,
  articleIds: number[],
  useArticleStatuses: boolean,
): Promise<ListedArticle[]> {
  const db = getDb();

  if (useArticleStatuses) {
    return db
      .select({
        ...BASE_ARTICLE_SELECT,
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
      .where(inArray(articles.id, articleIds));
  }

  return db
    .select({
      ...BASE_ARTICLE_SELECT,
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
    .where(inArray(articles.id, articleIds));
}
