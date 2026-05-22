import { sql } from "drizzle-orm";

import type { ArticleFilter, ArticleSortOrder } from "@/lib/core/filters";
import type { FeedRecord } from "@/lib/core/refresh";

import { CONFIG } from "@/lib";
import { ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH } from "@/lib/core";
import { toPlainText } from "@/lib/sanitize";

import {
  type ArticleRow,
  isValidRankedRow,
  type RankedRow,
} from "./batch-types";

/**
 * Defines the DB mod type.
 */
type DbMod = typeof import("@/lib/db");

/**
 * Describes the options for query top articles per feed.
 */
interface QueryTopArticlesPerFeedOptions {
  articleFilter?: ArticleFilter;
  articleLimit?: number;
  articleSortOrder?: ArticleSortOrder;
  searchTerm?: string;
}

/**
 * Describes the options for top articles per feed query.
 */
interface TopArticlesPerFeedQueryOptions {
  articleFilter: ArticleFilter;
  articleSortOrder: ArticleSortOrder;
  feedIds: number[];
  normalizedArticleLimit: number;
  searchPattern: string | undefined;
  userId: number;
}

/**
 * Process the map rows to article map.
 * @param rows - The rows.
 * @param feedByUrl - The feed by url.
 * @param allowedUrls - The allowed urls.
 * @returns The map rows to article map.
 */
export function mapRowsToArticleMap(
  rows: RankedRow[],
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
): Map<string, ArticleRow[]> {
  const idToUrl = buildFeedUrlIdMap(feedByUrl, allowedUrls);
  const articlesByUrl = new Map<string, ArticleRow[]>(
    allowedUrls.map((url) => [url, []]),
  );

  for (const row of rows) {
    if (!isValidRankedRow(row)) {
      continue;
    }

    const url = idToUrl.get(Number(row.feedId));
    if (!url) {
      continue;
    }

    const articlesForUrl = articlesByUrl.get(url);
    if (!articlesForUrl) {
      continue;
    }

    const article = toArticleRow(row, Number(row.feedId));
    if (!article) {
      continue;
    }

    articlesForUrl.push(article);
  }

  return articlesByUrl;
}

/**
 * Query the ranked article window across the selected feeds.
 *
 * When callers omit `articleLimit`, the query remains bounded by
 * `MAX_ALL_ARTICLES_LIMIT` to protect legacy unwindowed reads. When the
 * dashboard supplies an explicit infinite-scroll window, that value is honored
 * as-is after positive safe-integer validation by the API layer, allowing large
 * unread/all-feeds libraries to page past the default fallback.
 * @param db - Database client used to execute the ranked article query.
 * @param userId - Authenticated user whose enabled feed sources scope the query.
 * @param feedIds - Feed IDs selected by the current dashboard category/feed.
 * @param options - Article filter, requested window limit, search term, and
 *   display sort order for the ranked query.
 * @returns Ranked article rows for the requested global article window.
 */
export async function queryTopArticlesPerFeed(
  db: ReturnType<DbMod["getDb"]>,
  userId: number,
  feedIds: number[],
  options: QueryTopArticlesPerFeedOptions = {},
): Promise<RankedRow[]> {
  const {
    articleFilter = "all",
    articleLimit = CONFIG.MAX_ALL_ARTICLES_LIMIT,
    articleSortOrder = "newest",
    searchTerm,
  } = options;
  const normalizedArticleLimit = Math.max(1, articleLimit);
  const normalizedSearchTerm = searchTerm?.trim() ?? "";
  const searchPattern =
    normalizedSearchTerm.length > 0
      ? `%${escapeLikePattern(normalizedSearchTerm)}%`
      : undefined;

  const queryResult = await db.execute<RankedRow>(
    buildTopArticlesPerFeedQuery({
      articleFilter,
      articleSortOrder,
      feedIds,
      normalizedArticleLimit,
      searchPattern,
      userId,
    }),
  );

  return normalizeRankedQueryResult(queryResult);
}

/**
 * Build the article filter condition.
 * @param articleFilter - The article filter.
 * @returns The article filter condition.
 */
function buildArticleFilterCondition(articleFilter: ArticleFilter) {
  switch (articleFilter) {
    case "all": {
      return sql`true`;
    }

    case "read": {
      return sql`COALESCE(status.is_read, false) = true`;
    }

    case "starred": {
      return sql`COALESCE(status.is_starred, false) = true`;
    }

    case "unread": {
      return sql`COALESCE(status.is_read, false) = false`;
    }
  }
}

/**
 * Build the article search condition.
 * @param searchPattern - The search pattern.
 * @returns The article search condition.
 */
function buildArticleSearchCondition(searchPattern: string | undefined) {
  if (!searchPattern) {
    return sql`true`;
  }

  return sql`(
    article.title ILIKE ${searchPattern} ESCAPE '\\'
    OR article.content ILIKE ${searchPattern} ESCAPE '\\'
    OR article.link ILIKE ${searchPattern} ESCAPE '\\'
    OR source.name ILIKE ${searchPattern} ESCAPE '\\'
    OR source.url ILIKE ${searchPattern} ESCAPE '\\'
    OR category.category ILIKE ${searchPattern} ESCAPE '\\'
  )`;
}

