"use client";

import type { QueryClient } from "@tanstack/react-query";

import type { ArticleFilter } from "@/lib/core";

import { useFeedBatchQuery } from "@/app/dashboard/dashboard-hooks/feed-loader/useFeedBatchQuery";
import { useFeedBatchRequestState } from "@/app/dashboard/dashboard-hooks/feed-loader/useFeedBatchRequestState";
import { getFeedBatchQueryKey } from "@/app/dashboard/dashboard-services";
import {
  type FeedBatchSource,
  normalizeFeedBatchSources,
} from "@/app/dashboard/dashboard-services/feed-data/batch";
import {
  isFreshFeedBatchQuery,
  resolveFeedBatchStaleTime,
} from "@/app/dashboard/dashboard-services/feed-loader-state";
import { type FeedFetchOptions } from "@/app/dashboard/dashboard-services/selection";

export interface FeedBatchRequestContext {
  articleFilter: ArticleFilter;
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

export interface FeedBatchRequestHelpers {
  buildRequestSignature: (
    normalizedSources: FeedBatchSource[],
    articleLimit?: FeedFetchOptions["articleLimit"],
    searchTerm?: FeedFetchOptions["searchTerm"],
  ) => string;
  getKnownLastFetchedAtByUrl: (
    normalizedSources: FeedBatchSource[],
    keepExistingFeed: boolean,
  ) => Map<string, Date> | undefined;
}

export function clearStaleFeedBeforeRefresh(
  context: FeedBatchRequestContext,
  queryClient: QueryClient,
  setFeed: React.Dispatch<React.SetStateAction<import("@/lib/core").Article[]>>,
) {
  if (context.skippedDuplicate || context.options?.keepExistingFeed) {
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

export function prepareFeedBatchRequestContext({
  articleFilter,
  options,
  queryClient: _queryClient,
  requestHelpers,
  requestState,
  sources,
  usePlaceholderData,
}: {
  articleFilter: ArticleFilter;
  options?: FeedFetchOptions;
  queryClient: QueryClient;
  requestHelpers: FeedBatchRequestHelpers;
  requestState: ReturnType<typeof useFeedBatchRequestState>;
  sources: FeedBatchSource[];
  usePlaceholderData: boolean;
}): FeedBatchRequestContext | null {
  const keepExistingFeed = options?.keepExistingFeed === true;
  const forceRefresh = options?.forceRefresh === true;
  const isBackground = keepExistingFeed && !forceRefresh;
  if (isBackground && requestState.isLoadingRequest()) {
    return null;
  }

  const normalizedSources = normalizeFeedBatchSources(sources);
  const queryState = buildFeedBatchRequestQueryState({
    articleFilter,
    keepExistingFeed,
    normalizedSources,
    options,
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
    batchQueryStaleTime: resolveFeedBatchStaleTime(options),
    isBackground,
    keepExistingFeed,
    knownLastFetchedAtByUrl: queryState.knownLastFetchedAtByUrl,
    normalizedSources,
    options,
    queryKey: queryState.queryKey,
    requestId: requestInfo.requestId,
    requestSignature: queryState.requestSignature,
    skippedDuplicate: requestInfo.skippedDuplicate,
    usePlaceholderData,
  };
}

function buildFeedBatchRequestQueryState(options: {
  articleFilter: ArticleFilter;
  keepExistingFeed: boolean;
  normalizedSources: FeedBatchSource[];
  options?: FeedFetchOptions;
  requestHelpers: FeedBatchRequestHelpers;
}) {
  const requestSignature = options.requestHelpers.buildRequestSignature(
    options.normalizedSources,
    options.options?.articleLimit,
    options.options?.searchTerm,
  );
  const knownLastFetchedAtByUrl =
    options.requestHelpers.getKnownLastFetchedAtByUrl(
      options.normalizedSources,
      options.keepExistingFeed,
    );

  return {
    knownLastFetchedAtByUrl,
    queryKey: getFeedBatchQueryKey(requestSignature, {
      articleFilter: options.articleFilter,
      articleLimit: options.options?.articleLimit,
      knownLastFetchedAtByUrl,
      searchTerm: options.options?.searchTerm,
      skipRefresh: options.options?.skipRefresh,
    }),
    requestSignature,
  };
}
