"use client";

import type { QueryClient } from "@tanstack/react-query";

import type { useFeedBatchQuery } from "@/app/dashboard/hooks/feed-loader/useFeedBatchQuery";
import type { useFeedBatchRequestState } from "@/app/dashboard/hooks/feed-loader/useFeedBatchRequestState";
import type { ArticleFilter, ArticleSortOrder } from "@/lib/core";

import { getFeedBatchQueryKey } from "@/app/dashboard/services";
import {
  type FeedBatchSource,
  normalizeFeedBatchSources,
} from "@/app/dashboard/services/feed-data/batch";
import {
  isFreshFeedBatchQuery,
  resolveFeedBatchStaleTime,
} from "@/app/dashboard/services/feed-loader-state";
import { type FeedFetchOptions } from "@/app/dashboard/services/selection";

/**
 * Describes the feed batch request context.
 */
export interface FeedBatchRequestContext {
  articleFilter: ArticleFilter;
  articleSortOrder: ArticleSortOrder;
  batchQueryStaleTime: number;
  isBackground: boolean;
  keepExistingFeed: boolean;
  knownLastFetchedAtByUrl: Map<string, Date> | undefined;
  normalizedSources: FeedBatchSource[];
  options: FeedFetchOptions | undefined;
  queryKey: ReturnType<typeof getFeedBatchQueryKey>;
  requestId: number;
  requestSignature: string;
  skippedDuplicate: boolean;
  usePlaceholderData: boolean;
}

/**
 * Describes the feed batch request helpers.
 */
export interface FeedBatchRequestHelpers {
  buildRequestSignature: (
    normalizedSources: FeedBatchSource[],
    articleLimit?: FeedFetchOptions["articleLimit"],
    searchTerm?: FeedFetchOptions["searchTerm"],
    articleSortOrder?: FeedFetchOptions["articleSortOrder"],
  ) => string;
  getKnownLastFetchedAtByUrl: (
    normalizedSources: FeedBatchSource[],
    keepExistingFeed: boolean,
    searchTerm?: FeedFetchOptions["searchTerm"],
  ) => Map<string, Date> | undefined;
}

/**
 * Request flags used to decide whether a feed-batch fetch is ambient work or a
 * foreground refresh.
 */
interface BackgroundFeedBatchRequestOptions {
  /** Whether the request asks the server to bypass cached batch payloads. */
  forceRefresh: boolean;
  /** Whether the visible article list should remain mounted during the fetch. */
  keepExistingFeed: boolean;
  /** User or system action that initiated the feed-batch request. */
  requestSource: FeedFetchOptions["requestSource"] | undefined;
}

/**
 * Describes the options for feed batch request query state.
 */
interface FeedBatchRequestQueryStateOptions {
  articleFilter: ArticleFilter;
  articleSortOrder: ArticleSortOrder;
  keepExistingFeed: boolean;
  normalizedSources: FeedBatchSource[];
  options?: FeedFetchOptions;
  requestHelpers: FeedBatchRequestHelpers;
}

/**
 * Describes the options for prepare feed batch request context.
 */
interface PrepareFeedBatchRequestContextOptions {
  articleFilter: ArticleFilter;
  articleSortOrder: ArticleSortOrder;
  options?: FeedFetchOptions;
  queryClient: QueryClient;
  requestHelpers: FeedBatchRequestHelpers;
  requestState: ReturnType<typeof useFeedBatchRequestState>;
  sources: FeedBatchSource[];
  usePlaceholderData: boolean;
}

/**
 * Process the clear stale feed before refresh.
 * @param context - The context used to process the clear stale feed before refresh.
 * @param queryClient - The query client.
 * @param setFeed - The set feed.
 */
export function clearStaleFeedBeforeRefresh(
  context: FeedBatchRequestContext,
  queryClient: QueryClient,
  setFeed: React.Dispatch<React.SetStateAction<import("@/lib/core").Article[]>>,
) {
  // Filter-change requests must never clear the feed before the server responds.
  // The existing articles remain visible (client-side filter applied immediately)
  // while the server fetch completes in the background.
  if (
    context.skippedDuplicate ||
    context.options?.keepExistingFeed ||
    context.options?.requestSource === "article-filter-change"
  ) {
    return;
  }

  if (
    !isFreshFeedBatchQuery(
      queryClient,
      context.queryKey,
      context.batchQueryStaleTime,
    )
  ) {
    setFeed([]);
  }
}

