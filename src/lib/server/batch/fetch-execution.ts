import type { ArticleFilter } from "@/lib/core";
import type { FeedUpstreamTransport } from "@/lib/core/feed-fetcher-batch";
import type { fetchAndCacheFeedArticlesBatch } from "@/lib/core/server";

import type { BatchUrlDescriptor } from "./endpoint";

import { buildBatchResultItem } from "./result-item";

export function buildBatchFetchRequestOptions(options: {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  knownLastFetchedAtByUrl: Map<string, Date>;
  requestSource: string;
  resolveProxyTransport: () => Promise<FeedUpstreamTransport | undefined>;
  searchTerm: string | undefined;
  skipRefresh: boolean;
}) {
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

export function buildBatchFetchResults(options: {
  requestUrls: BatchUrlDescriptor[];
  response: Awaited<ReturnType<typeof fetchAndCacheFeedArticlesBatch>>;
}) {
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
