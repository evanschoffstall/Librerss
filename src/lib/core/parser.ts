/**
 * RSS feed item parsing helpers.
 *
 * These transformations stay pure so the upstream refresh layer can fetch,
 * parse, deduplicate, and persist feeds without mixing network or database
 * concerns into item normalization.
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
 * Parsed feed item shape produced by the shared rss-parser configuration.
 *
 * Rss-parser normalizes common RSS date fields into `isoDate` and `pubDate`,
 * but vendor RSS feeds can embed Atom date elements such as `a10:updated`
 * inside RSS items. The explicit Atom fields keep those timestamps available
 * before the fallback-to-refresh-time path runs.
 */
export interface ParsedFeedItem extends Parser.Item {
  atomPublished?: unknown;
  atomUpdated?: unknown;
  contentEncoded?: string;
}

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

/**
 * Custom rss-parser item fields required by LibreRSS normalization.
 *
 * The content mapping preserves full article bodies from `content:encoded`,
 * while the Atom date mappings prevent feeds that omit `pubDate` from being
 * stored with the refresh timestamp as their article publication date.
 */
export const FEED_PARSER_CUSTOM_FIELDS: Parser.CustomFields<
  Record<string, never>,
  ParsedFeedItem
> = {
  item: [
    ["content:encoded", "contentEncoded", { keepArray: false }],
    ["a10:published", "atomPublished", { keepArray: false }],
    ["published", "atomPublished", { keepArray: false }],
    ["a10:updated", "atomUpdated", { keepArray: false }],
    ["updated", "atomUpdated", { keepArray: false }],
  ],
};

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
 * Resolve the publication timestamp for an upstream feed item candidate value.
 * @param value - Candidate timestamp from a feed parser date field.
 * @param fallback - Current refresh timestamp used when the item omits or malforms every supported date field.
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
  item: ParsedFeedItem,
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
    publicationDate: parseFeedItemDate(resolveFeedItemDateValue(item), now),
    title: sanitizeArticleTitle(item.title),
  };
}

/**
 * Select the strongest available publication timestamp from a parsed feed item.
 * @param item - Parsed RSS or Atom-like item with normalized custom fields.
 * @returns The first supported date candidate in publication-preferred order.
 */
function resolveFeedItemDateValue(item: ParsedFeedItem): unknown {
  return item.isoDate ?? item.pubDate ?? item.atomPublished ?? item.atomUpdated;
}
