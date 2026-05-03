/**
 * RSS feed item parsing helpers.
 * Pure transformations: no IO, no DB access.
 */

import type Parser from "rss-parser";

import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleTitle,
} from "@/lib/sanitize";
import {
  dedupeArticleRecords,
  isValidUrl,
  parseDateOrNull,
  preferNewerArticleRecord,
} from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Represents a sanitized article row that is ready for the upstream refresh
 * upsert. Feed items do not always include a publication timestamp, so the
 * refresh pipeline normalizes every accepted article to a concrete
 * `publicationDate` before the database write.
 */
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
 * Resolve the publication timestamp for an upstream feed item.
 * @param value - Candidate timestamp from `isoDate`, `pubDate`, or another feed parser field.
 * @param fallback - Current refresh timestamp to persist when the upstream item omits or malforms its date.
 * @returns A valid publication date for the article database row.
 */
export function parseFeedItemDate(value: unknown, fallback: Date): Date {
  return parseDateOrNull(value) ?? new Date(fallback);
}

/**
 * Convert a parsed upstream feed item into a sanitized pending article row.
 * @param item - RSS parser item, including optional full-content fields.
 * @param feedId - Database feed identifier that owns the article.
 * @param now - Current refresh timestamp used for `lastChecked` and missing publication dates.
 * @returns A pending article when title, link, and URL validation pass; otherwise `null`.
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
