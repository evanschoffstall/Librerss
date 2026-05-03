import type { ArticleFilter, ArticleSortOrder } from "@/lib/core";

import type { BatchRequestCompletedOptions } from "./endpoint";
import type { BatchFetchExecutionResult } from "./isolated-feed-fallback";

/**
 * Describes the options for batch success response options.
 */
interface BatchSuccessResponseOptionsOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  articleSortOrder: ArticleSortOrder;
  batchFetchResult: BatchFetchExecutionResult;
  diagnosticsEnabled: boolean;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  intent: string;
  invalidUrlCount: number;
  normalizedUrls: string[];
  requestSource: string;
  requestStartedAt: number;
  searchTerm: string | undefined;
  skipRefresh: boolean;
  userId: number;
}

/**
 * Build the batch success response options.
 * @param options - The options used to build the batch success response options.
 * @returns The batch success response options.
 */
export function buildBatchSuccessResponseOptions(
  options: BatchSuccessResponseOptionsOptions,
): BatchRequestCompletedOptions {
  return {
    articleFilter: options.articleFilter,
    articleLimit: options.articleLimit,
    articleSortOrder: options.articleSortOrder,
    cachedCount: options.batchFetchResult.cachedCount,
    cooldownLimitedCount: options.batchFetchResult.cooldownLimitedCount,
    diagnosticsEnabled: options.diagnosticsEnabled,
    forceRefresh: options.forceRefresh,
    forceResolveUpstream: options.forceResolveUpstream,
    intent: options.intent,
    invalidUrlCount: options.invalidUrlCount,
    normalizedUrls: options.normalizedUrls,
    refreshedCount: options.batchFetchResult.refreshedCount,
    requestSource: options.requestSource,
    requestStartedAt: options.requestStartedAt,
    resolution: options.batchFetchResult.resolution,
    results: options.batchFetchResult.results,
    searchTerm: options.searchTerm,
    skipRefresh: options.skipRefresh,
    upstreamErrors: options.batchFetchResult.upstreamErrors,
    userId: options.userId,
  };
}
