import {
  parseReaderItemId,
  READ_STATE,
  STARRED_STATE,
} from "@/lib/core/stream-ids";
import type { Article } from "@/lib/core/types";
import { sanitizeArticleHtml } from "@/lib/sanitize";

// ── Reader API wire types ────────────────────────────────────────────────────

export interface ReaderApiItem {
  alternate?: ReaderApiLink[];
  canonical?: ReaderApiLink[];
  categories?: string[];
  id?: string;
  origin?: ReaderApiOrigin;
  published?: number;
  summary?: ReaderApiSummary;
  title?: string;
  updated?: number;
}
export interface ReaderApiStreamResponse {
  items?: ReaderApiItem[];
}
interface ReaderApiLink {
  href?: string;
}

interface ReaderApiOrigin {
  htmlUrl?: string;
  streamId?: string;
  title?: string;
}

interface ReaderApiSummary {
  content?: string;
}

export function parseReaderStreamItems(
  data: ReaderApiStreamResponse | undefined,
): ReaderApiItem[] {
  return Array.isArray(data?.items) ? data.items : [];
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
    content: sanitizeArticleHtml(item.summary?.content || ""),
    feedId: 0,
    feedName: item.origin?.title,
    feedUrl: originFeedUrl,
    id: (item.id ? parseReaderItemId(item.id) : null) ?? index + 1,
    isRead: categories.includes(READ_STATE),
    isStarred: categories.includes(STARRED_STATE),
    lastChecked: new Date(),
    link,
    publicationDate,
    title: item.title?.trim() || "Untitled",
  };
}

function resolvePublishedTimestamp(item: ReaderApiItem): number {
  if (typeof item.published === "number") return item.published * 1000;
  if (typeof item.updated === "number") return item.updated * 1000;
  return Date.now();
}
