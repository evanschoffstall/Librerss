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
  const articleCallbacks = useDashboardArticleCallbacks({
    articleFilter: dashboardState.articleFilter,
    capturePreExpandSnapshot: articleActions.capturePreExpandSnapshot,
    handleArticleToggle: (article) => {
      void articleActions.handleArticleToggle(article);
    },
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
    searchTerm: dashboardState.searchTerm,
    selectedCategory: dashboardState.selectedCategory,
    selectedCategoryNode,
    selectedFeed: viewModelState.dashboardViewModel.selectedFeed,
    selectedFeedUrl: viewModelState.dashboardViewModel.selectedFeedUrl,
    timeoutMs: feedLoader.FEED_LOADING_FAILSAFE_MS,
    usePlaceholderData,
  };
}

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
    setShowSettingsModal: () => {
      dashboardState.setShowSettingsModal(true);
    },
  };
}
