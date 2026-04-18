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

/**
 * @param root0
 * @param root0.animationState
 * @param root0.articleWindowState
 * @param root0.backgroundMode
 * @param root0.controllerResources
 * @param root0.dashboardState
 * @param root0.distillStrategy
 * @param root0.loadingState
 * @param root0.onBackgroundModeChange
 * @param root0.onDistillStrategyChange
 * @param root0.refreshState
 * @param root0.runtimeState
 * @param root0.usePlaceholderData
 * @param root0.viewModelState
 */
export function useDashboardControllerOutput({
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
}: {
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
}) {
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
 * @param root0
 * @param root0.animationState
 * @param root0.articleWindowState
 * @param root0.controllerResources
 * @param root0.dashboardState
 * @param root0.runtimeState
 * @param root0.viewModelState
 */
function buildDashboardControllerArticleViewState({
  animationState,
  articleWindowState,
  controllerResources,
  dashboardState,
  runtimeState,
  viewModelState,
}: {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  articleWindowState: ReturnType<typeof useDashboardArticleWindow>;
  controllerResources: ReturnType<typeof useDashboardControllerResources>;
  dashboardState: ReturnType<typeof useDashboardState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  viewModelState: ReturnType<typeof useDashboardViewModelState>;
}) {
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
 * @param root0
 * @param root0.backgroundMode
 * @param root0.controllerResources
 * @param root0.dashboardState
 * @param root0.loadingState
 * @param root0.onBackgroundModeChange
 * @param root0.onDistillStrategyChange
 * @param root0.refreshState
 * @param root0.sidebarContentProps
 * @param root0.usePlaceholderData
 */
function buildDashboardControllerLayoutViewState({
  backgroundMode,
  controllerResources,
  dashboardState,
  loadingState,
  onBackgroundModeChange,
  onDistillStrategyChange,
  refreshState,
  sidebarContentProps,
  usePlaceholderData,
}: {
  backgroundMode: BackgroundMode;
  controllerResources: ReturnType<typeof useDashboardControllerResources>;
  dashboardState: ReturnType<typeof useDashboardState>;
  loadingState: ReturnType<typeof useDashboardFeedLoadingState>;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  sidebarContentProps: ReturnType<typeof buildDashboardSidebarContentProps>;
  usePlaceholderData: boolean;
}) {
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
 * @param root0
 * @param root0.dashboardState
 * @param root0.runtimeState
 * @param root0.sidebarCategories
 */
function useDashboardControllerChromeState({
  dashboardState,
  runtimeState,
  sidebarCategories,
}: {
  dashboardState: ReturnType<typeof useDashboardState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  sidebarCategories: ReturnType<
    typeof import("@/app/dashboard/dashboard-services/dashboard-state/view-model").buildDashboardViewModel
  >["sidebarCategories"];
}) {
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
 * @param root0
 * @param root0.dashboardState
 * @param root0.runtimeState
 * @param root0.sidebarCategories
 */
function useDashboardSidebarContentState({
  dashboardState,
  runtimeState,
  sidebarCategories,
}: {
  dashboardState: ReturnType<typeof useDashboardState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  sidebarCategories: ReturnType<
    typeof import("@/app/dashboard/dashboard-services/dashboard-state/view-model").buildDashboardViewModel
  >["sidebarCategories"];
}) {
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
