/**
 * Types and helpers for the GReader-compatible stream API responses
 * consumed by ArticleService.
 */

import { parseReaderItemId, toReaderItemId } from "../core/reader-item-id";
import type { Article } from "../core/types";

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

// ── State tag constants ───────────────────────────────────────────────────────

export const READER_STATE_TAGS = {
  read: "user/-/state/com.google/read",
  starred: "user/-/state/com.google/starred",
} as const;

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

export function readerItemToArticle(item: ReaderApiItem, index: number): Article {
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
    content: item.summary?.content || "",
    publicationDate,
    lastChecked: new Date(),
    feedId: 0,
    feedName: item.origin?.title,
    feedUrl: originFeedUrl,
    isRead: categories.includes(READER_STATE_TAGS.read),
    isStarred: categories.includes(READER_STATE_TAGS.starred),
  };
}

// ── Tag editing helpers ───────────────────────────────────────────────────────

export function buildEditTagBody(
  articleId: number,
  { addTag, removeTag }: { addTag?: string; removeTag?: string },
): URLSearchParams {
  const body = new URLSearchParams({
    i: toReaderItemId(articleId),
    async: "true",
  });
  if (addTag) body.append("a", addTag);
  if (removeTag) body.append("r", removeTag);
  return body;
}
