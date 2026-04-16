"use client";

import type React from "react";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ArticleFilter,
  BackgroundMode,
} from "@/app/dashboard/dashboard-services";
import type {
  ArticleViewportSnapshot,
  CollapsingArticles,
} from "@/app/dashboard/display-types";
import type { Article, CategoryTreeNode } from "@/lib/core";

import { type useDashboardCategoryTree } from "@/app/dashboard/dashboard-hooks";
import { getAllFeedNodes } from "@/app/dashboard/dashboard-services/category-tree";
import {
  buildDashboardControllerState,
  buildDashboardSidebarContentProps,
} from "@/app/dashboard/dashboard-services/dashboard-state";

export interface UseDashboardControllerViewStateOptions {
  animatingInArticleKeys: ReadonlySet<string>;
  articleCallbacks: {
    feedViewKey: string;
    onArticleExpandedSwipeRead: (article: Article) => void;
    onArticlePrepareExpand: (article: Article) => void;
    onArticleSwipeRead: (article: Article) => void;
    onArticleToggle: (article: Article) => void;
    onArticleToggleRead: (article: Article) => void;
    onArticleToggleStarred: (article: Article) => void;
  };
  articleFilter: ArticleFilter;
  articlesPerPage: number;
  autoRefreshIntervalMinutes: number;
  backgroundMode: BackgroundMode;
  categories: CategoryTreeNode[];
  categoryTree: ReturnType<typeof useDashboardCategoryTree>;
  collapsingArticles: CollapsingArticles;
  displayCategories: CategoryTreeNode[];
  distillStrategy: string;
  expandedArticleKey: null | string;
  filteredFeed: Article[];
  getPreExpandViewportSnapshot: (
    articleKey: string,
  ) => ArticleViewportSnapshot | null;
  handleArticleEnteringDone: (articleKey: string) => void;
  handleCloseSettings: () => void;
  handleLoadMoreArticles: () => void;
  hasMoreServerArticles: boolean;
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  isAutoRefreshing: boolean;
  isCollapseScrollRestoreActive: boolean;
  isFeedListInitialLoading: boolean;
  isFeedListRefreshing: boolean;
  isLoadingMoreArticles: boolean;
  isMobileSidebarOpen: boolean;
  isShellLoading: boolean;
  isSidebarVisible: boolean;
  lastRefreshLabel: string;
  loading: boolean;
  loadingEpoch: number;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  pendingLoadMoreArticleCount: number;
  searchTerm: string;
  selectedCategory: string;
  setArticleFilter: (value: ArticleFilter) => void;
  setArticlesPerPage: (value: number) => void;
  setAutoRefreshIntervalMinutes: (value: React.SetStateAction<number>) => void;
  setIsMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShowFavicons: (value: boolean) => void;
  shouldUseArticleWindow: boolean;
  showFavicons: boolean;
  showSettingsModal: boolean;
  sidebarContentProps: ReturnType<typeof buildDashboardSidebarContentProps>;
  sidebarScrollRef: (node: HTMLElement | null) => void;
  updatingArticleState: Record<string, boolean>;
  usePlaceholderData: boolean;
}

export function useDashboardControllerViewState(
  options: UseDashboardControllerViewStateOptions,
) {
  const controllerSections = useDashboardControllerSections(options);
  return useDashboardControllerStateMemo(controllerSections);
}

export function useDashboardShellLoadingState(
  isFeedListInitialLoading: boolean,
  settleMs: number,
) {
  const [isShellLoading, setIsShellLoading] = useState(true);
  const shellLoadingTimeoutRef = useRef<null | ReturnType<typeof setTimeout>>(
    null,
  );

  useEffect(() => {
    if (shellLoadingTimeoutRef.current !== null) {
      clearTimeout(shellLoadingTimeoutRef.current);
      shellLoadingTimeoutRef.current = null;
    }

    if (isFeedListInitialLoading) {
      setIsShellLoading(true);
      return;
    }

    shellLoadingTimeoutRef.current = setTimeout(() => {
      shellLoadingTimeoutRef.current = null;
      setIsShellLoading(false);
    }, settleMs);

    return () => {
      if (shellLoadingTimeoutRef.current !== null) {
        clearTimeout(shellLoadingTimeoutRef.current);
        shellLoadingTimeoutRef.current = null;
      }
    };
  }, [isFeedListInitialLoading, settleMs]);

  return isShellLoading;
}

