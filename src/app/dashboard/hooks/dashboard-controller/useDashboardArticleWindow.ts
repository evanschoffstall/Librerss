"use client";

import { useRef, useState } from "react";

import { getDashboardArticleWindowCounts } from "@/app/dashboard/hooks/dashboard-controller/dashboardArticleWindowPaging";
import {
  type DashboardArticleWindowState,
  type UseDashboardArticleWindowOptions,
} from "@/app/dashboard/hooks/dashboard-controller/useDashboardArticleWindow.types";
import {
  useArticleWindowAvailability,
  useResetArticleWindowOnSelectionChange,
  useUnreadWindowRefill,
} from "@/app/dashboard/hooks/dashboard-controller/useDashboardArticleWindowEffects";
import { useDashboardArticleWindowLoadMore } from "@/app/dashboard/hooks/dashboard-controller/useDashboardArticleWindowLoadMore";
import {
  useDashboardArticleWindowLoadingState,
  useDashboardArticleWindowPrefetch,
} from "@/app/dashboard/hooks/dashboard-controller/useDashboardArticleWindowPrefetch";

/**
 * Describes the options for dashboard article window availability.
 */
type DashboardArticleWindowAvailabilityOptions = Pick<
  DashboardArticleWindowLifecycleOptions,
  | "articleFilter"
  | "articleSortOrder"
  | "articlesPerPage"
  | "articleWindowState"
  | "currentFeedLength"
  | "currentFilteredFeedLength"
  | "isLoading"
  | "selectedCategory"
  | "shouldUseArticleWindow"
>;

/**
 * Describes the options for dashboard article window availability resolution lifecycle.
 */
interface DashboardArticleWindowAvailabilityResolutionLifecycleOptions {
  articleFilter: string;
  articlesPerPage: number;
  currentFeedLength: number;
  currentFilteredFeedLength: number;
  isLoading: boolean;
  lifecycleState: ReturnType<typeof getDashboardArticleWindowAvailabilityState>;
  shouldUseArticleWindow: boolean;
}

/**
 * Describes the options for dashboard article window controls.
 */
interface DashboardArticleWindowControlsOptions {
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>;
  options: UseDashboardArticleWindowOptions;
}

/**
 * Describes the options for dashboard article window lifecycle.
 */
interface DashboardArticleWindowLifecycleOptions {
  articleFilter: UseDashboardArticleWindowOptions["articleFilter"];
  articleSortOrder: UseDashboardArticleWindowOptions["articleSortOrder"];
  articlesPerPage: UseDashboardArticleWindowOptions["articlesPerPage"];
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>;
  currentFeedLength: UseDashboardArticleWindowOptions["currentFeedLength"];
  currentFilteredFeedLength: UseDashboardArticleWindowOptions["currentFilteredFeedLength"];
  fetchAllFeeds: UseDashboardArticleWindowOptions["fetchAllFeeds"];
  fetchCategoryFeeds: UseDashboardArticleWindowOptions["fetchCategoryFeeds"];
  fetchFeed: UseDashboardArticleWindowOptions["fetchFeed"];
  isLoading: UseDashboardArticleWindowOptions["isLoading"];
  selectedCategory: UseDashboardArticleWindowOptions["selectedCategory"];
  selectedCategoryNode?: UseDashboardArticleWindowOptions["selectedCategoryNode"];
  selectedFeedUrl?: UseDashboardArticleWindowOptions["selectedFeedUrl"];
  shouldUseArticleWindow: UseDashboardArticleWindowOptions["shouldUseArticleWindow"];
  usePlaceholderData: UseDashboardArticleWindowOptions["usePlaceholderData"];
}

/**
 * Describes the options for dashboard article window selection reset lifecycle.
 */
interface DashboardArticleWindowSelectionResetLifecycleOptions {
  articleFilter: string;
  articleSortOrder: UseDashboardArticleWindowOptions["articleSortOrder"];
  articlesPerPage: number;
  isLoading: boolean;
  lifecycleState: ReturnType<typeof getDashboardArticleWindowAvailabilityState>;
  selectedCategory: string;
  shouldUseArticleWindow: boolean;
}

/**
 * Manage the dashboard article window.
 * @param options - The options used to manage the dashboard article window.
 * @returns The dashboard article window state and callbacks.
 */
