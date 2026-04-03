"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { type CategoryTreeNode } from "@/lib";

import { ALL_FEEDS_NODE_KEY } from "../../constants";
import {
  resolveArticleWindowAvailability,
  shouldBlockArticleWindowLoadMore,
  shouldRefillDepletedUnreadWindow,
} from "../../services/article-window-availability";
import {
  type FeedFetchOptions,
  type FeedSelectionFetchers,
  refreshCurrentSelection,
} from "../../services/selection";

interface DashboardArticleWindowState {
  articleWindowLimit: number | undefined;
  handleLoadMoreArticles: () => void;
  hasMoreServerArticles: boolean;
  isLoadingMoreArticles: boolean;
  pendingLoadMoreArticleCount: number;
  requestedArticleLimit: number;
}

interface UseDashboardArticleWindowOptions extends FeedSelectionFetchers {
  articleFilter: string;
  articlesPerPage: number;
  currentFeedLength: number;
  currentFilteredFeedLength: number;
  isCategoriesLoading: boolean;
  isLoading: boolean;
  prefetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
  prefetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
  prefetchFeed: FeedSelectionFetchers["fetchFeed"];
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  shouldUseArticleWindow: boolean;
  usePlaceholderData: boolean;
}

const SERVER_LOAD_MORE_PAGE_BATCH = 1;

/**
 * Owns the live article-window size, load-more requests, and unread-window refills.
 *
 * The dashboard controller consumes this hook as the single authority for
 * server-backed feed pagination so the controller can remain focused on wiring
 * together surface state instead of manually coordinating many pagination refs.
 */
