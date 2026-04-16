"use client";

import type React from "react";

import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useCallback, useRef } from "react";

import type { Article, ArticleFilter, CategoryTreeNode } from "@/lib/core";

import {
  useFeedBatchFetcher,
  useFeedBatchQuery,
  useFeedBatchRequestState,
  useFeedRequestCancellation,
  useFeedSelectionFetchers,
  useFeedSelectionPrefetchers,
} from "@/app/dashboard/dashboard-hooks/feed-loader";
import { getFeedSourceTreeQueryKey } from "@/app/dashboard/dashboard-services";
import {
  buildBatchRequestSignature,
  FEED_LOADING_FAILSAFE_MS,
  type FeedBatchSource,
} from "@/app/dashboard/dashboard-services/feed-data/batch";
import { loadFeedSourceTree } from "@/app/dashboard/dashboard-services/feed-data/source";
import { type FeedFetchOptions } from "@/app/dashboard/dashboard-services/selection";
import { clientFeedRefreshDiagnosticsEnabled } from "@/lib/config";

interface UseFeedLoaderOptions {
  articleFilter: ArticleFilter;
  categoriesRef: RefObject<CategoryTreeNode[]>;
  feedRef: RefObject<Article[]>;
  onFeedBatchLoaded?: (timestamp: Date) => void;
  onNewArticlesArrived?: (newArticleKeys: ReadonlySet<string>) => void;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setExpandedArticleKey: React.Dispatch<React.SetStateAction<null | string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  usePlaceholderData: boolean;
}

export function useFeedLoader({
  articleFilter,
  categoriesRef,
  feedRef,
  onFeedBatchLoaded,
  onNewArticlesArrived,
  setCategories,
  setExpandedArticleKey,
  setFeed,
  setLoading,
  usePlaceholderData,
}: UseFeedLoaderOptions) {
  const loaderResources = useFeedLoaderResources({
    articleFilter,
    feedRef,
    onFeedBatchLoaded,
    onNewArticlesArrived,
    setCategories,
    setExpandedArticleKey,
    setFeed,
    setLoading,
    usePlaceholderData,
  });
  const selectionState = useFeedLoaderSelectionState({
    categoriesRef,
    fetchFeedBatch: loaderResources.fetchFeedBatch,
    prefetchFeedBatch: loaderResources.prefetchFeedBatch,
  });
  const handleCancelPendingRequest = useFeedRequestCancellation({
    cancelPendingRequest: loaderResources.requestState.cancelPendingRequest,
    logRefreshDiagnostics: loaderResources.logRefreshDiagnostics,
  });

  return {
    cancelPendingRequest: handleCancelPendingRequest,
    FEED_LOADING_FAILSAFE_MS,
    fetchAllFeeds: selectionState.fetchAllFeeds,
    fetchCategoryFeeds: selectionState.fetchCategoryFeeds,
    fetchFeed: selectionState.fetchFeed,
    loadFeedSources: loaderResources.loadFeedSources,
    loading: loaderResources.requestState.loading,
    loadingEpoch: loaderResources.requestState.loadingEpoch,
    prefetchAllFeeds: selectionState.prefetchAllFeeds,
    prefetchCategoryFeeds: selectionState.prefetchCategoryFeeds,
    prefetchFeed: selectionState.prefetchFeed,
  };
}

function useFeedBatchRequestHelpers(
  articleFilter: ArticleFilter,
  lastFetchedAtByUrlRef: React.RefObject<Map<string, Date>>,
) {
  const buildRequestSignature = useCallback(
    (
      normalizedSources: FeedBatchSource[],
      articleLimit?: FeedFetchOptions["articleLimit"],
    ) => {
      return `${articleFilter}:${articleLimit ?? "all-articles"}::${buildBatchRequestSignature(normalizedSources)}`;
    },
    [articleFilter],
  );

  const getKnownLastFetchedAtByUrl = useCallback(
    (normalizedSources: FeedBatchSource[], keepExistingFeed: boolean) => {
      if (!keepExistingFeed) {
        return undefined;
      }

      return new Map(
        normalizedSources
          .map((source) => {
            const lastFetchedAt = lastFetchedAtByUrlRef.current.get(source.url);
            return lastFetchedAt
              ? ([source.url, lastFetchedAt] as const)
              : null;
          })
          .filter((entry): entry is readonly [string, Date] => entry !== null),
      );
    },
    [lastFetchedAtByUrlRef],
  );

  return {
    buildRequestSignature,
    getKnownLastFetchedAtByUrl,
  };
}

