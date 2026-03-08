/**
 * RSS feed item parsing helpers.
 * Pure transformations: no IO, no DB access.
 */

import { parseDateOrFallback } from "@/lib/utils/dates";
import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleTitle,
} from "@/lib/sanitize";
import { isValidUrl } from "@/lib/utils/url";
import Parser from "rss-parser";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PendingArticle = {
  title: string;
  link: string;
  publicationDate: Date;
  content: string;
  feedId: number;
  lastChecked: Date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseFeedItemDate(
  value: string | undefined,
  fallback: Date,
): Date {
  return parseDateOrFallback(value, fallback);
}

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
  newestPublicationDate: string | null;
  oldestPublicationDate: string | null;
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

export function toPendingArticle(
  item: Parser.Item & { contentEncoded?: string },
  feedId: number,
  now: Date,
): PendingArticle | null {
  if (!item.title || !item.link || !isValidUrl(item.link)) return null;

  // Prefer content:encoded (full article) over content/contentSnippet (excerpt)
  // content:encoded is mapped to contentEncoded via rss-parser customFields
  const rawContent =
    item.contentEncoded || item.content || item.contentSnippet || "";

  return {
    title: sanitizeArticleTitle(item.title),
    link: item.link,
    publicationDate: parseFeedItemDate(item.isoDate ?? item.pubDate, now),
    content: sanitizeAndTruncateArticleContent(rawContent),
    feedId,
    lastChecked: now,
  };
}
