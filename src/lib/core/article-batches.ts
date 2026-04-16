import { sql } from "drizzle-orm";

import type { ArticleFilter } from "@/lib/core/filters";

import { CONFIG } from "@/lib";
import { ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH } from "@/lib/core";
import { toPlainText } from "@/lib/sanitize";

import type { FeedRecord } from "./refresher";

import {
  type ArticleRow,
  isValidRankedRow,
  type RankedRow,
} from "./batch-types";

type DbMod = typeof import("@/lib/db");

/** Maps the ranked article query rows back to their owning feed URLs. */
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
 * Queries one global page of preview article rows for the requested feed IDs.
 *
 * The filter is applied before the global limit so unread, read, and starred
 * views page through the correct database result set instead of filtering a
 * smaller per-feed preview window after the fact.
 */
export async function queryTopArticlesPerFeed(
  db: ReturnType<DbMod["getDb"]>,
  userId: number,
  feedIds: number[],
  articleFilter: ArticleFilter = "all",
  articleLimit = CONFIG.MAX_ALL_ARTICLES_LIMIT,
): Promise<RankedRow[]> {
  const normalizedArticleLimit = Math.min(
    Math.max(1, articleLimit),
    CONFIG.MAX_ALL_ARTICLES_LIMIT,
  );
  const queryResult = await db.execute<RankedRow>(sql`
    WITH selected_feed_ids AS (
      SELECT *
      FROM unnest(ARRAY[${sql.join(
        feedIds.map((id) => sql`${id}`),
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
    LEFT JOIN "ArticleStatus" status
      ON status.article_id = article.id AND status.user_id = ${userId}
    WHERE ${buildArticleFilterCondition(articleFilter)}
    ORDER BY article.publication_date DESC, article.id DESC
    LIMIT ${normalizedArticleLimit}
  `);

  if (Array.isArray(queryResult)) {
    return queryResult as RankedRow[];
  }

  return Array.isArray((queryResult as { rows?: RankedRow[] }).rows)
    ? (queryResult as { rows: RankedRow[] }).rows
    : [];
}

function buildArticleFilterCondition(articleFilter: ArticleFilter) {
  switch (articleFilter) {
    case "read": {
      return sql`COALESCE(status.is_read, false) = true`;
    }

    case "starred": {
      return sql`COALESCE(status.is_starred, false) = true`;
    }

    case "unread": {
      return sql`COALESCE(status.is_read, false) = false`;
    }

    default: {
      return sql`true`;
    }
  }
}

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

function readRowText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stripPreviewSpanWrappers(value: string): string {
  return value.replace(/<\/?span\b[^>]*>/gi, "");
}

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

function toFiniteNumber(value: unknown): null | number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