function useFeedLoaderDiagnostics() {
  return useCallback((event: string, details: Record<string, unknown>) => {
    if (!clientFeedRefreshDiagnosticsEnabled()) {
      return;
    }

    if (
      process.env.NODE_ENV === "test" &&
      process.env.ENABLE_TEST_LOG_OUTPUT !== "true"
    ) {
      return;
    }

    console.info("[dashboard]", event, details);
  }, []);
}

function useFeedLoaderResources({
  articleFilter,
  feedRef,
  onFeedBatchLoaded,
  onNewArticlesArrived,
  setCategories,
  setExpandedArticleKey,
  setFeed,
  setLoading,
  usePlaceholderData,
}: Omit<UseFeedLoaderOptions, "categoriesRef">) {
  const queryClient = useQueryClient();
  const lastFetchedAtByUrlRef = useRef(new Map<string, Date>());
  const requestHelpers = useFeedBatchRequestHelpers(
    articleFilter,
    lastFetchedAtByUrlRef,
  );
  const requestState = useFeedBatchRequestState({ queryClient, setLoading });
  const logRefreshDiagnostics = useFeedLoaderDiagnostics();
  const { loadBatchResults, prefetchFeedBatch } = useFeedBatchQuery({
    articleFilter,
    buildRequestSignature: requestHelpers.buildRequestSignature,
    getKnownLastFetchedAtByUrl: requestHelpers.getKnownLastFetchedAtByUrl,
    queryClient,
    usePlaceholderData,
  });

  return {
    fetchFeedBatch: useFeedBatchFetcher({
      articleFilter,
      feedRef,
      lastFetchedAtByUrlRef,
      loadBatchResults,
      logRefreshDiagnostics,
      onFeedBatchLoaded,
      onNewArticlesArrived,
      queryClient,
      requestHelpers,
      requestState,
      setExpandedArticleKey,
      setFeed,
      usePlaceholderData,
    }),
    loadFeedSources: useFeedSourceTreeLoader({
      queryClient,
      setCategories,
      usePlaceholderData,
    }),
    logRefreshDiagnostics,
    prefetchFeedBatch,
    requestState,
  };
}

function useFeedLoaderSelectionState({
  categoriesRef,
  fetchFeedBatch,
  prefetchFeedBatch,
}: {
  categoriesRef: RefObject<CategoryTreeNode[]>;
  fetchFeedBatch: ReturnType<typeof useFeedBatchFetcher>;
  prefetchFeedBatch: ReturnType<typeof useFeedBatchQuery>["prefetchFeedBatch"];
}) {
  const selectionFetchers = useFeedSelectionFetchers({
    categoriesRef,
    fetchFeedBatch,
  });
  const selectionPrefetchers = useFeedSelectionPrefetchers({
    categoriesRef,
    prefetchFeedBatch,
  });

  return {
    ...selectionFetchers,
    ...selectionPrefetchers,
  };
}

function useFeedSourceTreeLoader({
  queryClient,
  setCategories,
  usePlaceholderData,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  usePlaceholderData: boolean;
}) {
  return useCallback(async (): Promise<CategoryTreeNode[]> => {
    const nextCategories = await queryClient.fetchQuery({
      queryFn: () => loadFeedSourceTree(usePlaceholderData),
      queryKey: getFeedSourceTreeQueryKey(usePlaceholderData),
      staleTime: 0,
    });
    setCategories(nextCategories);
    return nextCategories;
  }, [queryClient, setCategories, usePlaceholderData]);
}
