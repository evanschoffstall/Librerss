/**
 * Helpers for mapping batch feed-fetch results into article lists.
 */

import { type Article, type CategoryTreeNode } from "@/lib";
import { dedupeAndSortArticles } from "./article-helpers";

export interface FeedBatchSource {
  url: string;
  name: string | undefined;
}

interface BatchResultItem {
  url: string;
  articles: Article[];
  ok: boolean;
  error?: string;
}

function enrichFeedArticles(
  articles: Article[],
  feedUrl: string,
  feedName: string | undefined,
): Article[] {
  return articles.map((article) => ({
    ...article,
    feedName: feedName ?? article.feedName,
    feedUrl,
  }));
}

/**
 * Maps raw batch-fetch results into a flat, deduplicated, sorted article list.
 *
 * For successful responses, enriches each article with `feedName` / `feedUrl`.
 * Falls back to placeholder data when `usePlaceholderData` is true.
 */
export function mapBatchResultsToArticles(
  batchResults: BatchResultItem[],
  sourceNameByUrl: Map<string, string | undefined>,
  usePlaceholderData: boolean,
  getPlaceholderArticles: (url: string) => Article[],
): Article[] {
  const perFeedArticles = batchResults.map((result): Article[] | null => {
    const feedName = sourceNameByUrl.get(result.url);

    if (result.ok && result.articles.length > 0) {
      return enrichFeedArticles(result.articles, result.url, feedName);
    }

    if (usePlaceholderData) {
      return enrichFeedArticles(
        getPlaceholderArticles(result.url),
        result.url,
        feedName,
      );
    }

    return null;
  });

  return dedupeAndSortArticles(
    perFeedArticles
      .filter((result): result is Article[] => Array.isArray(result))
      .flat(),
  );
}

// ── Feed-loader utilities ─────────────────────────────────────────────────────

/** Safety timeout for a single batch feed-load cycle. */
export const FEED_LOADING_FAILSAFE_MS = 20_000;

/**
 * De-duplicates batch sources by URL, preserving first-occurrence order.
 */
export function normalizeFeedBatchSources(
  sources: FeedBatchSource[],
): FeedBatchSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

/**
 * Produces a stable string signature for a batch-sources array so callers can
 * detect when the source list has genuinely changed between renders.
 */
export function buildBatchRequestSignature(sources: FeedBatchSource[]): string {
  return sources
    .map((source) => source.url)
    .sort()
    .join("|");
}

/**
 * Converts a flat list of category tree leaf nodes into FeedBatchSource records,
 * filtering out any nodes that lack a feed URL.
 */
export function mapFeedNodesToBatchSources(
  nodes: CategoryTreeNode[],
): FeedBatchSource[] {
  return nodes
    .filter((node): node is CategoryTreeNode & { data: { url: string } } =>
      Boolean(node.data?.url),
    )
    .map((node) => ({
      url: node.data.url,
      name: node.label,
    }));
}
