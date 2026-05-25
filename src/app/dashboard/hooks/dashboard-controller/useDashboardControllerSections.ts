"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";

import type { useDashboardState } from "@/app/dashboard/hooks";
import type { useDashboardControllerRefreshState } from "@/app/dashboard/hooks/dashboard-controller/useDashboardControllerCoordinator";

import {
  useArticleActions,
  useDashboardCategoryTree,
} from "@/app/dashboard/hooks";
import { useDashboardShellLoadingState } from "@/app/dashboard/hooks/dashboard-controller/dashboardControllerViewState";
import { useDashboardArticleWindow } from "@/app/dashboard/hooks/dashboard-controller/useDashboardArticleWindow";
import { useFeedLoader } from "@/app/dashboard/hooks/feed-loader";
import { type ArticleFilter } from "@/app/dashboard/services/article";
import { buildDashboardViewModel } from "@/app/dashboard/services/dashboard-state";
import { useViewportRestore } from "@/lib/hooks";

export { useDashboardControllerRefreshState } from "@/app/dashboard/hooks/dashboard-controller/useDashboardControllerCoordinator";
export { useDashboardControllerOutput } from "@/app/dashboard/hooks/dashboard-controller/useDashboardControllerOutput";
export { useDashboardRuntimeState } from "@/app/dashboard/hooks/dashboard-controller/useDashboardControllerState";

/**
 * Describes the options for dashboard article window state.
 */
interface DashboardArticleWindowStateOptions {
  dashboardState: ReturnType<typeof useDashboardState>;
  feedLoader: ReturnType<typeof useFeedLoader>;
  loadingState: ReturnType<typeof useDashboardFeedLoadingState>;
  selectedCategoryNode: ReturnType<
    typeof useDashboardViewModelState
  >["selectedCategoryNode"];
  selectedFeedUrl: null | string;
  usePlaceholderData: boolean;
  viewModelState: ReturnType<typeof useDashboardViewModelState>;
}
/**
 * Describes the options for dashboard controller resources.
 */
interface DashboardControllerResourcesOptions {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  dashboardState: ReturnType<typeof useDashboardState>;
  distillStrategy: string;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  usePlaceholderData: boolean;
}

/**
 * Describes the options for dashboard feed loader options.
 */
interface DashboardFeedLoaderOptionsOptions {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  dashboardState: ReturnType<typeof useDashboardState>;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  usePlaceholderData: boolean;
}
/**
 * Describes the options for dashboard feed loading state.
 */
interface DashboardFeedLoadingStateOptions {
  articleFilter: ArticleFilter;
  feedLength: number;
  /** Whether the feed source/category tree is still being fetched on first load. */
  isCategoriesLoading: boolean;
  loading: boolean;
  searchTerm: string;
  settleMs: number;
  usePlaceholderData: boolean;
}

/**
 * Describes the options for dashboard view model state.
 */
interface DashboardViewModelStateOptions {
  categoryTree: ReturnType<typeof useDashboardCategoryTree>;
  collapsedArticles: ReturnType<typeof useArticleActions>["collapsingArticles"];
  dashboardState: ReturnType<typeof useDashboardState>;
  usePlaceholderData: boolean;
}
/**
 * Manage the dashboard animating article state.
 * @returns The dashboard animating article state and callbacks.
 */
export function useDashboardAnimatingArticleState() {
  const [animatingInArticleKeys, setAnimatingInArticleKeys] = useState(
    () => new Set<string>(),
  );

  const handleNewArticlesArrived = useCallback(
    (newKeys: ReadonlySet<string>) => {
      if (newKeys.size === 0) return;
      setAnimatingInArticleKeys((prev) => new Set([...prev, ...newKeys]));
    },
    [],
  );

  const handleArticleEnteringDone = useCallback((articleKey: string) => {
    setAnimatingInArticleKeys((prev) => {
      if (!prev.has(articleKey)) return prev;
      const next = new Set(prev);
      next.delete(articleKey);
      return next;
    });
  }, []);

  return {
    animatingInArticleKeys,
    handleArticleEnteringDone,
    handleNewArticlesArrived,
  };
}

