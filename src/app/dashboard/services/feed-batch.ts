/**
 * Helpers for mapping batch feed-fetch results into article lists.
 */

import { dedupeAndSortArticles } from "./article-collection";

import { type Article, type CategoryTreeNode } from "@/lib";
import type { BatchFeedResponseItem } from "@/lib/api/http";

export interface FeedBatchSource {
  name: string | undefined;
  url: string;
}

/**
 * Maps raw batch-fetch results into a flat, deduplicated, sorted article list.
 *
 * For successful responses, enriches each article with `feedName` / `feedUrl`.
 * Falls back to placeholder data when `usePlaceholderData` is true.
 */
export function mapBatchResultsToArticles(
  batchResults: BatchFeedResponseItem[],
  sourceNameByUrl: Map<string, string | undefined>,
  usePlaceholderData: boolean,
  getPlaceholderArticles: (url: string) => Article[],
  previousFeed: Article[] = [],
): Article[] {
  const previousArticlesByFeedUrl = new Map<string, Article[]>();
  for (const article of previousFeed) {
    if (!article.feedUrl) {
      continue;
    }

    const currentArticles = previousArticlesByFeedUrl.get(article.feedUrl);
    if (currentArticles) {
      currentArticles.push(article);
      continue;
    }

    previousArticlesByFeedUrl.set(article.feedUrl, [article]);
  }

  const perFeedArticles = batchResults.map((result): Article[] | null => {
    const feedName = sourceNameByUrl.get(result.url);

    if (result.unchanged) {
      return enrichFeedArticles(
        previousArticlesByFeedUrl.get(result.url) ?? [],
        result.url,
        feedName,
      );
    }

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

// ── Feed-loader utilities ─────────────────────────────────────────────────────

/** Safety timeout for a single batch feed-load cycle. */
// Must exceed BATCH_REQUEST_TIMEOUT_MS (60 s) so the Axios-level timeout always
// fires before this failsafe, and actual slow upstream refreshes don't trigger
// a false "timed out" toast.
export const FEED_LOADING_FAILSAFE_MS = 65_000;

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
    .filter(
      (node): node is CategoryTreeNode & { data: { url: string } } =>
        Boolean(node.data?.url) && node.data?.enabled !== false,
    )
    .map((node) => ({
      name: node.label,
      url: node.data.url,
    }));
}

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