/**
 * Process the finish feed batch request.
 * @param requestState - The request state.
 * @param logRefreshDiagnostics - Callback that logs batch-refresh diagnostic timing data.
 * @param requestId - The request id.
 */
export function finishFeedBatchRequest(
  requestState: ReturnType<typeof useFeedBatchRequestState>,
  logRefreshDiagnostics: (
    event: string,
    details: Record<string, unknown>,
  ) => void,
  requestId: number,
) {
  if (!requestState.isCurrentFeedRequest(requestId)) {
    return;
  }

  requestState.finishFeedRequest(requestId);
  logRefreshDiagnostics("refresh:finished", { requestId });
}

/**
 * Process the load feed batch results or return null.
 * @param context - The context used to process the load feed batch results or return null.
 * @param loadBatchResults - Callback that processes and stores the resolved batch feed results.
 * @param logRefreshDiagnostics - Callback that logs batch-refresh diagnostic timing data.
 * @returns The load feed batch results or return null.
 */
export async function loadFeedBatchResultsOrReturnNull(
  context: FeedBatchRequestContext,
  loadBatchResults: ReturnType<typeof useFeedBatchQuery>["loadBatchResults"],
  logRefreshDiagnostics: (
    event: string,
    details: Record<string, unknown>,
  ) => void,
) {
  if (context.skippedDuplicate) {
    return null;
  }

  if (context.normalizedSources.length === 0) {
    logRefreshDiagnostics("refresh:empty-source-list", {
      requestId: context.requestId,
    });
    return [];
  }

  const batchResults = await loadBatchResults(
    context.normalizedSources,
    context.queryKey,
    {
      ...context.options,
      articleFilter: context.articleFilter,
      articleLimit: context.options?.articleLimit,
      articleSortOrder: context.articleSortOrder,
      knownLastFetchedAtByUrl: context.knownLastFetchedAtByUrl,
      searchTerm: context.options?.searchTerm,
    },
    context.isBackground,
  );

  if (batchResults === null) {
    logRefreshDiagnostics("refresh:no-results", {
      requestId: context.requestId,
    });
  }

  return batchResults;
}
/**
 * Process the log feed batch start.
 * @param logRefreshDiagnostics - Callback that logs batch-refresh diagnostic timing data.
 * @param context - The context used to process the log feed batch start.
 * @param sourceCount - The source count value.
 * @param options - The options used to process the log feed batch start.
 */
export function logFeedBatchStart(
  logRefreshDiagnostics: (
    event: string,
    details: Record<string, unknown>,
  ) => void,
  context: FeedBatchRequestContext,
  sourceCount: number,
  options?: FeedFetchOptions,
) {
  if (context.skippedDuplicate) {
    logRefreshDiagnostics("refresh:skipped-duplicate", {
      requestId: context.requestId,
      requestSignature: context.requestSignature,
    });
    return;
  }

  logRefreshDiagnostics("refresh:start", {
    articleFilter: context.articleFilter,
    forceRefresh: options?.forceRefresh === true,
    requestId: context.requestId,
    requestSource: options?.requestSource ?? "unspecified",
    skipRefresh: options?.skipRefresh ?? context.usePlaceholderData,
    sourceCount,
  });
}

/**
 * Process the log stale feed batch request.
 * @param logRefreshDiagnostics - Callback that logs batch-refresh diagnostic timing data.
 * @param requestId - The request id.
 * @param batchResults - The batch results.
 */