export function useDashboardArticleWindow(
  options: UseDashboardArticleWindowOptions,
): DashboardArticleWindowState {
  const articleWindowState = useDashboardArticleWindowState({
    articlesPerPage: options.articlesPerPage,
    shouldUseArticleWindow: options.shouldUseArticleWindow,
  });
  useDashboardArticleWindowLifecycle({ ...options, articleWindowState });
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

/**
 * Return the dashboard article window availability state.
 * @param articleWindowState - The article window state.
 * @returns The dashboard article window availability state.
 */
function getDashboardArticleWindowAvailabilityState(
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>,
) {
  return {
    allowPartialGrowthRef:
      articleWindowState.allowPartialArticleWindowGrowthRef,
    hasMoreServerArticles: articleWindowState.hasMoreServerArticles,
    hasStartedSettlementRef:
      articleWindowState.hasStartedArticleWindowSettlementRef,
    inFlightPrefetchedLimitRef: articleWindowState.inFlightPrefetchedLimitRef,
    isAwaitingSettlementRef:
      articleWindowState.isAwaitingArticleWindowSettlementRef,
    isLoadingMoreArticles: articleWindowState.isLoadingMoreArticles,
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

/**
 * Return the dashboard article window control counts.
 * @param articleWindowState - The article window state.
 * @param options - The options used to return the dashboard article window control counts.
 * @returns The dashboard article window control counts.
 */
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
/**
 * Manage the dashboard article window availability lifecycle.
 * @param options - The options used to manage the dashboard article window availability lifecycle.
 */
function useDashboardArticleWindowAvailabilityLifecycle(
  options: DashboardArticleWindowAvailabilityOptions,
) {
  const {
    articleFilter,
    articleSortOrder,
    articlesPerPage,
    articleWindowState,
    currentFeedLength,
    currentFilteredFeedLength,
    isLoading,
    selectedCategory,
    shouldUseArticleWindow,
  } = options;
  const lifecycleState =
    getDashboardArticleWindowAvailabilityState(articleWindowState);

  useDashboardArticleWindowSelectionResetLifecycle({
    articleFilter,
    articleSortOrder,
    articlesPerPage,
    isLoading,
    lifecycleState,
    selectedCategory,
    shouldUseArticleWindow,
  });
  useDashboardArticleWindowAvailabilityResolutionLifecycle({
    articleFilter,
    articlesPerPage,
    currentFeedLength,
    currentFilteredFeedLength,
    isLoading,
    lifecycleState,
    shouldUseArticleWindow,
  });
}

/**
 * Manage the availability resolver hook for the dashboard article window.
 * @param options - The shared availability inputs for article-window resolution.
 */
function useDashboardArticleWindowAvailabilityResolutionLifecycle(
  options: DashboardArticleWindowAvailabilityResolutionLifecycleOptions,
) {
  useArticleWindowAvailability({
    allowPartialArticleWindowGrowthRef:
      options.lifecycleState.allowPartialGrowthRef,
    articlesPerPage: options.articlesPerPage,
    currentFeedLength: options.currentFeedLength,
    currentFilteredFeedLength: options.currentFilteredFeedLength,
    hasMoreServerArticles: options.lifecycleState.hasMoreServerArticles,
    hasStartedArticleWindowSettlementRef:
      options.lifecycleState.hasStartedSettlementRef,
    isAwaitingArticleWindowSettlementRef:
      options.lifecycleState.isAwaitingSettlementRef,
    isLoading: options.isLoading,
    isLoadingMoreArticles: options.lifecycleState.isLoadingMoreArticles,
    isLoadingMoreArticlesRef: options.lifecycleState.isLoadingMoreArticlesRef,
    preservePartialFilteredWindowAvailability:
      options.articleFilter === "unread",
    previousAwaitedFeedLengthRef:
      options.lifecycleState.previousAwaitedFeedLengthRef,
    requestedArticleLimit: options.lifecycleState.requestedArticleLimit,
    setHasMoreServerArticles: options.lifecycleState.setHasMoreServerArticles,
    setIsLoadingMoreArticles: options.lifecycleState.setIsLoadingMoreArticles,
    shouldUseArticleWindow: options.shouldUseArticleWindow,
  });
}

/**
 * Manage the dashboard article window controls.
 * @param options - The options used to manage the dashboard article window controls.
 * @param controlOptions - The control state and callbacks used to manage article window pagination.
 * @returns The dashboard article window controls state and callbacks.
 */
function useDashboardArticleWindowControls(
  controlOptions: DashboardArticleWindowControlsOptions,
) {
  const { articleWindowState, options } = controlOptions;
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

/**
 * Manage the dashboard article window lifecycle.
 * @param options - The options used to manage the dashboard article window lifecycle.
 */
function useDashboardArticleWindowLifecycle(
  options: DashboardArticleWindowLifecycleOptions,
) {
  const {
    articleFilter,
    articleSortOrder,
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
    usePlaceholderData,
  } = options;
  useDashboardArticleWindowAvailabilityLifecycle({
    articleFilter,
    articleSortOrder,
    articlesPerPage,
    articleWindowState,
    currentFeedLength,
    currentFilteredFeedLength,
    isLoading,
    selectedCategory,
    shouldUseArticleWindow,
  });
  useDashboardArticleWindowUnreadRefillLifecycle({
    articleFilter,
    articleSortOrder,
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
    usePlaceholderData,
  });
}

/**
 * Manage the dashboard article window load more control.
 * @param articleWindowState - The article window state.
 * @param options - The options used to manage the dashboard article window load more control.
 * @param prefetchNextPage - Callback that triggers prefetching of the next article page.
 * @returns The dashboard article window load more control state and callbacks.
 */
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

/**
 * Manage the dashboard article window next page prefetch.
 * @param articleWindowState - The article window state.
 * @param options - The options used to manage the dashboard article window next page prefetch.
 * @returns The dashboard article window next page prefetch state and callbacks.
 */
function useDashboardArticleWindowNextPagePrefetch(
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>,
  options: UseDashboardArticleWindowOptions,
) {
  return useDashboardArticleWindowPrefetch({
    articlesPerPage: options.articlesPerPage,
    hasMoreServerArticles: articleWindowState.hasMoreServerArticles,
    inFlightPrefetchedLimitRef: articleWindowState.inFlightPrefetchedLimitRef,
    isLoading: options.isLoading,
    isLoadingMoreArticlesRef: articleWindowState.isLoadingMoreArticlesRef,
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

/**
 * Manage the selection-reset and loading-state hooks that prepare article
 * window availability resolution.
 * @param options - The shared article-window lifecycle options for reset and loading state.
 */
function useDashboardArticleWindowSelectionResetLifecycle(
  options: DashboardArticleWindowSelectionResetLifecycleOptions,
) {
  useResetArticleWindowOnSelectionChange({
    allowPartialArticleWindowGrowthRef:
      options.lifecycleState.allowPartialGrowthRef,
    articleFilter: options.articleFilter,
    articleSortOrder: options.articleSortOrder,
    articlesPerPage: options.articlesPerPage,
    hasStartedArticleWindowSettlementRef:
      options.lifecycleState.hasStartedSettlementRef,
    inFlightPrefetchedLimitRef:
      options.lifecycleState.inFlightPrefetchedLimitRef,
    isAwaitingArticleWindowSettlementRef:
      options.lifecycleState.isAwaitingSettlementRef,
    isLoadingMoreArticlesRef: options.lifecycleState.isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef:
      options.lifecycleState.isRefillingDepletedUnreadWindowRef,
    lastPrefetchedLimitRef: options.lifecycleState.lastPrefetchedLimitRef,
    previousAwaitedFeedLengthRef:
      options.lifecycleState.previousAwaitedFeedLengthRef,
    selectedCategory: options.selectedCategory,
    setHasMoreServerArticles: options.lifecycleState.setHasMoreServerArticles,
    setIsLoadingMoreArticles: options.lifecycleState.setIsLoadingMoreArticles,
    setRequestedArticleLimit: options.lifecycleState.setRequestedArticleLimit,
    shouldUseArticleWindow: options.shouldUseArticleWindow,
  });
  useDashboardArticleWindowLoadingState({
    hasStartedArticleWindowSettlementRef:
      options.lifecycleState.hasStartedSettlementRef,
    isAwaitingArticleWindowSettlementRef:
      options.lifecycleState.isAwaitingSettlementRef,
    isLoading: options.isLoading,
    shouldUseArticleWindow: options.shouldUseArticleWindow,
  });
}

/**
 * Manage the dashboard article window state.
 * @param options - The options used to manage the dashboard article window state.
 * @returns The dashboard article window state and callbacks.
 */
function useDashboardArticleWindowState(
  options: Pick<
    UseDashboardArticleWindowOptions,
    "articlesPerPage" | "shouldUseArticleWindow"
  >,
) {
  const { articlesPerPage, shouldUseArticleWindow } = options;
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

/**
 * Manage the dashboard article window unread refill lifecycle.
 * @param options - The options used to manage the dashboard article window unread refill lifecycle.
 */
function useDashboardArticleWindowUnreadRefillLifecycle(
  options: DashboardArticleWindowLifecycleOptions,
) {
  const {
    articleFilter,
    articleSortOrder,
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
  } = options;
  useUnreadWindowRefill({
    allowPartialArticleWindowGrowthRef:
      articleWindowState.allowPartialArticleWindowGrowthRef,
    articleFilter,
    articleSortOrder,
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
    isLoadingMoreArticles: articleWindowState.isLoadingMoreArticles,
    isLoadingMoreArticlesRef: articleWindowState.isLoadingMoreArticlesRef,
    isRefillingDepletedUnreadWindowRef:
      articleWindowState.isRefillingDepletedUnreadWindowRef,
    previousAwaitedFeedLengthRef:
      articleWindowState.previousAwaitedFeedLengthRef,
    requestedArticleLimit: articleWindowState.requestedArticleLimit,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    setIsLoadingMoreArticles: articleWindowState.setIsLoadingMoreArticles,
    setRequestedArticleLimit: articleWindowState.setRequestedArticleLimit,
    shouldUseArticleWindow,
  });
}
