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
 * @param normalizedSources
 * @param batchResults
 * @param usePlaceholderData
 * @param getPlaceholderArticles
 * @param previousFeed
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
 * @param failedFeeds
 * @param sourceNamesByUrl
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
