import { type FeedBatchSource, mapBatchResultsToArticles } from "./feed-batch";
import {
  type FeedBatchResult,
  getNewestLastFetchedAt,
  getSourceNamesByUrl,
} from "./feed-loader-helpers";

import { type Article } from "@/lib";

interface FeedBatchOutcome {
  articles: Article[];
  failedFeeds: FeedBatchResult[];
  newestLastFetchedAt: Date | null;
  sourceNamesByUrl: Map<string, string | undefined>;
}

export function buildFeedBatchOutcome(
  normalizedSources: FeedBatchSource[],
  batchResults: FeedBatchResult[],
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

export function formatFeedFailureLabel(
  failedFeeds: FeedBatchResult[],
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
