import type { BatchFeedResponseItem } from "@/lib/api/http";
import type { Article } from "@/lib/core";

import {
  type FeedBatchSource,
  getNewestLastFetchedAt,
  getSourceNamesByUrl,
  mapBatchResultsToArticles,
} from "@/app/dashboard/dashboard-services/feed-data/batch";

interface FeedBatchOutcome {
  articles: Article[];
  failedFeeds: BatchFeedResponseItem[];
  newestLastFetchedAt: Date | null;
  sourceNamesByUrl: Map<string, string | undefined>;
}

/**
 * Build the feed batch outcome.
 * @param normalizedSources - The d sources.
 * @param batchResults - The batch results.
 * @param usePlaceholderData - The placeholder data.
 * @param getPlaceholderArticles - The callback that placeholder articles.
 * @param previousFeed - The previous feed.
 * @returns The feed batch outcome.
 */
export function buildFeedBatchOutcome(
  normalizedSources: FeedBatchSource[],
  batchResults: BatchFeedResponseItem[],
  usePlaceholderData: boolean,
  getPlaceholderArticles: (url: string) => Article[],
  previousFeed: Article[] = [],
): FeedBatchOutcome {
  const sourceNamesByUrl = getSourceNamesByUrl(normalizedSources);

  return {
    articles: mapBatchResultsToArticles(
      batchResults,
      sourceNamesByUrl,
      usePlaceholderData,
      getPlaceholderArticles,
      previousFeed,
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
  const failedNames = failedFeeds.map((item) => {
    const sourceName = sourceNamesByUrl.get(item.url);
    return sourceName ?? item.url;
  });

  return failedNames.length <= 3
    ? failedNames.join(", ")
    : `${failedNames.slice(0, 3).join(", ")} and ${failedNames.length - 3} more`;
}
