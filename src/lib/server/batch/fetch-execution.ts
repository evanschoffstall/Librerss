import type { ArticleFilter } from "@/lib/core";
import type { FeedUpstreamTransport } from "@/lib/core/feed-fetcher-batch";
import type { fetchAndCacheFeedArticlesBatch } from "@/lib/core/server";

import type { BatchUrlDescriptor } from "./endpoint";

import { buildBatchResultItem } from "./result-item";

interface BatchFetchRequestOptionsOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  knownLastFetchedAtByUrl: Map<string, Date>;
  requestSource: string;
  resolveProxyTransport: () => Promise<FeedUpstreamTransport | undefined>;
  searchTerm: string | undefined;
  skipRefresh: boolean;
}

interface BatchFetchResultsOptions {
  requestUrls: BatchUrlDescriptor[];
  response: Awaited<ReturnType<typeof fetchAndCacheFeedArticlesBatch>>;
}
/**
 * Build the batch fetch request options.
 * @param options - The options used to build the batch fetch request options.
 * @returns The batch fetch request options.
 */
export function buildBatchFetchRequestOptions(
  options: BatchFetchRequestOptionsOptions,
) {
  return {
    articleFilter: options.articleFilter,
    articleLimit: options.articleLimit,
    ...(options.forceResolveUpstream ? { forceResolveUpstream: true } : {}),
    forceRefresh: options.forceRefresh,
    knownLastFetchedAtByUrl: options.knownLastFetchedAtByUrl,
    requestSource: options.requestSource,
    resolveProxyTransport: options.resolveProxyTransport,
    searchTerm: options.searchTerm,
    skipRefresh: options.skipRefresh,
  };
}

/**
 * Build the batch fetch results.
 * @param options - The options used to build the batch fetch results.
 * @returns The batch fetch results.
 */
export function buildBatchFetchResults(options: BatchFetchResultsOptions) {
  return options.requestUrls.map((item) =>
    buildBatchResultItem({
      batchMap: options.response.articles,
      item,
      lastFetchedByUrl: options.response.lastFetchedByUrl,
      unchangedUrls: options.response.unchangedUrls,
      upstreamErrors: options.response.errors,
    }),
  );
}
