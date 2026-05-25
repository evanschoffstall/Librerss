"use client";

import { useCallback, useMemo } from "react";

import type { useDashboardState } from "@/app/dashboard/hooks";
import type { useDashboardArticleWindow } from "@/app/dashboard/hooks/dashboard-controller/useDashboardArticleWindow";
import type { useDashboardControllerRefreshState } from "@/app/dashboard/hooks/dashboard-controller/useDashboardControllerCoordinator";
import type {
  useDashboardAnimatingArticleState,
  useDashboardControllerResources,
  useDashboardFeedLoadingState,
  useDashboardViewModelState,
} from "@/app/dashboard/hooks/dashboard-controller/useDashboardControllerSections";
import type { useDashboardRuntimeState } from "@/app/dashboard/hooks/dashboard-controller/useDashboardControllerState";

import { useDashboardControllerViewState } from "@/app/dashboard/hooks/dashboard-controller/dashboardControllerViewState";
import { type BackgroundMode } from "@/app/dashboard/services/dashboard-constants";
import { buildDashboardSidebarContentProps } from "@/app/dashboard/services/dashboard-state";

/**
 * Describes the options for dashboard controller article view state.
 */
interface DashboardControllerArticleViewStateOptions {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  articleWindowState: ReturnType<typeof useDashboardArticleWindow>;
  controllerResources: ReturnType<typeof useDashboardControllerResources>;
  dashboardState: ReturnType<typeof useDashboardState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  viewModelState: ReturnType<typeof useDashboardViewModelState>;
}

/**
 * Describes the options for dashboard controller chrome state.
 */
interface DashboardControllerChromeStateOptions {
  dashboardState: ReturnType<typeof useDashboardState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  sidebarCategories: ReturnType<
    typeof import("@/app/dashboard/services/dashboard-state/view-model").buildDashboardViewModel
  >["sidebarCategories"];
}
/**
 * Describes the options for dashboard controller layout view state.
 */
interface DashboardControllerLayoutViewStateOptions {
  backgroundMode: BackgroundMode;
  canManageInvitations: boolean;
  controllerResources: ReturnType<typeof useDashboardControllerResources>;
  dashboardState: ReturnType<typeof useDashboardState>;
  loadingState: ReturnType<typeof useDashboardFeedLoadingState>;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  sidebarContentProps: ReturnType<typeof buildDashboardSidebarContentProps>;
  usePlaceholderData: boolean;
}

/**
 * Describes the options for dashboard controller output.
 */
interface DashboardControllerOutputOptions {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  articleWindowState: ReturnType<typeof useDashboardArticleWindow>;
  backgroundMode: BackgroundMode;
  canManageInvitations: boolean;
  controllerResources: ReturnType<typeof useDashboardControllerResources>;
  dashboardState: ReturnType<typeof useDashboardState>;
  distillStrategy: string;
  loadingState: ReturnType<typeof useDashboardFeedLoadingState>;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  usePlaceholderData: boolean;
  viewModelState: ReturnType<typeof useDashboardViewModelState>;
}
/**
 * Describes the options for dashboard sidebar content state.
 */
interface DashboardSidebarContentStateOptions {
  dashboardState: ReturnType<typeof useDashboardState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  sidebarCategories: ReturnType<
    typeof import("@/app/dashboard/services/dashboard-state/view-model").buildDashboardViewModel
  >["sidebarCategories"];
}

/**
 * Manage the dashboard controller output.
 * @param options - The options used to manage the dashboard controller output.
 * @returns The dashboard controller output state and callbacks.
 */
export function useDashboardControllerOutput(
  options: DashboardControllerOutputOptions,
) {
  const {
    animationState,
    articleWindowState,
    backgroundMode,
    canManageInvitations,
    controllerResources,
    dashboardState,
    distillStrategy,
    loadingState,
    onBackgroundModeChange,
    onDistillStrategyChange,
    refreshState,
    runtimeState,
    usePlaceholderData,
    viewModelState,
  } = options;
  const chromeState = useDashboardControllerChromeState({
    dashboardState,
    runtimeState,
    sidebarCategories: viewModelState.dashboardViewModel.sidebarCategories,
  });

  return useDashboardControllerViewState({
    ...buildDashboardControllerArticleViewState({
      animationState,
      articleWindowState,
      controllerResources,
      dashboardState,
      runtimeState,
      viewModelState,
    }),
    ...buildDashboardControllerLayoutViewState({
      backgroundMode,
      canManageInvitations,
      controllerResources,
      dashboardState,
      loadingState,
      onBackgroundModeChange,
      onDistillStrategyChange,
      refreshState,
      sidebarContentProps: chromeState.sidebarContentProps,
      usePlaceholderData,
    }),
    categoryTree: controllerResources.categoryTree,
    distillStrategy,
    handleCloseSettings: chromeState.handleCloseSettings,
  });
}
/**
 * Build the dashboard controller article view state.
 * @param options - The options used to build the dashboard controller article view state.
 * @returns The dashboard controller article view state.
 */