function buildDashboardFeedListState(
  options: UseDashboardControllerViewStateOptions,
) {
  return {
    animatingInArticleKeys: options.animatingInArticleKeys,
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    canLoadMoreFromServer:
      options.shouldUseArticleWindow && options.hasMoreServerArticles,
    collapsingArticles: options.collapsingArticles,
    expandedArticleKey: options.expandedArticleKey,
    feedViewKey: options.articleCallbacks.feedViewKey,
    filteredFeed: options.filteredFeed,
    getPreExpandViewportSnapshot: options.getPreExpandViewportSnapshot,
    hasConfiguredFeeds: getAllFeedNodes(options.categories).length > 0,
    hydratedArticleLinks: options.hydratedArticleLinks,
    hydratingArticleLinks: options.hydratingArticleLinks,
    isCollapseScrollRestoreActive: options.isCollapseScrollRestoreActive,
    isInitialLoading: options.isShellLoading,
    isLoadingMore: options.isLoadingMoreArticles,
    isRefreshing: options.isFeedListRefreshing,
    loadingMoreArticleCount: options.pendingLoadMoreArticleCount,
    onArticleEnteringDone: options.handleArticleEnteringDone,
    onArticleExpandedSwipeRead:
      options.articleCallbacks.onArticleExpandedSwipeRead,
    onArticlePrepareExpand: options.articleCallbacks.onArticlePrepareExpand,
    onArticleSwipeRead: options.articleCallbacks.onArticleSwipeRead,
    onArticleToggle: options.articleCallbacks.onArticleToggle,
    onArticleToggleRead: options.articleCallbacks.onArticleToggleRead,
    onArticleToggleStarred: options.articleCallbacks.onArticleToggleStarred,
    onLoadMore: options.shouldUseArticleWindow
      ? options.handleLoadMoreArticles
      : undefined,
    refreshEpoch: options.loadingEpoch,
    searchTerm: options.searchTerm,
    showFavicons: options.showFavicons,
    updatingArticleState: options.updatingArticleState,
  };
}

function buildDashboardFilterBarState(
  options: UseDashboardControllerViewStateOptions,
) {
  return {
    articleFilter: options.articleFilter,
    isShellLoading: options.isShellLoading,
    lastRefreshLabel: options.lastRefreshLabel,
    loading: options.loading || options.isAutoRefreshing,
    setArticleFilter: options.setArticleFilter,
  };
}

function buildDashboardSettingsState(
  options: UseDashboardControllerViewStateOptions,
) {
  return {
    articlesPerPage: options.articlesPerPage,
    autoRefreshIntervalMinutes: options.autoRefreshIntervalMinutes,
    backgroundMode: options.backgroundMode,
    categories: options.displayCategories,
    categoryTree: options.categoryTree,
    distillStrategy: options.distillStrategy,
    handleCloseSettings: options.handleCloseSettings,
    onBackgroundModeChange: options.onBackgroundModeChange,
    onDistillStrategyChange: options.onDistillStrategyChange,
    selectedCategory: options.selectedCategory,
    setArticlesPerPage: options.setArticlesPerPage,
    setAutoRefreshIntervalMinutes: options.setAutoRefreshIntervalMinutes,
    setShowFavicons: options.setShowFavicons,
    showFavicons: options.showFavicons,
    showSettingsModal: options.showSettingsModal,
    usePlaceholderData: options.usePlaceholderData,
  };
}

function buildDashboardSidebarState(
  options: UseDashboardControllerViewStateOptions,
) {
  return {
    isMobileSidebarOpen: options.isMobileSidebarOpen,
    isSidebarVisible: options.isSidebarVisible,
    setIsMobileSidebarOpen: options.setIsMobileSidebarOpen,
    sidebarContentProps: options.sidebarContentProps,
    sidebarScrollRef: options.sidebarScrollRef,
  };
}

function useDashboardControllerSections(
  options: UseDashboardControllerViewStateOptions,
) {
  return {
    feedList: buildDashboardFeedListState(options),
    filterBar: buildDashboardFilterBarState(options),
    settings: buildDashboardSettingsState(options),
    sidebar: buildDashboardSidebarState(options),
  };
}

function useDashboardControllerStateMemo(
  controllerSections: ReturnType<typeof useDashboardControllerSections>,
) {
  return useMemo(
    () => buildDashboardControllerState(controllerSections),
    [controllerSections],
  );
}