/**
 * Manage the dashboard article window state.
 * @param options - The options used to manage the dashboard article window state.
 * @returns The dashboard article window state and callbacks.
 */
export function useDashboardArticleWindowState(
  options: DashboardArticleWindowStateOptions,
) {
  const {
    dashboardState,
    feedLoader,
    loadingState,
    selectedCategoryNode,
    selectedFeedUrl,
    usePlaceholderData,
    viewModelState,
  } = options;
  return useDashboardArticleWindow({
    articleFilter: dashboardState.articleFilter,
    articleSortOrder: dashboardState.articleSortOrder,
    articlesPerPage: dashboardState.articlesPerPage,
    currentFeedLength: dashboardState.feed.length,
    currentFilteredFeedLength:
      viewModelState.dashboardViewModel.filteredFeed.length,
    fetchAllFeeds: feedLoader.fetchAllFeeds,
    fetchCategoryFeeds: feedLoader.fetchCategoryFeeds,
    fetchFeed: feedLoader.fetchFeed,
    isCategoriesLoading: dashboardState.isCategoriesLoading,
    isLoading: dashboardState.loading,
    prefetchAllFeeds: feedLoader.prefetchAllFeeds,
    prefetchCategoryFeeds: feedLoader.prefetchCategoryFeeds,
    prefetchFeed: feedLoader.prefetchFeed,
    selectedCategory: dashboardState.selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl: selectedFeedUrl ?? undefined,
    shouldUseArticleWindow: loadingState.shouldUseArticleWindow,
    usePlaceholderData,
  });
}
/**
 * Manage the dashboard controller resources.
 * @param options - The options used to manage the dashboard controller resources.
 * @returns The dashboard controller resources state and callbacks.
 */
export function useDashboardControllerResources(
  options: DashboardControllerResourcesOptions,
) {
  const {
    animationState,
    dashboardState,
    distillStrategy,
    refreshState,
    usePlaceholderData,
  } = options;
  const feedLoader = useFeedLoader(
    buildDashboardFeedLoaderOptions({
      animationState,
      dashboardState,
      refreshState,
      usePlaceholderData,
    }),
  );
  const categoryTree = useDashboardCategoryTree({
    categories: dashboardState.categories,
    fetchAllFeeds: feedLoader.fetchAllFeeds,
    fetchCategoryFeeds: feedLoader.fetchCategoryFeeds,
    fetchFeed: feedLoader.fetchFeed,
    loadFeedSources: feedLoader.loadFeedSources,
    selectedCategory: dashboardState.selectedCategory,
    setCategories: dashboardState.setCategories,
    setFeed: dashboardState.setFeed,
    setSelectedCategory: dashboardState.setSelectedCategory,
    usePlaceholderData,
  });
  const articleActions = useArticleActions({
    articleFilter: dashboardState.articleFilter,
    categories: dashboardState.categories,
    distillStrategy,
    expandedArticleKey: dashboardState.expandedArticleKey,
    feed: dashboardState.feed,
    setExpandedArticleKey: dashboardState.setExpandedArticleKey,
    setFeed: dashboardState.setFeed,
    usePlaceholderData,
  });
  const { ref: sidebarScrollRef } = useViewportRestore(
    "librerss:scroll:sidebar",
  );

  return {
    articleActions,
    categoryTree,
    feedLoader,
    sidebarScrollRef,
  };
}

/**
 * Manage the dashboard feed loading state.
 * @param options - The options used to manage the dashboard feed loading state.
 * @returns The dashboard feed loading state and callbacks.
 */