function buildDashboardControllerArticleViewState(
  options: DashboardControllerArticleViewStateOptions,
) {
  const {
    animationState,
    articleWindowState,
    controllerResources,
    dashboardState,
    runtimeState,
    viewModelState,
  } = options;
  return {
    animatingInArticleKeys: animationState.animatingInArticleKeys,
    articleCallbacks: runtimeState.articleCallbacks,
    articleFilter: dashboardState.articleFilter,
    articleSortOrder: dashboardState.articleSortOrder,
    categories: dashboardState.categories,
    collapsingArticles: controllerResources.articleActions.collapsingArticles,
    displayCategories: viewModelState.dashboardViewModel.displayCategories,
    expandedArticleKey: dashboardState.expandedArticleKey,
    filteredFeed: viewModelState.dashboardViewModel.filteredFeed,
    getPreExpandViewportSnapshot:
      controllerResources.articleActions.getPreExpandViewportSnapshot,
    handleArticleEnteringDone: animationState.handleArticleEnteringDone,
    handleLoadMoreArticles: articleWindowState.handleLoadMoreArticles,
    hasMoreServerArticles: articleWindowState.hasMoreServerArticles,
    hydratedArticleLinks:
      controllerResources.articleActions.hydratedArticleLinks,
    hydratingArticleLinks:
      controllerResources.articleActions.hydratingArticleLinks,
    isAutoRefreshing: runtimeState.runtime.isAutoRefreshing,
    isCollapseScrollRestoreActive:
      controllerResources.articleActions.isCollapseScrollRestoreActive,
    isLoadingMoreArticles: articleWindowState.isLoadingMoreArticles,
    /**
     * Forwarded from the feed loader so the feed list can show article-shell
     * skeletons when a background search fetch is in flight and the current
     * locally-filtered window is empty.
     */
    isSearchFetching: controllerResources.feedLoader.isBackgroundLoading,
    loading: dashboardState.loading,
    loadingEpoch: controllerResources.feedLoader.loadingEpoch,
    pendingLoadMoreArticleCount: articleWindowState.pendingLoadMoreArticleCount,
    searchTerm: dashboardState.searchTerm,
    selectedCategory: dashboardState.selectedCategory,
    updatingArticleState:
      controllerResources.articleActions.updatingArticleState,
  };
}

/**
 * Build the dashboard controller layout view state.
 * @param options - The options used to build the dashboard controller layout view state.
 * @returns The dashboard controller layout view state.
 */
function buildDashboardControllerLayoutViewState(
  options: DashboardControllerLayoutViewStateOptions,
) {
  const {
    backgroundMode,
    canManageInvitations,
    controllerResources,
    dashboardState,
    loadingState,
    onBackgroundModeChange,
    onDistillStrategyChange,
    refreshState,
    sidebarContentProps,
    usePlaceholderData,
  } = options;
  return {
    articlesPerPage: dashboardState.articlesPerPage,
    autoRefreshIntervalMinutes: dashboardState.autoRefreshIntervalMinutes,
    backgroundMode,
    canManageInvitations,
    isFeedListInitialLoading: loadingState.isFeedListInitialLoading,
    isFeedListRefreshing: loadingState.isFeedListRefreshing,
    isMobileSidebarOpen: dashboardState.isMobileSidebarOpen,
    isSearchPending: loadingState.isSearchPending,
    isShellLoading: loadingState.isShellLoading,
    isSidebarVisible: dashboardState.isSidebarVisible,
    lastRefreshLabel: refreshState.lastRefreshLabel,
    onBackgroundModeChange,
    onDistillStrategyChange,
    setArticleFilter: dashboardState.setArticleFilter,
    setArticleSortOrder: dashboardState.setArticleSortOrder,
    setArticlesPerPage: dashboardState.setArticlesPerPage,
    setAutoRefreshIntervalMinutes: dashboardState.setAutoRefreshIntervalMinutes,
    setIsMobileSidebarOpen: dashboardState.setIsMobileSidebarOpen,
    setShowFavicons: dashboardState.setShowFavicons,
    shouldUseArticleWindow: loadingState.shouldUseArticleWindow,
    showFavicons: dashboardState.showFavicons,
    showSettingsModal: dashboardState.showSettingsModal,
    sidebarContentProps,
    sidebarScrollRef: controllerResources.sidebarScrollRef,
    usePlaceholderData,
  };
}
/**
 * Manage the dashboard controller chrome state.
 * @param options - The options used to manage the dashboard controller chrome state.
 * @returns The dashboard controller chrome state and callbacks.
 */
function useDashboardControllerChromeState(
  options: DashboardControllerChromeStateOptions,
) {
  const { dashboardState, runtimeState, sidebarCategories } = options;
  const sidebarContentProps = useDashboardSidebarContentState({
    dashboardState,
    runtimeState,
    sidebarCategories,
  });
  const handleCloseSettings = useCallback(() => {
    dashboardState.setShowSettingsModal(false);
  }, [dashboardState]);

  return {
    handleCloseSettings,
    sidebarContentProps,
  };
}

/**
 * Manage the dashboard sidebar content state.
 * @param options - The options used to manage the dashboard sidebar content state.
 * @returns The dashboard sidebar content state and callbacks.
 */
function useDashboardSidebarContentState(
  options: DashboardSidebarContentStateOptions,
) {
  const { dashboardState, runtimeState, sidebarCategories } = options;
  return useMemo(
    () =>
      buildDashboardSidebarContentProps({
        isCategoriesLoading: dashboardState.isCategoriesLoading,
        isSidebarVisible: dashboardState.isSidebarVisible,
        onCategoryClick: runtimeState.runtime.handleCategoryClick,
        onCategoryPrefetch: runtimeState.runtime.handleCategoryPrefetch,
        onFeedClick: runtimeState.runtime.handleFeedClick,
        onFeedPrefetch: runtimeState.runtime.handleFeedPrefetch,
        selectedCategory: dashboardState.selectedCategory,
        showFavicons: dashboardState.showFavicons,
        sidebarCategories,
      }),
    [
      dashboardState.isCategoriesLoading,
      dashboardState.isSidebarVisible,
      dashboardState.selectedCategory,
      dashboardState.showFavicons,
      runtimeState.runtime.handleCategoryClick,
      runtimeState.runtime.handleCategoryPrefetch,
      runtimeState.runtime.handleFeedClick,
      runtimeState.runtime.handleFeedPrefetch,
      sidebarCategories,
    ],
  );
}
