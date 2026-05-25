import type { BatchFeedResponseItem } from "@/lib/api/http";
import type { Article, ArticleSortOrder } from "@/lib/core";

import {
  type FeedBatchSource,
  getNewestLastFetchedAt,
  getSourceNamesByUrl,
  mapBatchResultsToArticles,
} from "@/app/dashboard/services/feed-data/batch";

/**
 * Describes the feed batch outcome.
 */
interface FeedBatchOutcome {
  articles: Article[];
  failedFeeds: BatchFeedResponseItem[];
  newestLastFetchedAt: Date | null;
  sourceNamesByUrl: Map<string, string | undefined>;
}

/**
 * Build the feed batch outcome.
 * @param normalizedSources - The normalized sources.
 * @param batchResults - The batch results.
 * @param usePlaceholderData - The placeholder data.
 * @param getPlaceholderArticles - Callback that returns placeholder articles for a given feed URL.
 * @param previousFeed - The previous feed.
 * @param articleSortOrder - The chronological display order requested for the visible article list.
 * @returns The feed batch outcome.
 */
export function buildFeedBatchOutcome(
  normalizedSources: FeedBatchSource[],
  batchResults: BatchFeedResponseItem[],
  usePlaceholderData: boolean,
  getPlaceholderArticles: (url: string) => Article[],
  previousFeed: Article[] = [],
  articleSortOrder: ArticleSortOrder = "newest",
): FeedBatchOutcome {
  const sourceNamesByUrl = getSourceNamesByUrl(normalizedSources);

  return {
    articles: mapBatchResultsToArticles(
      batchResults,
      sourceNamesByUrl,
      usePlaceholderData,
      getPlaceholderArticles,
      previousFeed,
      articleSortOrder,
    ),
    failedFeeds: batchResults.filter((item) => item.error),
    newestLastFetchedAt: getNewestLastFetchedAt(batchResults),
    sourceNamesByUrl,
  };
}

/**
 * Process the format feed failure label.
 * @param failedFeeds - The failed feeds.
 * @param sourceNamesByUrl - The source names by url.
 * @returns The format feed failure label.
 */
export function formatFeedFailureLabel(
  failedFeeds: BatchFeedResponseItem[],
  sourceNamesByUrl: Map<string, string | undefined>,
): string {
  const failedNames = failedFeeds.map((item) =>
    formatFailedFeedLabel(item, sourceNamesByUrl),
  );

  return failedNames.length <= 3
    ? failedNames.join(", ")
    : `${failedNames.slice(0, 3).join(", ")} and ${failedNames.length - 3} more`;
}

/**
 * Build the display label for one failed feed, appending the upstream HTTP code when available.
 * @param failedFeed - The failed feed batch item.
 * @param sourceNamesByUrl - Source-name lookup keyed by feed URL.
 * @returns The display label shown inside the partial-failure toast description.
 */
function formatFailedFeedLabel(
  failedFeed: BatchFeedResponseItem,
  sourceNamesByUrl: Map<string, string | undefined>,
): string {
  const sourceName = sourceNamesByUrl.get(failedFeed.url) ?? failedFeed.url;

  return typeof failedFeed.statusCode === "number"
    ? `${sourceName} (HTTP ${failedFeed.statusCode})`
    : sourceName;
}
