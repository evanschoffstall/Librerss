"use client";

import { useRef, useState } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import { getDashboardArticleWindowCounts } from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardArticleWindowPaging";
import {
  useArticleWindowAvailability,
  useResetArticleWindowOnSelectionChange,
  useUnreadWindowRefill,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardArticleWindowEffects";
import { useDashboardArticleWindowLoadMore } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardArticleWindowLoadMore";
import {
  useDashboardArticleWindowLoadingState,
  useDashboardArticleWindowPrefetch,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardArticleWindowPrefetch";
import { type FeedSelectionFetchers } from "@/app/dashboard/dashboard-services/selection";

type DashboardArticleWindowAvailabilityOptions = Pick<
  DashboardArticleWindowLifecycleOptions,
  | "articleFilter"
  | "articlesPerPage"
  | "articleWindowState"
  | "currentFeedLength"
  | "isLoading"
  | "selectedCategory"
  | "shouldUseArticleWindow"
>;

interface DashboardArticleWindowLifecycleOptions {
  articleFilter: UseDashboardArticleWindowOptions["articleFilter"];
  articlesPerPage: UseDashboardArticleWindowOptions["articlesPerPage"];
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>;
  currentFeedLength: UseDashboardArticleWindowOptions["currentFeedLength"];
  currentFilteredFeedLength: UseDashboardArticleWindowOptions["currentFilteredFeedLength"];
  fetchAllFeeds: UseDashboardArticleWindowOptions["fetchAllFeeds"];
  fetchCategoryFeeds: UseDashboardArticleWindowOptions["fetchCategoryFeeds"];
  fetchFeed: UseDashboardArticleWindowOptions["fetchFeed"];
  isLoading: UseDashboardArticleWindowOptions["isLoading"];
  selectedCategory: UseDashboardArticleWindowOptions["selectedCategory"];
  selectedCategoryNode: UseDashboardArticleWindowOptions["selectedCategoryNode"];
  selectedFeedUrl: UseDashboardArticleWindowOptions["selectedFeedUrl"];
  shouldUseArticleWindow: UseDashboardArticleWindowOptions["shouldUseArticleWindow"];
}

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

/**
 * Owns the live article-window size, load-more requests, and unread-window refills.
 *
 * The dashboard controller consumes this hook as the single authority for
 * server-backed feed pagination so the controller can remain focused on wiring
 * together surface state instead of manually coordinating many pagination refs.
 */
export function useDashboardArticleWindow(
  options: UseDashboardArticleWindowOptions,
): DashboardArticleWindowState {
  const articleWindowState = useDashboardArticleWindowState({
    articlesPerPage: options.articlesPerPage,
    shouldUseArticleWindow: options.shouldUseArticleWindow,
  });
  useDashboardArticleWindowLifecycle({
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    articleWindowState,
    currentFeedLength: options.currentFeedLength,
    currentFilteredFeedLength: options.currentFilteredFeedLength,
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    isLoading: options.isLoading,
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    shouldUseArticleWindow: options.shouldUseArticleWindow,
  });
  const controls = useDashboardArticleWindowControls({
    articleWindowState,
    options,
  });

  return {
    articleWindowLimit: controls.articleWindowLimit,
    handleLoadMoreArticles: controls.handleLoadMoreArticles,
    hasMoreServerArticles: articleWindowState.hasMoreServerArticles,
    isLoadingMoreArticles: articleWindowState.isLoadingMoreArticles,
    pendingLoadMoreArticleCount: controls.pendingLoadMoreArticleCount,
    requestedArticleLimit: articleWindowState.requestedArticleLimit,
  };
}

function getDashboardArticleWindowAvailabilityState(
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>,
) {
  return {
    allowPartialGrowthRef:
      articleWindowState.allowPartialArticleWindowGrowthRef,
    hasMoreServerArticles: articleWindowState.hasMoreServerArticles,
    hasStartedSettlementRef:
      articleWindowState.hasStartedArticleWindowSettlementRef,
    inFlightPrefetchedLimitRef:
      articleWindowState.inFlightPrefetchedLimitRef,
    isAwaitingSettlementRef:
      articleWindowState.isAwaitingArticleWindowSettlementRef,
    isLoadingMoreArticlesRef: articleWindowState.isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef:
      articleWindowState.isRefillingDepletedUnreadWindowRef,
    lastPrefetchedLimitRef: articleWindowState.lastPrefetchedLimitRef,
    previousAwaitedFeedLengthRef:
      articleWindowState.previousAwaitedFeedLengthRef,
    requestedArticleLimit: articleWindowState.requestedArticleLimit,
    setHasMoreServerArticles: articleWindowState.setHasMoreServerArticles,
    setIsLoadingMoreArticles: articleWindowState.setIsLoadingMoreArticles,
    setRequestedArticleLimit: articleWindowState.setRequestedArticleLimit,
  };
}

function getDashboardArticleWindowControlCounts(
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>,
  options: UseDashboardArticleWindowOptions,
) {
  return getDashboardArticleWindowCounts({
    currentFeedLength: options.currentFeedLength,
    isLoadingMoreArticles: articleWindowState.isLoadingMoreArticles,
    requestedArticleLimit: articleWindowState.requestedArticleLimit,
    shouldUseArticleWindow: options.shouldUseArticleWindow,
  });
}

function useDashboardArticleWindowAvailabilityLifecycle({
  articleFilter,
  articlesPerPage,
  articleWindowState,
  currentFeedLength,
  isLoading,
  selectedCategory,
  shouldUseArticleWindow,
}: DashboardArticleWindowAvailabilityOptions) {
  const lifecycleState =
    getDashboardArticleWindowAvailabilityState(articleWindowState);

  useResetArticleWindowOnSelectionChange({
    allowPartialArticleWindowGrowthRef: lifecycleState.allowPartialGrowthRef,
    articleFilter,
    articlesPerPage,
    hasStartedArticleWindowSettlementRef:
      lifecycleState.hasStartedSettlementRef,
    inFlightPrefetchedLimitRef: lifecycleState.inFlightPrefetchedLimitRef,
    isAwaitingArticleWindowSettlementRef:
      lifecycleState.isAwaitingSettlementRef,
    isLoadingMoreArticlesRef: lifecycleState.isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef:
      lifecycleState.isRefillingDepletedUnreadWindowRef,
    lastPrefetchedLimitRef: lifecycleState.lastPrefetchedLimitRef,
    previousAwaitedFeedLengthRef: lifecycleState.previousAwaitedFeedLengthRef,
    selectedCategory,
    setHasMoreServerArticles: lifecycleState.setHasMoreServerArticles,
    setIsLoadingMoreArticles: lifecycleState.setIsLoadingMoreArticles,
    setRequestedArticleLimit: lifecycleState.setRequestedArticleLimit,
    shouldUseArticleWindow,
  });
  useDashboardArticleWindowLoadingState({
    hasStartedArticleWindowSettlementRef:
      lifecycleState.hasStartedSettlementRef,
    isAwaitingArticleWindowSettlementRef:
      lifecycleState.isAwaitingSettlementRef,
    isLoading,
    shouldUseArticleWindow,
  });
  useArticleWindowAvailability({
    allowPartialArticleWindowGrowthRef: lifecycleState.allowPartialGrowthRef,
    currentFeedLength,
    hasMoreServerArticles: lifecycleState.hasMoreServerArticles,
    hasStartedArticleWindowSettlementRef:
      lifecycleState.hasStartedSettlementRef,
    isAwaitingArticleWindowSettlementRef:
      lifecycleState.isAwaitingSettlementRef,
    isLoading,
    isLoadingMoreArticlesRef: lifecycleState.isLoadingMoreArticlesRef,
    previousAwaitedFeedLengthRef: lifecycleState.previousAwaitedFeedLengthRef,
    requestedArticleLimit: lifecycleState.requestedArticleLimit,
    setHasMoreServerArticles: lifecycleState.setHasMoreServerArticles,
    setIsLoadingMoreArticles: lifecycleState.setIsLoadingMoreArticles,
    shouldUseArticleWindow,
  });
}

function useDashboardArticleWindowControls({
  articleWindowState,
  options,
}: {
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>;
  options: UseDashboardArticleWindowOptions;
}) {
  const prefetchNextPage = useDashboardArticleWindowNextPagePrefetch(
    articleWindowState,
    options,
  );
  const counts = getDashboardArticleWindowControlCounts(
    articleWindowState,
    options,
  );
  const handleLoadMoreArticles = useDashboardArticleWindowLoadMoreControl(
    articleWindowState,
    options,
    prefetchNextPage,
  );

  return {
    articleWindowLimit: counts.articleWindowLimit,
    handleLoadMoreArticles,
    pendingLoadMoreArticleCount: counts.pendingLoadMoreArticleCount,
  };
}

function useDashboardArticleWindowLifecycle({
  articleFilter,
  articlesPerPage,
  articleWindowState,
  currentFeedLength,
  currentFilteredFeedLength,
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  isLoading,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
  shouldUseArticleWindow,
}: DashboardArticleWindowLifecycleOptions) {
  useDashboardArticleWindowAvailabilityLifecycle({
    articleFilter,
    articlesPerPage,
    articleWindowState,
    currentFeedLength,
    isLoading,
    selectedCategory,
    shouldUseArticleWindow,
  });
  useDashboardArticleWindowUnreadRefillLifecycle({
    articleFilter,
    articlesPerPage,
    articleWindowState,
    currentFeedLength,
    currentFilteredFeedLength,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    isLoading,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    shouldUseArticleWindow,
  });
}

function useDashboardArticleWindowLoadMoreControl(
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>,
  options: UseDashboardArticleWindowOptions,
  prefetchNextPage: (nextLimit: number) => Promise<void>,
) {
  return useDashboardArticleWindowLoadMore({
    allowPartialArticleWindowGrowthRef:
      articleWindowState.allowPartialArticleWindowGrowthRef,
    articlesPerPage: options.articlesPerPage,
    currentFeedLength: options.currentFeedLength,
    fetchAllFeeds: options.fetchAllFeeds,
    fetchCategoryFeeds: options.fetchCategoryFeeds,
    fetchFeed: options.fetchFeed,
    hasMoreServerArticles: articleWindowState.hasMoreServerArticles,
    hasStartedArticleWindowSettlementRef:
      articleWindowState.hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef:
      articleWindowState.isAwaitingArticleWindowSettlementRef,
    isCategoriesLoading: options.isCategoriesLoading,
    isLoadingMoreArticlesRef: articleWindowState.isLoadingMoreArticlesRef,
    lastPrefetchedLimitRef: articleWindowState.lastPrefetchedLimitRef,
    prefetchNextPage,
    previousAwaitedFeedLengthRef:
      articleWindowState.previousAwaitedFeedLengthRef,
    requestedArticleLimit: articleWindowState.requestedArticleLimit,
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    setIsLoadingMoreArticles: articleWindowState.setIsLoadingMoreArticles,
    setRequestedArticleLimit: articleWindowState.setRequestedArticleLimit,
    shouldUseArticleWindow: options.shouldUseArticleWindow,
  });
}

function useDashboardArticleWindowNextPagePrefetch(
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>,
  options: UseDashboardArticleWindowOptions,
) {
  return useDashboardArticleWindowPrefetch({
    articlesPerPage: options.articlesPerPage,
    hasMoreServerArticles: articleWindowState.hasMoreServerArticles,
    inFlightPrefetchedLimitRef: articleWindowState.inFlightPrefetchedLimitRef,
    isLoading: options.isLoading,
    lastPrefetchedLimitRef: articleWindowState.lastPrefetchedLimitRef,
    prefetchAllFeeds: options.prefetchAllFeeds,
    prefetchCategoryFeeds: options.prefetchCategoryFeeds,
    prefetchFeed: options.prefetchFeed,
    requestedArticleLimit: articleWindowState.requestedArticleLimit,
    selectedCategory: options.selectedCategory,
    selectedCategoryNode: options.selectedCategoryNode,
    selectedFeedUrl: options.selectedFeedUrl,
    shouldUseArticleWindow: options.shouldUseArticleWindow,
    usePlaceholderData: options.usePlaceholderData,
  });
}

function useDashboardArticleWindowState({
  articlesPerPage,
  shouldUseArticleWindow,
}: Pick<
  UseDashboardArticleWindowOptions,
  "articlesPerPage" | "shouldUseArticleWindow"
>) {
  const [requestedArticleLimit, setRequestedArticleLimit] =
    useState(articlesPerPage);
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
  const inFlightPrefetchedLimitRef = useRef(0);
  const lastPrefetchedLimitRef = useRef(0);

  return {
    allowPartialArticleWindowGrowthRef,
    hasMoreServerArticles,
    hasStartedArticleWindowSettlementRef,
    inFlightPrefetchedLimitRef,
    isAwaitingArticleWindowSettlementRef,
    isLoadingMoreArticles,
    isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef,
    lastPrefetchedLimitRef,
    previousAwaitedFeedLengthRef,
    requestedArticleLimit,
    setHasMoreServerArticles,
    setIsLoadingMoreArticles,
    setRequestedArticleLimit,
  };
}

function useDashboardArticleWindowUnreadRefillLifecycle({
  articleFilter,
  articlesPerPage,
  articleWindowState,
  currentFeedLength,
  currentFilteredFeedLength,
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  isLoading,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
  shouldUseArticleWindow,
}: DashboardArticleWindowLifecycleOptions) {
  useUnreadWindowRefill({
    allowPartialArticleWindowGrowthRef:
      articleWindowState.allowPartialArticleWindowGrowthRef,
    articleFilter,
    articlesPerPage,
    currentFeedLength,
    currentFilteredFeedLength,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasMoreServerArticles: articleWindowState.hasMoreServerArticles,
    hasStartedArticleWindowSettlementRef:
      articleWindowState.hasStartedArticleWindowSettlementRef,
    isAwaitingArticleWindowSettlementRef:
      articleWindowState.isAwaitingArticleWindowSettlementRef,
    isLoading,
    isRefillingDepletedUnreadWindowRef:
      articleWindowState.isRefillingDepletedUnreadWindowRef,
    previousAwaitedFeedLengthRef:
      articleWindowState.previousAwaitedFeedLengthRef,
    requestedArticleLimit: articleWindowState.requestedArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    shouldUseArticleWindow,
  });
}
