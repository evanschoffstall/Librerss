"use client";

import { useCallback, useMemo } from "react";

import { useDashboardState } from "@/app/dashboard/dashboard-hooks";
import { useDashboardControllerViewState } from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardControllerViewState";
import { useDashboardArticleWindow } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardArticleWindow";
import { useDashboardControllerRefreshState } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerCoordinator";
import {
  useDashboardAnimatingArticleState,
  useDashboardControllerResources,
  useDashboardFeedLoadingState,
  useDashboardViewModelState,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerSections";
import { useDashboardRuntimeState } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerState";
import { type BackgroundMode } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { buildDashboardSidebarContentProps } from "@/app/dashboard/dashboard-services/dashboard-state";

interface DashboardControllerArticleViewStateOptions {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  articleWindowState: ReturnType<typeof useDashboardArticleWindow>;
  controllerResources: ReturnType<typeof useDashboardControllerResources>;
  dashboardState: ReturnType<typeof useDashboardState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  viewModelState: ReturnType<typeof useDashboardViewModelState>;
}

interface DashboardControllerChromeStateOptions {
  dashboardState: ReturnType<typeof useDashboardState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  sidebarCategories: ReturnType<
    typeof import("@/app/dashboard/dashboard-services/dashboard-state/view-model").buildDashboardViewModel
  >["sidebarCategories"];
}
interface DashboardControllerLayoutViewStateOptions {
  backgroundMode: BackgroundMode;
  controllerResources: ReturnType<typeof useDashboardControllerResources>;
  dashboardState: ReturnType<typeof useDashboardState>;
  loadingState: ReturnType<typeof useDashboardFeedLoadingState>;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  sidebarContentProps: ReturnType<typeof buildDashboardSidebarContentProps>;
  usePlaceholderData: boolean;
}

interface DashboardControllerOutputOptions {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  articleWindowState: ReturnType<typeof useDashboardArticleWindow>;
  backgroundMode: BackgroundMode;
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
interface DashboardSidebarContentStateOptions {
  dashboardState: ReturnType<typeof useDashboardState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  sidebarCategories: ReturnType<
    typeof import("@/app/dashboard/dashboard-services/dashboard-state/view-model").buildDashboardViewModel
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
 * @returns The dashboard controller chrome state state and callbacks.
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
 * @returns The dashboard sidebar content state state and callbacks.
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
