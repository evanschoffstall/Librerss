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

export function useDashboardFeedLoadingState({
  articleFilter,
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
  const deferredArticleFilter = useDeferredValue(articleFilter);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const isFeedListInitialLoading = loading && feedLength === 0;
  // Shell loading clears only when BOTH the article list AND the category tree
  // have finished their initial load so all three skeleton surfaces resolve together.
  const isShellInitialLoading = isFeedListInitialLoading || isCategoriesLoading;

  return {
    deferredArticleFilter,
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

export function useDashboardViewModelState({
  categoryTree,
  collapsedArticles,
  dashboardState,
  loadingState,
}: {
  categoryTree: ReturnType<typeof useDashboardCategoryTree>;
  collapsedArticles: ReturnType<typeof useArticleActions>["collapsingArticles"];
  dashboardState: ReturnType<typeof useDashboardState>;
  loadingState: ReturnType<typeof useDashboardFeedLoadingState>;
}) {
  const dashboardViewModel = useMemo(
    () =>
      buildDashboardViewModel({
        articleFilter: loadingState.deferredArticleFilter,
        categories: dashboardState.categories,
        collapsingArticleKeys: Object.keys(collapsedArticles),
        customCategoryLabels: categoryTree.customCategoryLabels,
        expandedArticleKey: dashboardState.expandedArticleKey,
        feed: dashboardState.feed,
        orderedCategoryLabels: categoryTree.orderedCategoryLabels,
        searchTerm: loadingState.deferredSearchTerm,
        selectedCategory: dashboardState.selectedCategory,
      }),
    [
      categoryTree.customCategoryLabels,
      categoryTree.orderedCategoryLabels,
      collapsedArticles,
      dashboardState.categories,
      dashboardState.expandedArticleKey,
      dashboardState.feed,
      dashboardState.selectedCategory,
      loadingState.deferredArticleFilter,
      loadingState.deferredSearchTerm,
    ],
  );

  return {
    dashboardViewModel,
    selectedCategoryNode: dashboardViewModel.selectedCategoryNode,
  };
}

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
