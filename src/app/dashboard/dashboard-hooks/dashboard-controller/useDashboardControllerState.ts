"use client";

import { useRef } from "react";

import type {
  useArticleActions,
  useDashboardState,
} from "@/app/dashboard/dashboard-hooks";
import type { useDashboardArticleWindow } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardArticleWindow";
import type { useDashboardControllerRefreshState } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerCoordinator";
import type {
  useDashboardFeedLoadingState,
  useDashboardViewModelState,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerSections";
import type { useFeedLoader } from "@/app/dashboard/dashboard-hooks/feed-loader";

import { useDashboardArticleCallbacks } from "@/app/dashboard/dashboard-hooks";
import { useDashboardControllerRuntime } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerCoordinator";

/**
 * Describes the options for dashboard runtime setter state.
 */
interface DashboardRuntimeSetterStateOptions {
  dashboardState: ReturnType<typeof useDashboardState>;
  feedLoader: ReturnType<typeof useFeedLoader>;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
}

/**
 * Describes the options for dashboard runtime state.
 */
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
 * Manage the dashboard runtime state.
 * @param options - The options used to manage the dashboard runtime state.
 * @returns The dashboard runtime state and callbacks.
 */
export function useDashboardRuntimeState(
  options: DashboardRuntimeStateOptions,
) {
  const {
    articleActions,
    articleWindowState,
    dashboardState,
    feedLoader,
    loadingState,
    refreshState,
    selectedCategoryNode,
    usePlaceholderData,
    viewModelState,
  } = options;
  const appliedBatchArticleFilterRef = useRef(dashboardState.articleFilter);
  const appliedBatchArticleSortOrderRef = useRef(
    dashboardState.articleSortOrder,
  );
  const appliedBatchSearchTermRef = useRef("");
  const articleCallbacks = useDashboardArticleCallbacks({
    articleFilter: dashboardState.articleFilter,
    articleSortOrder: dashboardState.articleSortOrder,
    capturePreExpandSnapshot: articleActions.capturePreExpandSnapshot,
    /**
     * Process the handle article toggle.
     * @param article - The article.
     */
    handleArticleToggle: (article) => {
      void articleActions.handleArticleToggle(article);
    },
    /**
     * Process the handle expanded swipe read.
     * @param article - The article.
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
    appliedBatchArticleSortOrderRef,
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
 * Build the dashboard runtime data state.
 * @param options - The options used to build the dashboard runtime data state.
 * @returns The dashboard runtime data state.
 */
function buildDashboardRuntimeDataState(
  options: Omit<DashboardRuntimeStateOptions, "refreshState">,
) {
  const {
    articleActions,
    articleWindowState,
    dashboardState,
    feedLoader,
    loadingState,
    selectedCategoryNode,
    usePlaceholderData,
    viewModelState,
  } = options;
  return {
    articleFilter: dashboardState.articleFilter,
    articleSortOrder: dashboardState.articleSortOrder,
    articleWindowLimit: articleWindowState.articleWindowLimit,
    autoRefreshIntervalMinutes: dashboardState.autoRefreshIntervalMinutes,
    cancelPendingArticleStatusMutations:
      articleActions.cancelPendingArticleStatusMutations,
    feed: dashboardState.feed,
    handleMarkArticlesRead: articleActions.handleMarkArticlesRead,
    hasHydratedPersistedPreferences:
      dashboardState.hasHydratedPersistedPreferences,
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
 * Build the dashboard runtime setter state.
 * @param options - The options used to build the dashboard runtime setter state.
 * @returns The dashboard runtime setter state.
 */
function buildDashboardRuntimeSetterState(
  options: DashboardRuntimeSetterStateOptions,
) {
  const { dashboardState, feedLoader, refreshState } = options;
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
     * Process the set show settings modal.
     */
    setShowSettingsModal: () => {
      dashboardState.setShowSettingsModal(true);
    },
  };
}
