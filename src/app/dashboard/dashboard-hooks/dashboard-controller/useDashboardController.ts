"use client";

import { useEffect, useRef } from "react";

import {
  useDashboardCategoryTree,
  useDashboardState,
} from "@/app/dashboard/dashboard-hooks";
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

export function useDashboardController({
  backgroundMode,
  distillStrategy,
  onBackgroundModeChange,
  onDistillStrategyChange,
  usePlaceholderData,
}: DashboardControllerProps) {
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

function useDashboardControllerEffects({
  articleFilter,
  categories,
  categoryTree,
  selectedCategory,
  setExpandedArticleKey,
}: {
  articleFilter: ArticleFilter;
  categories: typeof INITIAL_CATEGORIES;
  categoryTree: ReturnType<
    typeof useDashboardControllerResources
  >["categoryTree"];
  selectedCategory: string;
  setExpandedArticleKey: ReturnType<
    typeof useDashboardState
  >["setExpandedArticleKey"];
}) {
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

function useDashboardControllerState({
  distillStrategy,
  usePlaceholderData,
}: Pick<DashboardControllerProps, "distillStrategy" | "usePlaceholderData">) {
  const refreshState = useDashboardControllerRefreshState(usePlaceholderData);
  const animationState = useDashboardAnimatingArticleState();
  const dashboardState = useDashboardState();
  const loadingState = useDashboardFeedLoadingState({
    articleFilter: dashboardState.articleFilter,
    feedLength: dashboardState.feed.length,
    isCategoriesLoading: dashboardState.isCategoriesLoading,
    loading: dashboardState.loading,
    searchTerm: dashboardState.searchTerm,
    settleMs: 140,
    usePlaceholderData,
  });
  const controllerResources = useDashboardControllerResources({
    animationState,
    dashboardState,
    distillStrategy,
    refreshState,
    usePlaceholderData,
  });
  const viewModelState = useDashboardViewModelState({
    categoryTree: controllerResources.categoryTree,
    collapsedArticles: controllerResources.articleActions.collapsingArticles,
    dashboardState,
    loadingState,
  });
  const articleWindowState = useDashboardArticleWindowState({
    dashboardState,
    feedLoader: controllerResources.feedLoader,
    loadingState,
    selectedCategoryNode: viewModelState.selectedCategoryNode,
    selectedFeedUrl: viewModelState.dashboardViewModel.selectedFeedUrl ?? null,
    usePlaceholderData,
    viewModelState,
  });

  return {
    animationState,
    articleWindowState,
    controllerResources,
    dashboardState,
    loadingState,
    refreshState,
    runtimeState: useDashboardRuntimeState({
      articleActions: controllerResources.articleActions,
      articleWindowState,
      dashboardState,
      feedLoader: controllerResources.feedLoader,
      loadingState,
      refreshState,
      selectedCategoryNode: viewModelState.selectedCategoryNode,
      usePlaceholderData,
      viewModelState,
    }),
    viewModelState,
  };
}

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
