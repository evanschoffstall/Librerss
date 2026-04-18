"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";

import {
  useArticleActions,
  useDashboardCategoryTree,
  useDashboardState,
} from "@/app/dashboard/dashboard-hooks";
import { useDashboardShellLoadingState } from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardControllerViewState";
import { useDashboardArticleWindow } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardArticleWindow";
import { useDashboardControllerRefreshState } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerCoordinator";
import { useFeedLoader } from "@/app/dashboard/dashboard-hooks/feed-loader";
import { type ArticleFilter } from "@/app/dashboard/dashboard-services/article";
import { buildDashboardViewModel } from "@/app/dashboard/dashboard-services/dashboard-state";
import { useViewportRestore } from "@/lib/hooks";

export { useDashboardControllerRefreshState } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerCoordinator";
export { useDashboardControllerOutput } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerOutput";
export { useDashboardRuntimeState } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerState";

/**
 *
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
 * @param root0
 * @param root0.dashboardState
 * @param root0.feedLoader
 * @param root0.loadingState
 * @param root0.selectedCategoryNode
 * @param root0.selectedFeedUrl
 * @param root0.usePlaceholderData
 * @param root0.viewModelState
 */
export function useDashboardArticleWindowState({
  dashboardState,
  feedLoader,
  loadingState,
  selectedCategoryNode,
  selectedFeedUrl,
  usePlaceholderData,
  viewModelState,
}: {
  dashboardState: ReturnType<typeof useDashboardState>;
  feedLoader: ReturnType<typeof useFeedLoader>;
  loadingState: ReturnType<typeof useDashboardFeedLoadingState>;
  selectedCategoryNode: ReturnType<
    typeof useDashboardViewModelState
  >["selectedCategoryNode"];
  selectedFeedUrl: null | string;
  usePlaceholderData: boolean;
  viewModelState: ReturnType<typeof useDashboardViewModelState>;
}) {
  return useDashboardArticleWindow({
    articleFilter: dashboardState.articleFilter,
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
 * @param root0
 * @param root0.animationState
 * @param root0.dashboardState
 * @param root0.distillStrategy
 * @param root0.refreshState
 * @param root0.usePlaceholderData
 */
export function useDashboardControllerResources({
  animationState,
  dashboardState,
  distillStrategy,
  refreshState,
  usePlaceholderData,
}: {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  dashboardState: ReturnType<typeof useDashboardState>;
  distillStrategy: string;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  usePlaceholderData: boolean;
}) {
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
 * @param root0
 * @param root0.articleFilter
 * @param root0.feedLength
 * @param root0.isCategoriesLoading
 * @param root0.loading
 * @param root0.searchTerm
 * @param root0.settleMs
 * @param root0.usePlaceholderData
 */
export function useDashboardFeedLoadingState({
  articleFilter: _articleFilter,
  feedLength,
  isCategoriesLoading,
  loading,
  searchTerm,
  settleMs,
}: {
  articleFilter: ArticleFilter;
  feedLength: number;
  /** Whether the feed source/category tree is still being fetched on first load. */
  isCategoriesLoading: boolean;
  loading: boolean;
  searchTerm: string;
  settleMs: number;
  usePlaceholderData: boolean;
}) {
  const trimmedSearchTerm = searchTerm.trim();
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const isFeedListInitialLoading = loading && feedLength === 0;
  // Shell loading clears only when BOTH the article list AND the category tree
  // have finished their initial load so all three skeleton surfaces resolve together.
  const isShellInitialLoading = isFeedListInitialLoading || isCategoriesLoading;

  return {
    deferredSearchTerm,
    isFeedListInitialLoading,
    isFeedListRefreshing: loading && feedLength > 0,
    isSearchPending: searchTerm !== deferredSearchTerm,
    isShellLoading: useDashboardShellLoadingState(
      isShellInitialLoading,
      settleMs,
    ),
    shouldUseArticleWindow: trimmedSearchTerm === "",
  };
}

/**
 * @param root0
 * @param root0.categoryTree
 * @param root0.collapsedArticles
 * @param root0.dashboardState
 */
export function useDashboardViewModelState({
  categoryTree,
  collapsedArticles,
  dashboardState,
}: {
  categoryTree: ReturnType<typeof useDashboardCategoryTree>;
  collapsedArticles: ReturnType<typeof useArticleActions>["collapsingArticles"];
  dashboardState: ReturnType<typeof useDashboardState>;
}) {
  const dashboardViewModel = useMemo(
    () =>
      buildDashboardViewModel({
        // Use the live (non-deferred) articleFilter so the O(n) client-side
        // filterArticlesByState pass reflects the newly selected token
        // immediately — without waiting for a deferred React render pass.
        // Deferred filter caused a visible lag and a stale-filter window where
        // newly arrived server data would be filtered by the OLD value.
        articleFilter: dashboardState.articleFilter,
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
      }),
    [
      categoryTree.customCategoryLabels,
      categoryTree.orderedCategoryLabels,
      collapsedArticles,
      dashboardState.articleFilter,
      dashboardState.categories,
      dashboardState.expandedArticleKey,
      dashboardState.feed,
      dashboardState.searchTerm,
      dashboardState.selectedCategory,
    ],
  );

  return {
    dashboardViewModel,
    selectedCategoryNode: dashboardViewModel.selectedCategoryNode,
  };
}

/**
 * @param root0
 * @param root0.animationState
 * @param root0.dashboardState
 * @param root0.refreshState
 * @param root0.usePlaceholderData
 */
function buildDashboardFeedLoaderOptions({
  animationState,
  dashboardState,
  refreshState,
  usePlaceholderData,
}: {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  dashboardState: ReturnType<typeof useDashboardState>;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  usePlaceholderData: boolean;
}) {
  return {
    articleFilter: dashboardState.articleFilter,
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
