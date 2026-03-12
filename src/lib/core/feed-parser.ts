/**
 * RSS feed item parsing helpers.
 * Pure transformations: no IO, no DB access.
 */

import Parser from "rss-parser";

import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleTitle,
} from "@/lib/sanitize";
import { parseDateOrFallback } from "@/lib/utils/dates";
import { isValidUrl } from "@/lib/utils/url";

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

export function dedupePendingArticles(
  items: PendingArticle[],
): PendingArticle[] {
  const byLink = new Map<string, PendingArticle>();

  for (const item of items) {
    const normalizedLink = item.link.trim();
    if (!normalizedLink) continue;

    const current = byLink.get(normalizedLink);
    if (!current) {
      byLink.set(normalizedLink, { ...item, link: normalizedLink });
      continue;
    }

    const itemDate = new Date(item.publicationDate).getTime();
    const currentDate = new Date(current.publicationDate).getTime();
    // Prefer newer; use content length as tiebreaker for identical timestamps
    // so a newer-but-empty item never displaces a complete article body.
    const shouldReplace =
      itemDate > currentDate ||
      (itemDate === currentDate &&
        item.content.length > current.content.length);

    if (shouldReplace)
      byLink.set(normalizedLink, { ...item, link: normalizedLink });
  }

  return [...byLink.values()];
}

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

export function parseFeedItemDate(
  value: string | undefined,
  fallback: Date,
): Date {
  return parseDateOrFallback(value, fallback);
}

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
