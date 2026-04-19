"use client";

import { useEffect, useRef } from "react";

import type { useDashboardCategoryTree } from "@/app/dashboard/dashboard-hooks";

import { useDashboardState } from "@/app/dashboard/dashboard-hooks";
import {
  useDashboardAnimatingArticleState,
  useDashboardArticleWindowState,
  useDashboardControllerOutput,
  useDashboardControllerRefreshState,
  useDashboardControllerResources,
  useDashboardFeedLoadingState,
  useDashboardRuntimeState,
  useDashboardViewModelState,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardControllerSections";
import { type ArticleFilter } from "@/app/dashboard/dashboard-services/article";
import { computeNextOrderedCategoryLabels } from "@/app/dashboard/dashboard-services/category";
import { INITIAL_CATEGORIES } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { type BackgroundMode } from "@/app/dashboard/dashboard-services/dashboard-constants";

export interface DashboardControllerProps {
  backgroundMode: BackgroundMode;
  distillStrategy: string;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  usePlaceholderData: boolean;
}

interface DashboardControllerEffectsOptions {
  articleFilter: ArticleFilter;
  categories: typeof INITIAL_CATEGORIES;
  categoryTree: ReturnType<
    typeof useDashboardControllerResources
  >["categoryTree"];
  selectedCategory: string;
  setExpandedArticleKey: ReturnType<
    typeof useDashboardState
  >["setExpandedArticleKey"];
}

interface DashboardControllerResourceStateOptions {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  dashboardState: ReturnType<typeof useDashboardState>;
  distillStrategy: string;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  usePlaceholderData: boolean;
}
interface DashboardControllerStateParts {
  animationState: ReturnType<typeof useDashboardAnimatingArticleState>;
  articleWindowState: ReturnType<typeof useDashboardArticleWindowState>;
  controllerResources: ReturnType<typeof useDashboardControllerResources>;
  dashboardState: ReturnType<typeof useDashboardState>;
  loadingState: ReturnType<typeof useDashboardFeedLoadingState>;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  runtimeState: ReturnType<typeof useDashboardRuntimeState>;
  viewModelState: ReturnType<typeof useDashboardViewModelState>;
}

interface DashboardControllerWindowRuntimeStateOptions {
  controllerResources: ReturnType<typeof useDashboardControllerResources>;
  dashboardState: ReturnType<typeof useDashboardState>;
  loadingState: ReturnType<typeof useDashboardFeedLoadingState>;
  refreshState: ReturnType<typeof useDashboardControllerRefreshState>;
  usePlaceholderData: boolean;
  viewModelState: ReturnType<typeof useDashboardViewModelState>;
}

/**
 * Manage the dashboard controller.
 * @param options - The options used to manage the dashboard controller.
 * @returns The dashboard controller state and callbacks.
 */
export function useDashboardController(options: DashboardControllerProps) {
  const {
    backgroundMode,
    distillStrategy,
    onBackgroundModeChange,
    onDistillStrategyChange,
    usePlaceholderData,
  } = options;
  const controllerState = useDashboardControllerState({
    distillStrategy,
    usePlaceholderData,
  });
  useDashboardControllerEffects({
    articleFilter: controllerState.dashboardState.articleFilter,
    categories: controllerState.dashboardState.categories,
    categoryTree: controllerState.controllerResources.categoryTree,
    selectedCategory: controllerState.dashboardState.selectedCategory,
    setExpandedArticleKey: controllerState.dashboardState.setExpandedArticleKey,
  });

  return useDashboardControllerOutput({
    animationState: controllerState.animationState,
    articleWindowState: controllerState.articleWindowState,
    backgroundMode,
    controllerResources: controllerState.controllerResources,
    dashboardState: controllerState.dashboardState,
    distillStrategy,
    loadingState: controllerState.loadingState,
    onBackgroundModeChange,
    onDistillStrategyChange,
    refreshState: controllerState.refreshState,
    runtimeState: controllerState.runtimeState,
    usePlaceholderData,
    viewModelState: controllerState.viewModelState,
  });
}
/**
 * Build the dashboard controller state returned by the controller hook.
 * @param options - The controller state slices computed during controller setup.
 * @returns The controller state object exposed to the dashboard surface.
 */
function buildDashboardControllerState(options: DashboardControllerStateParts) {
  return options;
}

/**
 * Manage the dashboard category order effect.
 * @param categories - The categories.
 * @param customCategoryLabels - The custom category labels.
 * @param orderedCategoryLabels - The ordered category labels.
 * @param setOrderedCategoryLabels - The set ordered category labels.
 */
function useDashboardCategoryOrderEffect(
  categories: ReturnType<typeof useDashboardState>["categories"],
  customCategoryLabels: ReturnType<
    typeof useDashboardCategoryTree
  >["customCategoryLabels"],
  orderedCategoryLabels: ReturnType<
    typeof useDashboardCategoryTree
  >["orderedCategoryLabels"],
  setOrderedCategoryLabels: ReturnType<
    typeof useDashboardCategoryTree
  >["setOrderedCategoryLabels"],
) {
  useEffect(() => {
    if (categories === INITIAL_CATEGORIES) {
      return;
    }

    setOrderedCategoryLabels((currentLabels) => {
      const nextLabels = computeNextOrderedCategoryLabels(
        categories,
        customCategoryLabels,
        currentLabels,
      );

      return nextLabels.length === currentLabels.length &&
        nextLabels.every((label, index) => label === currentLabels[index])
        ? currentLabels
        : nextLabels;
    });
  }, [
    categories,
    customCategoryLabels,
    orderedCategoryLabels,
    setOrderedCategoryLabels,
  ]);
}

/**
 * Manage the dashboard controller effects.
 * @param options - The options used to manage the dashboard controller effects.
 */
function useDashboardControllerEffects(
  options: DashboardControllerEffectsOptions,
) {
  const {
    articleFilter,
    categories,
    categoryTree,
    selectedCategory,
    setExpandedArticleKey,
  } = options;
  useDashboardCategoryOrderEffect(
    categories,
    categoryTree.customCategoryLabels,
    categoryTree.orderedCategoryLabels,
    categoryTree.setOrderedCategoryLabels,
  );
  useDashboardExpandedArticleResetEffect(
    articleFilter,
    selectedCategory,
    setExpandedArticleKey,
  );
}

/**
 * Manage the dashboard controller slices that depend on loading and resources.
 * @param options - The options used to compose the loading and resource slices.
 * @returns The controller slices that feed later dashboard runtime hooks.
 */
function useDashboardControllerResourceState(
  options: DashboardControllerResourceStateOptions,
) {
  const loadingState = useDashboardFeedLoadingState({
    articleFilter: options.dashboardState.articleFilter,
    feedLength: options.dashboardState.feed.length,
    isCategoriesLoading: options.dashboardState.isCategoriesLoading,
    loading: options.dashboardState.loading,
    searchTerm: options.dashboardState.searchTerm,
    settleMs: 140,
    usePlaceholderData: options.usePlaceholderData,
  });
  const controllerResources = useDashboardControllerResources({
    animationState: options.animationState,
    dashboardState: options.dashboardState,
    distillStrategy: options.distillStrategy,
    refreshState: options.refreshState,
    usePlaceholderData: options.usePlaceholderData,
  });
  const viewModelState = useDashboardViewModelState({
    categoryTree: controllerResources.categoryTree,
    collapsedArticles: controllerResources.articleActions.collapsingArticles,
    dashboardState: options.dashboardState,
  });

  return {
    controllerResources,
    loadingState,
    viewModelState,
  };
}

/**
 * Manage the dashboard controller state.
 * @param options - The options used to manage the dashboard controller state.
 * @returns The dashboard controller state state and callbacks.
 */
function useDashboardControllerState(
  options: Pick<
    DashboardControllerProps,
    "distillStrategy" | "usePlaceholderData"
  >,
) {
  const { distillStrategy, usePlaceholderData } = options;
  const refreshState = useDashboardControllerRefreshState(usePlaceholderData);
  const animationState = useDashboardAnimatingArticleState();
  const dashboardState = useDashboardState();
  const { controllerResources, loadingState, viewModelState } =
    useDashboardControllerResourceState({
      animationState,
      dashboardState,
      distillStrategy,
      refreshState,
      usePlaceholderData,
    });
  const { articleWindowState, runtimeState } =
    useDashboardControllerWindowRuntimeState({
      controllerResources,
      dashboardState,
      loadingState,
      refreshState,
      usePlaceholderData,
      viewModelState,
    });

  return buildDashboardControllerState({
    animationState,
    articleWindowState,
    controllerResources,
    dashboardState,
    loadingState,
    refreshState,
    runtimeState,
    viewModelState,
  });
}

/**
 * Manage the dashboard controller slices that depend on the resolved resources.
 * @param options - The options used to compose the article-window and runtime slices.
 * @returns The controller slices that depend on the resolved resources and view model.
 */
function useDashboardControllerWindowRuntimeState(
  options: DashboardControllerWindowRuntimeStateOptions,
) {
  const articleWindowState = useDashboardArticleWindowState({
    dashboardState: options.dashboardState,
    feedLoader: options.controllerResources.feedLoader,
    loadingState: options.loadingState,
    selectedCategoryNode: options.viewModelState.selectedCategoryNode,
    selectedFeedUrl:
      options.viewModelState.dashboardViewModel.selectedFeedUrl ?? null,
    usePlaceholderData: options.usePlaceholderData,
    viewModelState: options.viewModelState,
  });
  const runtimeState = useDashboardRuntimeState({
    articleActions: options.controllerResources.articleActions,
    articleWindowState,
    dashboardState: options.dashboardState,
    feedLoader: options.controllerResources.feedLoader,
    loadingState: options.loadingState,
    refreshState: options.refreshState,
    selectedCategoryNode: options.viewModelState.selectedCategoryNode,
    usePlaceholderData: options.usePlaceholderData,
    viewModelState: options.viewModelState,
  });

  return {
    articleWindowState,
    runtimeState,
  };
}

/**
 * Manage the dashboard expanded article reset effect.
 * @param articleFilter - The article filter.
 * @param selectedCategory - The selected category.
 * @param setExpandedArticleKey - The set expanded article key.
 */
function useDashboardExpandedArticleResetEffect(
  articleFilter: ReturnType<typeof useDashboardState>["articleFilter"],
  selectedCategory: ReturnType<typeof useDashboardState>["selectedCategory"],
  setExpandedArticleKey: ReturnType<
    typeof useDashboardState
  >["setExpandedArticleKey"],
) {
  const previousSelectedCategoryRef = useRef(selectedCategory);
  const previousArticleFilterRef = useRef(articleFilter);

  useEffect(() => {
    if (
      previousSelectedCategoryRef.current !== selectedCategory ||
      previousArticleFilterRef.current !== articleFilter
    ) {
      setExpandedArticleKey(null);
    }

    previousSelectedCategoryRef.current = selectedCategory;
    previousArticleFilterRef.current = articleFilter;
  }, [articleFilter, selectedCategory, setExpandedArticleKey]);
}
