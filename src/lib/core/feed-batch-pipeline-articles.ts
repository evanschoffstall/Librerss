import { sql } from "drizzle-orm";

import type { getDb } from "@/lib/db/db";

import { CONFIG } from "@/lib/config";
import { ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH } from "@/lib/core/article-preview";
import { toPlainText } from "@/lib/sanitize";

import type { FeedRecord } from "./feed-refresh";

import {
  type ArticleRow,
  isValidRankedRow,
  type RankedRow,
} from "./feed-batch-pipeline.types";

/** Maps the ranked article query rows back to their owning feed URLs. */
export function mapRowsToArticleMap(
  rows: RankedRow[],
  feedByUrl: Map<string, FeedRecord>,
  allowedUrls: string[],
): Map<string, ArticleRow[]> {
  const idToUrl = new Map<number, string>(
    allowedUrls
      .map((url): [number, string] | null => {
        const id = feedByUrl.get(url)?.id;
        return id !== undefined ? [id, url] : null;
      })
      .filter((entry): entry is [number, string] => entry !== null),
  );

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

    const id = Number(row.id);
    const feedId = Number(row.feedId);
    if (!Number.isFinite(id) || !Number.isFinite(feedId)) {
      continue;
    }

    const previewSource = typeof row.content === "string" ? row.content : "";
    const articlesForUrl = articlesByUrl.get(url);
    if (!articlesForUrl) {
      continue;
    }

    articlesForUrl.push({
      content: toPlainText(stripPreviewSpanWrappers(previewSource)),
      feedId,
      hasFullContent: false,
      id,
      isRead: Boolean(row.isRead),
      isStarred: Boolean(row.isStarred),
      lastChecked: new Date(row.lastChecked as Date | string),
      link: typeof row.link === "string" ? row.link : "",
      publicationDate: new Date(row.publicationDate as Date | string),
      title: typeof row.title === "string" ? row.title : "",
    });
  }

  return articlesByUrl;
}

/**
 * Minimum articles guaranteed per feed in multi-feed batch queries.
 *
 * Prevents high-volume feeds from crowding out less prolific feeds when the
 * global article budget is divided across many feeds.
 */
const MINIMUM_ARTICLES_PER_FEED_BATCH = 20;

/**
 * Computes a fair per-feed article budget that guarantees every feed
 * contributes at least {@link MINIMUM_ARTICLES_PER_FEED_BATCH} articles
 * while staying close to the configured global article limit.
 */
export function computePerFeedBudget(feedCount: number): number {
  return Math.min(
    CONFIG.MAX_ARTICLES_PER_FEED,
    Math.max(
      Math.ceil(CONFIG.MAX_ALL_ARTICLES_LIMIT / feedCount),
      MINIMUM_ARTICLES_PER_FEED_BATCH,
    ),
  );
}

/** Queries the preview article rows for the requested feed IDs. */
export async function queryTopArticlesPerFeed(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedIds: number[],
): Promise<RankedRow[]> {
  const perFeedBudget = computePerFeedBudget(feedIds.length);

  const queryResult = await db.execute<RankedRow>(sql`
    WITH selected_feed_ids AS (
      SELECT *
      FROM unnest(ARRAY[${sql.join(
        feedIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::int[]) AS fid(id)
    ),
    recent_candidates AS (
      SELECT a.id,
             a.title,
             a.link,
             a.content,
             a.publication_date,
             a.feed_id,
             a.last_checked
      FROM selected_feed_ids fid
      CROSS JOIN LATERAL (
        SELECT sub.id,
               sub.title,
               sub.link,
               LEFT(
                 regexp_replace(
                   regexp_replace(sub.content, '<[^>]+>', ' ', 'gi'),
                   '\\s+',
                   ' ',
                   'g'
                 ),
                 ${ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH}
               ) AS content,
               sub.publication_date,
               sub.feed_id,
               sub.last_checked
        FROM "Article" sub
        WHERE sub.feed_id = fid.id
        ORDER BY sub.publication_date DESC
        LIMIT ${perFeedBudget}
      ) a
    ),
    starred_candidates AS (
      SELECT sub.id,
             sub.title,
             sub.link,
             LEFT(
               regexp_replace(
                 regexp_replace(sub.content, '<[^>]+>', ' ', 'gi'),
                 '\\s+',
                 ' ',
                 'g'
               ),
               ${ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH}
             ) AS content,
             sub.publication_date,
             sub.feed_id,
             sub.last_checked
      FROM "Article" sub
      INNER JOIN selected_feed_ids fid
        ON fid.id = sub.feed_id
      INNER JOIN "ArticleStatus" starred_status
        ON starred_status.article_id = sub.id
       AND starred_status.user_id = ${userId}
       AND starred_status.is_starred = true
    ),
    candidate_articles AS (
      SELECT * FROM recent_candidates
      UNION
      SELECT * FROM starred_candidates
    )
    SELECT candidate.id,
           candidate.title,
           candidate.link,
           candidate.content,
           candidate.publication_date AS "publicationDate",
           candidate.feed_id          AS "feedId",
           candidate.last_checked     AS "lastChecked",
           COALESCE(status.is_read, false)    AS "isRead",
           COALESCE(status.is_starred, false) AS "isStarred"
    FROM candidate_articles candidate
    LEFT JOIN "ArticleStatus" status
      ON status.article_id = candidate.id AND status.user_id = ${userId}
    ORDER BY candidate.publication_date DESC
  `);

  return Array.isArray(queryResult)
    ? (queryResult as RankedRow[])
    : (queryResult as { rows: RankedRow[] }).rows;
}

function stripPreviewSpanWrappers(value: string): string {
  return value.replace(/<\/?span\b[^>]*>/gi, "");
}