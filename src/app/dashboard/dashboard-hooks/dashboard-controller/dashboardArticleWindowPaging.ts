"use client";

import type { CategoryTreeNode } from "@/lib/core";

import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";
import {
  type FeedFetchOptions,
  type FeedSelectionFetchers,
  refreshCurrentSelection,
} from "@/app/dashboard/dashboard-services/selection";

interface DashboardArticleWindowHelperOptions {
  prefetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
  prefetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
  prefetchFeed: FeedSelectionFetchers["fetchFeed"];
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  usePlaceholderData: boolean;
}

interface DashboardArticleWindowRefillOptions extends FeedSelectionFetchers {
  allowPartialArticleWindowGrowthRef: React.RefObject<boolean>;
  articleLimit: number;
  currentFeedLength: number;
  hasStartedArticleWindowSettlementRef: React.RefObject<boolean>;
  isAwaitingArticleWindowSettlementRef: React.RefObject<boolean>;
  isRefillingDepletedUnreadWindowRef: React.RefObject<boolean>;
  previousAwaitedFeedLengthRef: React.RefObject<number>;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
}

interface DashboardArticleWindowRefreshOptions extends FeedSelectionFetchers {
  articleLimit: number;
  articlesPerPage: number;
  isLoadingMoreArticlesRef: React.RefObject<boolean>;
  nextArticleLimit: number;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  setIsLoadingMoreArticles: React.Dispatch<React.SetStateAction<boolean>>;
  setRequestedArticleLimit: React.Dispatch<React.SetStateAction<number>>;
}

interface DashboardArticleWindowResetState {
  allowPartialArticleWindowGrowthRef: React.RefObject<boolean>;
  hasStartedArticleWindowSettlementRef: React.RefObject<boolean>;
  isAwaitingArticleWindowSettlementRef: React.RefObject<boolean>;
  isLoadingMoreArticlesRef: React.RefObject<boolean>;
  isRefillingDepletedUnreadWindowRef: React.RefObject<boolean>;
  previousAwaitedFeedLengthRef: React.RefObject<number>;
  setHasMoreServerArticles: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoadingMoreArticles: React.Dispatch<React.SetStateAction<boolean>>;
  setRequestedArticleLimit: React.Dispatch<React.SetStateAction<number>>;
}

export function getDashboardArticleWindowCounts(options: {
  currentFeedLength: number;
  isLoadingMoreArticles: boolean;
  requestedArticleLimit: number;
  shouldUseArticleWindow: boolean;
}) {
  return {
    articleWindowLimit: options.shouldUseArticleWindow
      ? options.requestedArticleLimit
      : undefined,
    pendingLoadMoreArticleCount:
      options.shouldUseArticleWindow && options.isLoadingMoreArticles
        ? Math.max(0, options.requestedArticleLimit - options.currentFeedLength)
        : 0,
  };
}

export async function prefetchNextPageForCurrentSelection(
  nextLimit: number,
  options: DashboardArticleWindowHelperOptions,
): Promise<void> {
  const {
    prefetchAllFeeds,
    prefetchCategoryFeeds,
    prefetchFeed,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    usePlaceholderData,
  } = options;

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
}

export function refillDashboardArticleWindow(
  options: DashboardArticleWindowRefillOptions,
): void {
  const {
    allowPartialArticleWindowGrowthRef,
    articleLimit,
    currentFeedLength,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isRefillingDepletedUnreadWindowRef,
    previousAwaitedFeedLengthRef,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
  } = options;

  isRefillingDepletedUnreadWindowRef.current = true;
  isAwaitingArticleWindowSettlementRef.current = true;
  allowPartialArticleWindowGrowthRef.current = true;
  previousAwaitedFeedLengthRef.current = currentFeedLength;
  hasStartedArticleWindowSettlementRef.current = true;

  void refreshCurrentSelection({
    articleLimit,
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
}

export function resetDashboardArticleWindowState(
  state: DashboardArticleWindowResetState,
  options: {
    articlesPerPage: number;
    shouldUseArticleWindow: boolean;
  },
): void {
  const {
    allowPartialArticleWindowGrowthRef,
    hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef,
    isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef,
    previousAwaitedFeedLengthRef,
    setHasMoreServerArticles,
    setIsLoadingMoreArticles,
    setRequestedArticleLimit,
  } = state;

  isLoadingMoreArticlesRef.current = false;
  isAwaitingArticleWindowSettlementRef.current = options.shouldUseArticleWindow;
  allowPartialArticleWindowGrowthRef.current = false;
  previousAwaitedFeedLengthRef.current = 0;
  hasStartedArticleWindowSettlementRef.current = false;
  isRefillingDepletedUnreadWindowRef.current = false;
  setIsLoadingMoreArticles(false);
  setRequestedArticleLimit(options.articlesPerPage);
  setHasMoreServerArticles(options.shouldUseArticleWindow);
}

export function scheduleDashboardArticleWindowRefresh(
  options: DashboardArticleWindowRefreshOptions,
): void {
  const {
    articleLimit,
    articlesPerPage,
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
  } = options;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void refreshCurrentSelection({
        articleLimit,
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
              ? Math.max(articlesPerPage, currentLimit - articlesPerPage)
              : currentLimit,
          );
        })
        .finally(() => {
          isLoadingMoreArticlesRef.current = false;
          setIsLoadingMoreArticles(false);
        });
    });
  });
}
