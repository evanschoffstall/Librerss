"use client";

import type React from "react";

import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useCallback, useRef } from "react";

import type {
  Article,
  ArticleFilter,
  ArticleSortOrder,
  CategoryTreeNode,
} from "@/lib/core";

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

/**
 * Describes the options for feed loader selection state.
 */
interface FeedLoaderSelectionStateOptions {
  categoriesRef: RefObject<CategoryTreeNode[]>;
  fetchFeedBatch: ReturnType<typeof useFeedBatchFetcher>;
  prefetchFeedBatch: ReturnType<typeof useFeedBatchQuery>["prefetchFeedBatch"];
}

/**
 * Describes the options for feed source tree loader.
 */
interface FeedSourceTreeLoaderOptions {
  queryClient: ReturnType<typeof useQueryClient>;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  usePlaceholderData: boolean;
}

/**
 * Describes the options for use feed loader.
 */
interface UseFeedLoaderOptions {
  articleFilter: ArticleFilter;
  articleSortOrder: ArticleSortOrder;
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

/**
 * Manage the feed loader.
 * @param options - The options used to manage the feed loader.
 * @returns The feed loader state and callbacks.
 */
export function useFeedLoader(options: UseFeedLoaderOptions) {
  const {
    articleFilter,
    articleSortOrder,
    categoriesRef,
    feedRef,
    onFeedBatchLoaded,
    onNewArticlesArrived,
    setCategories,
    setExpandedArticleKey,
    setFeed,
    setLoading,
    usePlaceholderData,
  } = options;
  const loaderResources = useFeedLoaderResources({
    articleFilter,
    articleSortOrder,
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
    /**
     * `true` while a background (search-change) fetch is in flight.  Unlike
     * the main `loading` flag, this does not trigger a full shell animation;
     * it is used by the feed list to show article-shell skeletons when the
     * current visible window is empty but a server response may still arrive.
     */
    isBackgroundLoading: loaderResources.requestState.isBackgroundLoading,
    loadFeedSources: loaderResources.loadFeedSources,
    loading: loaderResources.requestState.loading,
    loadingEpoch: loaderResources.requestState.loadingEpoch,
    prefetchAllFeeds: selectionState.prefetchAllFeeds,
    prefetchCategoryFeeds: selectionState.prefetchCategoryFeeds,
    prefetchFeed: selectionState.prefetchFeed,
  };
}

/**
 * Manage the feed batch request helpers.
 * @param articleFilter - The article filter.
 * @param articleSortOrder - The article sort order applied to request signatures.
 * @param lastFetchedAtByUrlRef - The ref that stores the last fetched at by url ref.
 * @returns The feed batch request helpers state and callbacks.
 */
function useFeedBatchRequestHelpers(
  articleFilter: ArticleFilter,
  articleSortOrder: ArticleSortOrder,
  lastFetchedAtByUrlRef: React.RefObject<Map<string, Date>>,
) {
  const buildRequestSignature = useCallback(
    (
      normalizedSources: FeedBatchSource[],
      articleLimit?: FeedFetchOptions["articleLimit"],
      searchTerm?: FeedFetchOptions["searchTerm"],
      overrideArticleSortOrder?: FeedFetchOptions["articleSortOrder"],
    ) => {
      const resolvedSortOrder = overrideArticleSortOrder ?? articleSortOrder;
      return `${articleFilter}:${resolvedSortOrder}:${articleLimit ?? "all-articles"}:${searchTerm?.trim() ?? ""}::${buildBatchRequestSignature(normalizedSources)}`;
    },
    [articleFilter, articleSortOrder],
  );

  const getKnownLastFetchedAtByUrl = useCallback(
    (
      normalizedSources: FeedBatchSource[],
      keepExistingFeed: boolean,
      searchTerm?: FeedFetchOptions["searchTerm"],
    ) => {
      if (!keepExistingFeed || searchTerm?.trim()) {
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
/**
 * Manage the feed loader diagnostics.
 * @returns The feed loader diagnostics state and callbacks.
 */
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

/**
 * Manage the feed loader resources.
 * @param options - The options used to manage the feed loader resources.
 * @returns The feed loader resources state and callbacks.
 */
function useFeedLoaderResources(
  options: Omit<UseFeedLoaderOptions, "categoriesRef">,
) {
  const {
    articleFilter,
    articleSortOrder,
    feedRef,
    onFeedBatchLoaded,
    onNewArticlesArrived,
    setCategories,
    setExpandedArticleKey,
    setFeed,
    setLoading,
    usePlaceholderData,
  } = options;
  const queryClient = useQueryClient();
  const lastFetchedAtByUrlRef = useRef(new Map<string, Date>());
  const requestHelpers = useFeedBatchRequestHelpers(
    articleFilter,
    articleSortOrder,
    lastFetchedAtByUrlRef,
  );
  const requestState = useFeedBatchRequestState({ queryClient, setLoading });
  const logRefreshDiagnostics = useFeedLoaderDiagnostics();
  const { loadBatchResults, prefetchFeedBatch } = useFeedBatchQuery({
    articleFilter,
    articleSortOrder,
    buildRequestSignature: requestHelpers.buildRequestSignature,
    getKnownLastFetchedAtByUrl: requestHelpers.getKnownLastFetchedAtByUrl,
    queryClient,
    usePlaceholderData,
  });

  return {
    fetchFeedBatch: useFeedBatchFetcher({
      articleFilter,
      articleSortOrder,
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
/**
 * Manage the feed loader selection state.
 * @param options - The options used to manage the feed loader selection state.
 * @returns The feed loader selection state state and callbacks.
 */
function useFeedLoaderSelectionState(options: FeedLoaderSelectionStateOptions) {
  const { categoriesRef, fetchFeedBatch, prefetchFeedBatch } = options;
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

/**
 * Manage the feed source tree loader.
 * @param options - The options used to manage the feed source tree loader.
 * @returns The feed source tree loader state and callbacks.
 */
function useFeedSourceTreeLoader(options: FeedSourceTreeLoaderOptions) {
  const { queryClient, setCategories, usePlaceholderData } = options;
  return useCallback(async (): Promise<CategoryTreeNode[]> => {
    const nextCategories = await queryClient.fetchQuery({
      /**
       * Loads the latest feed source tree for the active placeholder mode.
       * @returns The fetched category tree.
       */
      queryFn: () => loadFeedSourceTree(usePlaceholderData),
      queryKey: getFeedSourceTreeQueryKey(usePlaceholderData),
      staleTime: 0,
    });
    setCategories(nextCategories);
    return nextCategories;
  }, [queryClient, setCategories, usePlaceholderData]);
}
