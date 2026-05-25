"use client";

import type { CategoryTreeNode } from "@/lib/core";

import { scheduleDashboardArticleWindowRefresh } from "@/app/dashboard/hooks/dashboard-controller/dashboardArticleWindowPaging";
import { shouldBlockArticleWindowLoadMore } from "@/app/dashboard/services/article";
import { type FeedSelectionFetchers } from "@/app/dashboard/services/selection";

/**
 * Describes the options for use dashboard article window load more.
 */
interface UseDashboardArticleWindowLoadMoreOptions {
  allowPartialArticleWindowGrowthRef: React.RefObject<boolean>;
  articlesPerPage: number;
  currentFeedLength: number;
  fetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
  fetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
  fetchFeed: FeedSelectionFetchers["fetchFeed"];
  hasMoreServerArticles: boolean;
  hasStartedArticleWindowSettlementRef: React.RefObject<boolean>;
  isAwaitingArticleWindowSettlementRef: React.RefObject<boolean>;
  isCategoriesLoading: boolean;
  isLoadingMoreArticlesRef: React.RefObject<boolean>;
  lastPrefetchedLimitRef: React.RefObject<number>;
  prefetchNextPage: (nextLimit: number) => Promise<void>;
  previousAwaitedFeedLengthRef: React.RefObject<number>;
  requestedArticleLimit: number;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  setIsLoadingMoreArticles: React.Dispatch<React.SetStateAction<boolean>>;
  setRequestedArticleLimit: React.Dispatch<React.SetStateAction<number>>;
  shouldUseArticleWindow: boolean;
}

const SERVER_LOAD_MORE_PAGE_BATCH = 1;

/**
 * Manage the dashboard article window load more.
 * @param options - The options used to manage the dashboard article window load more.
 * @returns The dashboard article window load more state and callbacks.
 */
export function useDashboardArticleWindowLoadMore(
  options: UseDashboardArticleWindowLoadMoreOptions,
) {
  const {
    allowPartialArticleWindowGrowthRef,
    articlesPerPage,
    currentFeedLength,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasMoreServerArticles,
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isCategoriesLoading,
    isLoadingMoreArticlesRef,
    lastPrefetchedLimitRef,
    prefetchNextPage,
    previousAwaitedFeedLengthRef,
    requestedArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    setIsLoadingMoreArticles,
    setRequestedArticleLimit,
    shouldUseArticleWindow,
  } = options;

  return (): boolean | undefined => {
    if (
      shouldBlockArticleWindowLoadMore({
        currentFeedLength,
        hasMoreServerArticles,
        isCategoriesLoading,
        isLoadingMoreArticles: isLoadingMoreArticlesRef.current,
        shouldUseArticleWindow,
      })
    ) {
      return false;
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
      void prefetchNextPage(nextPrefetchLimit);
    }

    scheduleDashboardArticleWindowRefresh({
      articleLimit: nextArticleLimit,
      articlesPerPage: articlesPerPage * SERVER_LOAD_MORE_PAGE_BATCH,
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      isLoadingMoreArticlesRef,
      nextArticleLimit,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
      setIsLoadingMoreArticles,
      setRequestedArticleLimit,
    });

    return true;
  };
}
