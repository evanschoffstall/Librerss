"use client";

import { useRef } from "react";

import {
  useArticleActions,
  useDashboardArticleCallbacks,
  useDashboardState,
} from "@/app/dashboard/dashboard-hooks";
import { useDashboardArticleWindow } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardArticleWindow";
import {
  useDashboardControllerRefreshState,
  useDashboardControllerRuntime,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerCoordinator";
import {
  useDashboardFeedLoadingState,
  useDashboardViewModelState,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerSections";
import { useFeedLoader } from "@/app/dashboard/dashboard-hooks/feed-loader";

interface DashboardRuntimeStateOptions {
  articleActions: ReturnType<typeof useArticleActions>;
  articleWindowState: ReturnType<typeof useDashboardArticleWindow>;
  dashboardState: ReturnType<typeof useDashboardState>;
  feedLoader: ReturnType<typeof useFeedLoader>;
  loadingState: ReturnType<typeof useDashboardFeedLoadingState>;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  selectedCategoryNode: ReturnType<
    typeof useDashboardViewModelState
  >["selectedCategoryNode"];
  usePlaceholderData: boolean;
  viewModelState: ReturnType<typeof useDashboardViewModelState>;
}

/**
 * @param root0
 * @param root0.articleActions
 * @param root0.articleWindowState
 * @param root0.dashboardState
 * @param root0.feedLoader
 * @param root0.loadingState
 * @param root0.refreshState
 * @param root0.selectedCategoryNode
 * @param root0.usePlaceholderData
 * @param root0.viewModelState
 */
export function useDashboardRuntimeState({
  articleActions,
  articleWindowState,
  dashboardState,
  feedLoader,
  loadingState,
  refreshState,
  selectedCategoryNode,
  usePlaceholderData,
  viewModelState,
}: DashboardRuntimeStateOptions) {
  const appliedBatchArticleFilterRef = useRef(dashboardState.articleFilter);
  const appliedBatchSearchTermRef = useRef(
    loadingState.deferredSearchTerm.trim(),
  );
  const articleCallbacks = useDashboardArticleCallbacks({
    articleFilter: dashboardState.articleFilter,
    capturePreExpandSnapshot: articleActions.capturePreExpandSnapshot,
    /**
     * @param article
     */
    handleArticleToggle: (article) => {
      void articleActions.handleArticleToggle(article);
    },
    /**
     * @param article
     */
    handleExpandedSwipeRead: (article) => {
      void articleActions.handleExpandedSwipeRead(article);
    },
    handleSwipeRead: articleActions.handleSwipeRead,
    handleToggleReadState: articleActions.handleToggleReadState,
    handleToggleStarredState: articleActions.handleToggleStarredState,
    selectedCategory: dashboardState.selectedCategory,
  });
  const runtime = useDashboardControllerRuntime({
    appliedBatchArticleFilterRef,
    appliedBatchSearchTermRef,
    ...buildDashboardRuntimeDataState({
      articleActions,
      articleWindowState,
      dashboardState,
      feedLoader,
      loadingState,
      selectedCategoryNode,
      usePlaceholderData,
      viewModelState,
    }),
    ...buildDashboardRuntimeSetterState({
      dashboardState,
      feedLoader,
      refreshState,
    }),
  });

  return {
    articleCallbacks,
    runtime,
  };
}

/**
 * @param root0
 * @param root0.articleActions
 * @param root0.articleWindowState
 * @param root0.dashboardState
 * @param root0.feedLoader
 * @param root0.loadingState
 * @param root0.selectedCategoryNode
 * @param root0.usePlaceholderData
 * @param root0.viewModelState
 */
function buildDashboardRuntimeDataState({
  articleActions,
  articleWindowState,
  dashboardState,
  feedLoader,
  loadingState,
  selectedCategoryNode,
  usePlaceholderData,
  viewModelState,
}: Omit<DashboardRuntimeStateOptions, "refreshState">) {
  return {
    articleFilter: dashboardState.articleFilter,
    articleWindowLimit: articleWindowState.articleWindowLimit,
    autoRefreshIntervalMinutes: dashboardState.autoRefreshIntervalMinutes,
    feed: dashboardState.feed,
    handleMarkArticlesRead: articleActions.handleMarkArticlesRead,
    hasInitializedDashboardRef: dashboardState.hasInitializedDashboardRef,
    isSearchPending: loadingState.isSearchPending,
    isShellLoading: loadingState.isShellLoading,
    loading: dashboardState.loading,
    loadingEpoch: feedLoader.loadingEpoch,
    searchTerm: loadingState.deferredSearchTerm,
    selectedCategory: dashboardState.selectedCategory,
    selectedCategoryNode,
    selectedFeed: viewModelState.dashboardViewModel.selectedFeed,
    selectedFeedUrl: viewModelState.dashboardViewModel.selectedFeedUrl,
    selectionArticleLimit: dashboardState.articlesPerPage,
    timeoutMs: feedLoader.FEED_LOADING_FAILSAFE_MS,
    usePlaceholderData,
  };
}

/**
 * @param root0
 * @param root0.dashboardState
 * @param root0.feedLoader
 * @param root0.refreshState
 */
function buildDashboardRuntimeSetterState({
  dashboardState,
  feedLoader,
  refreshState,
}: {
  dashboardState: ReturnType<typeof useDashboardState>;
  feedLoader: ReturnType<typeof useFeedLoader>;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
}) {
  return {
    cancelPendingRequest: feedLoader.cancelPendingRequest,
    fetchAllFeeds: feedLoader.fetchAllFeeds,
    fetchCategoryFeeds: feedLoader.fetchCategoryFeeds,
    fetchFeed: feedLoader.fetchFeed,
    loadFeedSources: feedLoader.loadFeedSources,
    prefetchAllFeeds: feedLoader.prefetchAllFeeds,
    prefetchCategoryFeeds: feedLoader.prefetchCategoryFeeds,
    prefetchFeed: feedLoader.prefetchFeed,
    setFeed: dashboardState.setFeed,
    setIsCategoriesLoading: dashboardState.setIsCategoriesLoading,
    setIsMobileSidebarOpen: dashboardState.setIsMobileSidebarOpen,
    setIsSidebarVisible: dashboardState.setIsSidebarVisible,
    setLoading: dashboardState.setLoading,
    setRelativeRefreshTick: refreshState.setRelativeRefreshTick,
    setSearchTerm: dashboardState.setSearchTerm,
    setSelectedCategory: dashboardState.setSelectedCategory,
    /**
     *
     */
    setShowSettingsModal: () => {
      dashboardState.setShowSettingsModal(true);
    },
  };
}
