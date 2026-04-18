/**
 * RSS feed item parsing helpers.
 * Pure transformations: no IO, no DB access.
 */

import Parser from "rss-parser";

import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleTitle,
} from "@/lib/sanitize";
import {
  dedupeArticleRecords,
  isValidUrl,
  parseDateOrFallback,
  preferNewerArticleRecord,
} from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PendingArticle {
  content: string;
  feedId: number;
  lastChecked: Date;
  link: string;
  publicationDate: Date;
  title: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Process the dedupe pending articles.
 * @param items - The items.
 * @returns The dedupe pending articles.
 */
export function dedupePendingArticles(
  items: PendingArticle[],
): PendingArticle[] {
  return dedupeArticleRecords(items, preferNewerArticleRecord);
}

/**
 * Return the publication date range.
 * @param items - The items.
 * @returns The publication date range.
 */
export function getPublicationDateRange(items: PendingArticle[]): {
  newestPublicationDate: null | string;
  oldestPublicationDate: null | string;
} {
  if (items.length === 0) {
    return { newestPublicationDate: null, oldestPublicationDate: null };
  }

  const timestamps = items.map((item) => item.publicationDate.getTime());
  return {
    newestPublicationDate: new Date(Math.max(...timestamps)).toISOString(),
    oldestPublicationDate: new Date(Math.min(...timestamps)).toISOString(),
  };
}

/**
 * Parse the feed item date.
 * @param value - The value.
 * @param fallback - The fallback.
 * @returns The feed item date.
 */
export function parseFeedItemDate(
  value: string | undefined,
  fallback: Date,
): Date {
  return parseDateOrFallback(value, fallback);
}

/**
 * Process the to pending article.
 * @param item - The item.
 * @param feedId - The feed id.
 * @param now - The now.
 * @returns The to pending article.
 */
export function toPendingArticle(
  item: Parser.Item & { contentEncoded?: string },
  feedId: number,
  now: Date,
): null | PendingArticle {
  if (!item.title || !item.link || !isValidUrl(item.link)) return null;

  // Prefer content:encoded (full article) over content/contentSnippet (excerpt)
  // content:encoded is mapped to contentEncoded via rss-parser customFields
  const rawContent =
    item.contentEncoded ?? item.content ?? item.contentSnippet ?? "";

  return {
    content: sanitizeAndTruncateArticleContent(rawContent),
    feedId,
    lastChecked: now,
    link: item.link,
    publicationDate: parseFeedItemDate(item.isoDate ?? item.pubDate, now),
    title: sanitizeArticleTitle(item.title),
  };
}