/**
 * Build the SQL `ORDER BY` clause for the article-window query, switching
 * between newest-first (descending publication date) and oldest-first
 * (ascending publication date) based on the requested display order. The
 * secondary sort by `article.id` keeps ordering stable for rows that share an
 * exact `publication_date` timestamp.
 * @param articleSortOrder - The desired display order.
 * @returns The Drizzle SQL fragment for the `ORDER BY` clause.
 */
function buildArticleSortOrderClause(articleSortOrder: ArticleSortOrder) {
  if (articleSortOrder === "oldest") {
    return sql`ORDER BY article.publication_date ASC, article.id ASC`;
  }

  return sql`ORDER BY article.publication_date DESC, article.id DESC`;
}

/**
 * Build the feed url id map.
 * @param feedByUrl - The feed by url.
 * @param allowedUrls - The allowed urls.
 * @returns The feed url id map.
 */
function buildFeedUrlIdMap(
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
): Map<number, string> {
  return new Map<number, string>(
    allowedUrls
      .map((url): [number, string] | null => {
        const id = feedByUrl.get(url)?.id;
        return id !== undefined ? [id, url] : null;
      })
      .filter((entry): entry is [number, string] => entry !== null),
  );
}

/**
 * Build the ranked article query for the requested feed window.
 * @param options - The normalized query inputs.
 * @returns The Drizzle SQL fragment to execute.
 */
function buildTopArticlesPerFeedQuery(options: TopArticlesPerFeedQueryOptions) {
  return sql`
    WITH selected_feed_ids AS (
      SELECT *
      FROM unnest(ARRAY[${sql.join(
        options.feedIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::int[]) AS fid(id)
    )
    SELECT article.id,
           article.title,
           article.link,
           LEFT(
             regexp_replace(
               regexp_replace(article.content, '<[^>]+>', ' ', 'gi'),
               '\\s+',
               ' ',
               'g'
             ),
             ${ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH}
           ) AS content,
           article.publication_date AS "publicationDate",
           article.feed_id          AS "feedId",
           article.last_checked     AS "lastChecked",
           COALESCE(status.is_read, false)    AS "isRead",
           COALESCE(status.is_starred, false) AS "isStarred"
    FROM "Article" article
    INNER JOIN selected_feed_ids fid
      ON fid.id = article.feed_id
    INNER JOIN "Feed" feed
      ON feed.id = article.feed_id
    INNER JOIN "FeedSource" source
      ON source.url = feed.url
     AND source.user_id = ${options.userId}
     AND source.enabled = true
    LEFT JOIN "FeedCategory" category
      ON category.feed_id = feed.id AND category.user_id = ${options.userId}
    LEFT JOIN "ArticleStatus" status
      ON status.article_id = article.id AND status.user_id = ${options.userId}
    WHERE ${buildArticleFilterCondition(options.articleFilter)}
      AND ${buildArticleSearchCondition(options.searchPattern)}
    ${buildArticleSortOrderClause(options.articleSortOrder)}
    LIMIT ${options.normalizedArticleLimit}
  `;
}

/**
 * Process the escape like pattern.
 * @param value - The value.
 * @returns The escape like pattern.
 */
function escapeLikePattern(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

/**
 * Normalize the ranked article query result into an array of rows.
 * @param queryResult - The raw database execute result.
 * @returns The ranked rows array.
 */
function normalizeRankedQueryResult(queryResult: unknown): RankedRow[] {
  if (Array.isArray(queryResult)) {
    return queryResult as RankedRow[];
  }

  return Array.isArray((queryResult as { rows?: RankedRow[] }).rows)
    ? (queryResult as { rows: RankedRow[] }).rows
    : [];
}

/**
 * Process the read row text.
 * @param value - The value.
 * @returns The read row text.
 */
function readRowText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Process the strip preview span wrappers.
 * @param value - The value.
 * @returns The strip preview span wrappers.
 */
function stripPreviewSpanWrappers(value: string): string {
  return value.replace(/<\/?span\b[^>]*>/gi, "");
}

/**
 * Process the to article row.
 * @param row - The row.
 * @param feedId - The feed id.
 * @returns The to article row.
 */
function toArticleRow(row: RankedRow, feedId: number): ArticleRow | null {
  const id = toFiniteNumber(row.id);
  const normalizedFeedId = toFiniteNumber(row.feedId);
  if (id === null || normalizedFeedId === null) {
    return null;
  }

  return {
    content: toPlainText(stripPreviewSpanWrappers(readRowText(row.content))),
    feedId,
    hasFullContent: false,
    id,
    isRead: Boolean(row.isRead),
    isStarred: Boolean(row.isStarred),
    lastChecked: new Date(row.lastChecked as Date | string),
    link: readRowText(row.link),
    publicationDate: new Date(row.publicationDate as Date | string),
    title: readRowText(row.title),
  };
}

/**
 * Process the to finite number.
 * @param value - The value.
 * @returns The to finite number.
 */
function toFiniteNumber(value: unknown): null | number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
