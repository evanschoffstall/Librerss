import type { FeedBatchSource } from "./feed-batch";
import type { FeedFetchOptions } from "./selection";

import type { Article } from "@/lib";
import { FeedService } from "@/lib";
import type { BatchFeedResponseItem } from "@/lib/api/http";
import { getPlaceholderArticlesForSource } from "@/lib/core/placeholder";

interface FeedBatchResolverDependencies {
  fetchFeedsBatch: (
    urls: string[],
    options?: {
      forceRefresh?: boolean;
      knownLastFetchedAtByUrl?: ReadonlyMap<string, Date>;
      requestSource?: string;
      signal?: AbortSignal;
      skipRefresh?: boolean;
    },
  ) => Promise<BatchFeedResponseItem[]>;
  getPlaceholderArticles: (url: string) => Article[];
}

const defaultDependencies: FeedBatchResolverDependencies = {
  fetchFeedsBatch: (urls, options) => FeedService.getFeedsBatch(urls, options),
  getPlaceholderArticles: getPlaceholderArticlesForSource,
};

export async function resolveFeedBatchResults(
  normalizedSources: FeedBatchSource[],
  usePlaceholderData: boolean,
  options?: FeedFetchOptions,
  signal?: AbortSignal,
  dependencies: FeedBatchResolverDependencies = defaultDependencies,
): Promise<BatchFeedResponseItem[]> {
  if (usePlaceholderData) {
    return normalizedSources.map((source) =>
      toPlaceholderBatchResult(source, dependencies.getPlaceholderArticles),
    );
  }

  return dependencies.fetchFeedsBatch(
    normalizedSources.map((source) => source.url),
    {
      forceRefresh: options?.forceRefresh === true,
      knownLastFetchedAtByUrl: options?.knownLastFetchedAtByUrl,
      requestSource: options?.requestSource,
      signal,
      skipRefresh: options?.skipRefresh ?? false,
    },
  );
}

function toPlaceholderBatchResult(
  source: FeedBatchSource,
  getPlaceholderArticles: (url: string) => Article[],
): BatchFeedResponseItem {
  return {
    articles: getPlaceholderArticles(source.url).map((article) => ({
      ...article,
      feedName: source.name,
      feedUrl: source.url,
    })),
    ok: true,
    url: source.url,
  };
}