export function useDashboardFeedLoadingState(
  options: DashboardFeedLoadingStateOptions,
) {
  const {
    articleFilter: _articleFilter,
    feedLength,
    isCategoriesLoading,
    loading,
    searchTerm,
    settleMs,
  } = options;
  const trimmedSearchTerm = searchTerm.trim();
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const isFeedListInitialLoading = loading && feedLength === 0;
  // Shell loading clears only when BOTH the article list AND the category tree
  // have finished their initial load so all three skeleton surfaces resolve together.
  const isShellInitialLoading = isFeedListInitialLoading || isCategoriesLoading;
  const isShellLoading = useDashboardShellLoadingState(
    isShellInitialLoading,
    settleMs,
  );

  return {
    deferredSearchTerm,
    isFeedListInitialLoading,
    isFeedListRefreshing: loading && !isShellLoading,
    isSearchPending: searchTerm !== deferredSearchTerm,
    isShellLoading,
    shouldUseArticleWindow: trimmedSearchTerm === "",
  };
}
/**
 * Manage the dashboard view model state.
 * @param options - The options used to manage the dashboard view model state.
 * @returns The dashboard view model state and callbacks.
 */
export function useDashboardViewModelState(
  options: DashboardViewModelStateOptions,
) {
  const {
    categoryTree,
    collapsedArticles,
    dashboardState,
    usePlaceholderData,
  } = options;
  const dashboardViewModel = useMemo(
    () =>
      buildDashboardViewModel({
        // Use the live (non-deferred) articleFilter so the O(n) client-side
        // filterArticlesByState pass reflects the newly selected token
        // immediately — without waiting for a deferred React render pass.
        // Deferred filter caused a visible lag and a stale-filter window where
        // newly arrived server data would be filtered by the OLD value.
        articleFilter: dashboardState.articleFilter,
        articleSortOrder: dashboardState.articleSortOrder,
        categories: dashboardState.categories,
        collapsingArticleKeys: Object.keys(collapsedArticles),
        customCategoryLabels: categoryTree.customCategoryLabels,
        expandedArticleKey: dashboardState.expandedArticleKey,
        feed: dashboardState.feed,
        orderedCategoryLabels: categoryTree.orderedCategoryLabels,
        // Use the immediate (non-deferred) search term so the O(n) client-side
        // WeakMap-cached filter reflects every keystroke without a React
        // deferred-transition delay.
        searchTerm: dashboardState.searchTerm,
        selectedCategory: dashboardState.selectedCategory,
        // Always filter client-side so the article list responds instantly.
        // The server search runs in the background (debounced) and merges
        // results into the feed without clearing the visible list.
        useLocalSearch: true,
        usePlaceholderData,
      }),
    [
      categoryTree.customCategoryLabels,
      categoryTree.orderedCategoryLabels,
      collapsedArticles,
      dashboardState.articleFilter,
      dashboardState.categories,
      dashboardState.expandedArticleKey,
      dashboardState.feed,
      dashboardState.articleSortOrder,
      dashboardState.searchTerm,
      dashboardState.selectedCategory,
      usePlaceholderData,
    ],
  );

  return {
    dashboardViewModel,
    selectedCategoryNode: dashboardViewModel.selectedCategoryNode,
  };
}

/**
 * Build the dashboard feed loader options.
 * @param options - The options used to build the dashboard feed loader options.
 * @returns The dashboard feed loader options.
 */
function buildDashboardFeedLoaderOptions(
  options: DashboardFeedLoaderOptionsOptions,
) {
  const { animationState, dashboardState, refreshState, usePlaceholderData } =
    options;
  return {
    articleFilter: dashboardState.articleFilter,
    articleSortOrder: dashboardState.articleSortOrder,
    categoriesRef: dashboardState.categoriesRef,
    feedRef: dashboardState.feedRef,
    onFeedBatchLoaded: refreshState.setLastRefreshedAt,
    onNewArticlesArrived: animationState.handleNewArticlesArrived,
    setCategories: dashboardState.setCategories,
    setExpandedArticleKey: dashboardState.setExpandedArticleKey,
    setFeed: dashboardState.setFeed,
    setLoading: dashboardState.setLoading,
    usePlaceholderData,
  };
}