export function useDashboardArticleWindow({
  articleFilter,
  articlesPerPage,
  currentFeedLength,
  currentFilteredFeedLength,
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  isCategoriesLoading,
  isLoading,
  prefetchAllFeeds,
  prefetchCategoryFeeds,
  prefetchFeed,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
  shouldUseArticleWindow,
  usePlaceholderData,
}: UseDashboardArticleWindowOptions): DashboardArticleWindowState {
  const [requestedArticleLimit, setRequestedArticleLimit] = useState(articlesPerPage);
  const [isLoadingMoreArticles, setIsLoadingMoreArticles] = useState(false);
  const [hasMoreServerArticles, setHasMoreServerArticles] = useState(
    shouldUseArticleWindow,
  );
  const isLoadingMoreArticlesRef = useRef(false);
  const isAwaitingArticleWindowSettlementRef = useRef(shouldUseArticleWindow);
  const allowPartialArticleWindowGrowthRef = useRef(false);
  const previousAwaitedFeedLengthRef = useRef(0);
  const hasStartedArticleWindowSettlementRef = useRef(false);
  const isRefillingDepletedUnreadWindowRef = useRef(false);
  const lastPrefetchedLimitRef = useRef(0);

  /**
   * Prefetches the next article page for the active dashboard selection.
   *
   * The prefetch mirrors the exact selection semantics of the subsequent live
   * request so a threshold-triggered load-more can reuse a warm TanStack query.
   */
  const prefetchNextPageForCurrentSelection = useCallback(
    async (nextLimit: number) => {
      if (usePlaceholderData) {
        return;
      }

      const prefetchOptions: FeedFetchOptions = {
        articleLimit: nextLimit,
        keepExistingFeed: true,
        requestSource: "feed-scroll-load-more",
        skipRefresh: true,
      };

      if (selectedCategory === ALL_FEEDS_NODE_KEY) {
        await prefetchAllFeeds(undefined, prefetchOptions);
        return;
      }

      if (selectedFeedUrl) {
        await prefetchFeed(selectedFeedUrl, prefetchOptions);
        return;
      }

      if (selectedCategoryNode) {
        await prefetchCategoryFeeds(selectedCategoryNode, prefetchOptions);
      }
    },
    [
      prefetchAllFeeds,
      prefetchCategoryFeeds,
      prefetchFeed,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
      usePlaceholderData,
    ],
  );

  useEffect(() => {
    isLoadingMoreArticlesRef.current = false;
    isAwaitingArticleWindowSettlementRef.current = shouldUseArticleWindow;
    allowPartialArticleWindowGrowthRef.current = false;
    previousAwaitedFeedLengthRef.current = 0;
    hasStartedArticleWindowSettlementRef.current = false;
    isRefillingDepletedUnreadWindowRef.current = false;
    lastPrefetchedLimitRef.current = 0;
    setIsLoadingMoreArticles(false);
    setRequestedArticleLimit(articlesPerPage);
    setHasMoreServerArticles(shouldUseArticleWindow);
  }, [articleFilter, articlesPerPage, selectedCategory, shouldUseArticleWindow]);

  useEffect(() => {
    if (shouldUseArticleWindow && isLoading) {
      isAwaitingArticleWindowSettlementRef.current = true;
      hasStartedArticleWindowSettlementRef.current = true;
    }
  }, [isLoading, shouldUseArticleWindow]);

  useEffect(() => {
    const nextAvailability = resolveArticleWindowAvailability({
      allowPartialFeedGrowth: allowPartialArticleWindowGrowthRef.current,
      currentFeedLength,
      hasStartedAwaitedWindowSettlement:
        hasStartedArticleWindowSettlementRef.current,
      isAwaitingWindowSettlement:
        isAwaitingArticleWindowSettlementRef.current,
      isLoading,
      previousFeedLength: previousAwaitedFeedLengthRef.current,
      previousHasMoreServerArticles: hasMoreServerArticles,
      requestedArticleLimit,
      shouldUseArticleWindow,
    });

    if (nextAvailability.shouldClearAwaitingWindowSettlement) {
      isAwaitingArticleWindowSettlementRef.current = false;
      allowPartialArticleWindowGrowthRef.current = false;
      hasStartedArticleWindowSettlementRef.current = false;
    }

    if (!shouldUseArticleWindow) {
      isLoadingMoreArticlesRef.current = false;
      setIsLoadingMoreArticles(false);
    }

    if (nextAvailability.hasMoreServerArticles !== hasMoreServerArticles) {
      setHasMoreServerArticles(nextAvailability.hasMoreServerArticles);
    }

    if (
      isLoadingMoreArticlesRef.current &&
      !isLoading &&
      !isAwaitingArticleWindowSettlementRef.current
    ) {
      isLoadingMoreArticlesRef.current = false;
      setIsLoadingMoreArticles(false);
    }
  }, [
    currentFeedLength,
    hasMoreServerArticles,
    isLoading,
    requestedArticleLimit,
    shouldUseArticleWindow,
  ]);

  const articleWindowLimit = shouldUseArticleWindow
    ? requestedArticleLimit
    : undefined;

  /**
   * Requests the next server page while keeping the current article window mounted.
   *
   * The double animation-frame deferral preserves the loading-row commit before
   * a warm cache can synchronously resolve and collapse the transient loading UI.
   */
  const handleLoadMoreArticles = useCallback(() => {
    if (
      shouldBlockArticleWindowLoadMore({
        currentFeedLength,
        hasMoreServerArticles,
        isCategoriesLoading,
        isLoadingMoreArticles: isLoadingMoreArticlesRef.current,
        shouldUseArticleWindow,
      })
    ) {
      return;
    }

    const nextArticleLimit =
      requestedArticleLimit + articlesPerPage * SERVER_LOAD_MORE_PAGE_BATCH;
    const nextPrefetchLimit = nextArticleLimit + articlesPerPage;

    isLoadingMoreArticlesRef.current = true;
    isAwaitingArticleWindowSettlementRef.current = true;
    allowPartialArticleWindowGrowthRef.current = true;
    previousAwaitedFeedLengthRef.current = currentFeedLength;
    hasStartedArticleWindowSettlementRef.current = true;
    setIsLoadingMoreArticles(true);
    setRequestedArticleLimit(nextArticleLimit);

    if (lastPrefetchedLimitRef.current < nextPrefetchLimit) {
      lastPrefetchedLimitRef.current = nextPrefetchLimit;
      void prefetchNextPageForCurrentSelection(nextPrefetchLimit);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void refreshCurrentSelection({
          articleLimit: nextArticleLimit,
          fetchAllFeeds,
          fetchCategoryFeeds,
          fetchFeed,
          keepExistingFeed: true,
          requestSource: "feed-scroll-load-more",
          selectedCategory,
          selectedCategoryNode,
          selectedFeedUrl,
          skipRefresh: true,
        })
          .catch(() => {
            setRequestedArticleLimit((currentLimit) =>
              currentLimit === nextArticleLimit
                ? Math.max(
                    articlesPerPage,
                    currentLimit - articlesPerPage * SERVER_LOAD_MORE_PAGE_BATCH,
                  )
                : currentLimit,
            );
          })
          .finally(() => {
            isLoadingMoreArticlesRef.current = false;
            setIsLoadingMoreArticles(false);
          });
      });
    });
  }, [
    articlesPerPage,
    currentFeedLength,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasMoreServerArticles,
    isCategoriesLoading,
    prefetchNextPageForCurrentSelection,
    requestedArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    shouldUseArticleWindow,
  ]);

  useEffect(() => {
    if (!shouldUseArticleWindow || isLoading || !hasMoreServerArticles) {
      return;
    }

    const nextLimit = requestedArticleLimit + articlesPerPage;
    if (lastPrefetchedLimitRef.current >= nextLimit) {
      return;
    }

    lastPrefetchedLimitRef.current = nextLimit;
    void prefetchNextPageForCurrentSelection(nextLimit);
  }, [
    articlesPerPage,
    hasMoreServerArticles,
    isLoading,
    prefetchNextPageForCurrentSelection,
    requestedArticleLimit,
    shouldUseArticleWindow,
  ]);

  useEffect(() => {
    if (
      !shouldRefillDepletedUnreadWindow({
        articleFilter,
        articlesPerPage,
        currentFeedLength,
        currentFilteredFeedLength,
        hasMoreServerArticles,
        isLoading,
        isRefillingDepletedUnreadWindow:
          isRefillingDepletedUnreadWindowRef.current,
        shouldUseArticleWindow,
      })
    ) {
      return;
    }

    isRefillingDepletedUnreadWindowRef.current = true;
    isAwaitingArticleWindowSettlementRef.current = true;
    allowPartialArticleWindowGrowthRef.current = true;
    previousAwaitedFeedLengthRef.current = currentFeedLength;
    hasStartedArticleWindowSettlementRef.current = true;

    void refreshCurrentSelection({
      articleLimit: requestedArticleLimit,
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      requestSource: "feed-scroll-load-more",
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
      skipRefresh: true,
    }).finally(() => {
      isRefillingDepletedUnreadWindowRef.current = false;
    });
  }, [
    articleFilter,
    articlesPerPage,
    currentFeedLength,
    currentFilteredFeedLength,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasMoreServerArticles,
    isLoading,
    requestedArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    shouldUseArticleWindow,
  ]);

  const pendingLoadMoreArticleCount =
    shouldUseArticleWindow && isLoadingMoreArticles
      ? Math.max(0, requestedArticleLimit - currentFeedLength)
      : 0;

  return {
    articleWindowLimit,
    handleLoadMoreArticles,
    hasMoreServerArticles,
    isLoadingMoreArticles,
    pendingLoadMoreArticleCount,
    requestedArticleLimit,
  };
}