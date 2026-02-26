/**
 * Types and helpers for the GReader-compatible stream API responses
 * consumed by ArticleService.
 */

import { parseReaderItemId } from "../core/reader-item-id";
import { READ_STATE, STARRED_STATE } from "../core/stream-ids";
import type { Article } from "../core/types";
import { sanitizeArticleHtml } from "../utils/sanitize";

// ── Wire types ────────────────────────────────────────────────────────────────

type ReaderApiLink = { href?: string };
type ReaderApiOrigin = { streamId?: string; title?: string; htmlUrl?: string };
type ReaderApiSummary = { content?: string };

export type ReaderApiItem = {
  id?: string;
  title?: string;
  published?: number;
  updated?: number;
  canonical?: ReaderApiLink[];
  alternate?: ReaderApiLink[];
  summary?: ReaderApiSummary;
  origin?: ReaderApiOrigin;
  categories?: string[];
};

export type ReaderApiStreamResponse = {
  items?: ReaderApiItem[];
};

// ── Parsing helpers ───────────────────────────────────────────────────────────

export function parseReaderStreamItems(
  data: ReaderApiStreamResponse | undefined,
): ReaderApiItem[] {
  return Array.isArray(data?.items) ? data.items : [];
}

function resolvePublishedTimestamp(item: ReaderApiItem): number {
  if (typeof item.published === "number") return item.published * 1000;
  if (typeof item.updated === "number") return item.updated * 1000;
  return Date.now();
}

export function readerItemToArticle(
  item: ReaderApiItem,
  index: number,
): Article {
  const publicationDate = new Date(resolvePublishedTimestamp(item));
  const canonicalLink = item.canonical?.[0]?.href;
  const alternateLink = item.alternate?.[0]?.href;
  const link = canonicalLink || alternateLink || `about:reader-item-${index}`;
  const originFeedUrl =
    item.origin?.htmlUrl ||
    (item.origin?.streamId?.startsWith("feed/")
      ? item.origin.streamId.slice("feed/".length)
      : undefined);
  const categories = item.categories ?? [];

  return {
    id: (item.id ? parseReaderItemId(item.id) : null) ?? index + 1,
    title: item.title?.trim() || "Untitled",
    link,
    content: sanitizeArticleHtml(item.summary?.content || ""),
    publicationDate,
    lastChecked: new Date(),
    feedId: 0,
    feedName: item.origin?.title,
    feedUrl: originFeedUrl,
    isRead: categories.includes(READ_STATE),
    isStarred: categories.includes(STARRED_STATE),
  };
}
