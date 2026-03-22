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

/** Queries the preview article rows for the requested feed IDs. */
export async function queryTopArticlesPerFeed(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedIds: number[],
): Promise<RankedRow[]> {
  const queryResult = await db.execute<RankedRow>(sql`
    SELECT a.id, a.title, a.link, a.content,
           a.publication_date AS "publicationDate",
           a.feed_id          AS "feedId",
           a.last_checked     AS "lastChecked",
           COALESCE(s.is_read, false)    AS "isRead",
           COALESCE(s.is_starred, false) AS "isStarred"
    FROM unnest(ARRAY[${sql.join(
      feedIds.map((id) => sql`${id}`),
      sql`, `,
    )}]::int[]) AS fid(id)
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
             sub.publication_date, sub.feed_id, sub.last_checked
      FROM "Article" sub
      WHERE sub.feed_id = fid.id
      ORDER BY sub.publication_date DESC
      LIMIT ${CONFIG.MAX_ARTICLES_PER_FEED}
    ) a
    LEFT JOIN "ArticleStatus" s
      ON s.article_id = a.id AND s.user_id = ${userId}
    ORDER BY a.publication_date DESC
    LIMIT ${CONFIG.MAX_ALL_ARTICLES_LIMIT}
  `);

  return Array.isArray(queryResult)
    ? (queryResult as RankedRow[])
    : (queryResult as { rows: RankedRow[] }).rows;
}

function stripPreviewSpanWrappers(value: string): string {
  return value.replace(/<\/?span\b[^>]*>/gi, "");
}