/**
 * Helpers for mapping batch feed-fetch results into article lists.
 */

import type { BatchFeedResponseItem } from "@/lib/api/http";
import type { Article, ArticleSortOrder, CategoryTreeNode } from "@/lib/core";

import { BATCH_REQUEST_TIMEOUT_MS } from "@/lib/api/http";
import {
  dedupeArticleRecords,
  preferRicherArticleRecord,
  sortArticleRecordsByPublicationDateDesc,
} from "@/lib/utils";

/**
 * Describes the feed batch source.
 */
export interface FeedBatchSource {
  name: string | undefined;
  url: string;
}

/**
 * Process the map batch results to articles.
 * @param batchResults - The batch results.
 * @param sourceNameByUrl - The source name by url.
 * @param usePlaceholderData - The placeholder data.
 * @param getPlaceholderArticles - Callback that returns placeholder articles for a given feed URL.
 * @param previousFeed - The previous feed.
 * @param articleSortOrder - The chronological display order requested for the visible article list.
 * @returns The map batch results to articles.
 */
export function mapBatchResultsToArticles(
  batchResults: BatchFeedResponseItem[],
  sourceNameByUrl: Map<string, string | undefined>,
  usePlaceholderData: boolean,
  getPlaceholderArticles: (url: string) => Article[],
  previousFeed: Article[] = [],
  articleSortOrder: ArticleSortOrder = "newest",
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
    articleSortOrder,
  );
}

/**
 * Deduplicate article records while preserving the requested chronological order.
 * @param articles - The article records collected across all batch results.
 * @param articleSortOrder - The chronological display order requested for the visible article list.
 * @returns The deduplicated and chronologically ordered article records.
 */
function dedupeAndSortArticles(
  articles: Article[],
  articleSortOrder: ArticleSortOrder = "newest",
): Article[] {
  const dedupedArticles = dedupeArticleRecords(
    articles,
    preferRicherArticleRecord,
  ).sort(sortArticleRecordsByPublicationDateDesc);

  return articleSortOrder === "oldest"
    ? dedupedArticles.reverse()
    : dedupedArticles;
}

/**
 * Process the enrich feed articles.
 * @param articles - The articles.
 * @param feedUrl - The feed url.
 * @param feedName - The feed name.
 * @returns The enrich feed articles.
 */
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
// Must exceed the largest allowed batch HTTP deadline so the request-owned
// timeout fires before this UI failsafe, and legitimate 207 Multi-Status batch
// responses are not converted into a client-only timeout error.
export const FEED_LOADING_FAILSAFE_MS = BATCH_REQUEST_TIMEOUT_MS + 5_000;

/**
 * Build the batch request signature.
 * @param sources - The sources.
 * @returns The batch request signature.
 */
export function buildBatchRequestSignature(sources: FeedBatchSource[]): string {
  return sources
    .map((source) => source.url)
    .sort()
    .join("|");
}

/**
 * Process the map feed nodes to batch sources.
 * @param nodes - The nodes.
 * @returns The map feed nodes to batch sources.
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
 * Normalize the feed batch sources.
 * @param sources - The sources.
 * @returns The feed batch sources.
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