export function logStaleFeedBatchRequest(
  logRefreshDiagnostics: (
    event: string,
    details: Record<string, unknown>,
  ) => void,
  requestId: number,
  batchResults:
    | Awaited<
        ReturnType<ReturnType<typeof useFeedBatchQuery>["loadBatchResults"]>
      >
    | undefined,
) {
  if (batchResults === null || batchResults === undefined) {
    return;
  }

  logRefreshDiagnostics("refresh:stale-request", { requestId });
}
/**
 * Process the prepare feed batch request context.
 * @param options - The options used to process the prepare feed batch request context.
 * @param contextOptions - The request options, helpers, and current request state for the batch fetch.
 * @returns The prepare feed batch request context.
 */
export function prepareFeedBatchRequestContext(
  contextOptions: PrepareFeedBatchRequestContextOptions,
): FeedBatchRequestContext | null {
  const {
    articleFilter,
    articleSortOrder,
    options: requestOptions,
    queryClient: _queryClient,
    requestHelpers,
    requestState,
    sources,
    usePlaceholderData,
  } = contextOptions;
  const keepExistingFeed = requestOptions?.keepExistingFeed === true;
  const forceRefresh = requestOptions?.forceRefresh === true;
  const isBackground = isBackgroundFeedBatchRequest({
    forceRefresh,
    keepExistingFeed,
    requestSource: requestOptions?.requestSource,
  });
  if (isBackground && requestState.isLoadingRequest()) {
    return null;
  }

  const normalizedSources = normalizeFeedBatchSources(sources);
  const queryState = buildFeedBatchRequestQueryState({
    articleFilter,
    articleSortOrder,
    keepExistingFeed,
    normalizedSources,
    options: requestOptions,
    requestHelpers,
  });
  const requestInfo = requestState.beginFeedRequest({
    forceRefresh,
    isBackground,
    queryKey: queryState.queryKey,
    requestSignature: queryState.requestSignature,
  });

  return {
    articleFilter,
    articleSortOrder,
    batchQueryStaleTime: resolveFeedBatchStaleTime(requestOptions),
    isBackground,
    keepExistingFeed,
    knownLastFetchedAtByUrl: queryState.knownLastFetchedAtByUrl,
    normalizedSources,
    options: requestOptions,
    queryKey: queryState.queryKey,
    requestId: requestInfo.requestId,
    requestSignature: queryState.requestSignature,
    skippedDuplicate: requestInfo.skippedDuplicate,
    usePlaceholderData,
  };
}

/**
 * Build the feed batch request query state.
 * @param options - The options used to build the feed batch request query state.
 * @returns The feed batch request query state.
 */
function buildFeedBatchRequestQueryState(
  options: FeedBatchRequestQueryStateOptions,
) {
  const requestSignature = options.requestHelpers.buildRequestSignature(
    options.normalizedSources,
    options.options?.articleLimit,
    options.options?.searchTerm,
    options.articleSortOrder,
  );
  const knownLastFetchedAtByUrl =
    options.requestHelpers.getKnownLastFetchedAtByUrl(
      options.normalizedSources,
      options.keepExistingFeed,
      options.options?.searchTerm,
    );

  return {
    knownLastFetchedAtByUrl,
    queryKey: getFeedBatchQueryKey(requestSignature, {
      articleFilter: options.articleFilter,
      articleLimit: options.options?.articleLimit,
      articleSortOrder: options.articleSortOrder,
      knownLastFetchedAtByUrl,
      searchTerm: options.options?.searchTerm,
      skipRefresh: options.options?.skipRefresh,
    }),
    requestSignature,
  };
}

/**
 * Return whether a feed-batch request should preserve the visible feed while
 * running silently in the background.
 *
 * Most forced requests are foreground work because users explicitly asked for a
 * refresh and should see loading or error feedback. Automatic refresh is the
 * exception: it must force the server past stale in-memory batch data, but it
 * still runs as ambient maintenance and should not clear the current article
 * list or show foreground failure toasts.
 * @param options - Request ownership flags derived from the feed fetch options.
 * @returns Whether the request should use the background loading channel.
 */
function isBackgroundFeedBatchRequest(
  options: BackgroundFeedBatchRequestOptions,
): boolean {
  if (!options.keepExistingFeed) {
    return false;
  }

  return options.requestSource === "auto-refresh" || !options.forceRefresh;
}
