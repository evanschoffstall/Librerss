import type React from "react";

import type {
  ArticleViewportSnapshot,
  CollapsingArticles,
} from "@/app/dashboard/display-types";
import type { Article, CategoryTreeNode } from "@/lib/core";

import {
  type ArticleFilter,
  type ArticleSortOrder,
} from "@/app/dashboard/dashboard-services/article";
import { type BackgroundMode } from "@/app/dashboard/dashboard-services/dashboard-constants";

interface DashboardControllerState<CategoryTreeController, SidebarScrollRef> {
  feedList: DashboardFeedListState;
  filterBar: DashboardFilterBarState;
  settings: DashboardSettingsState<CategoryTreeController>;
  sidebar: DashboardSidebarState<SidebarScrollRef>;
}

interface DashboardFeedListState {
  /** Set of article keys whose entrance animation is currently running. */
  animatingInArticleKeys: ReadonlySet<string>;
  articleFilter: ArticleFilter;
  articlesPerPage: number;
  canLoadMoreFromServer: boolean;
  collapsingArticles: CollapsingArticles;
  expandedArticleKey: null | string;
  feedViewKey: string;
  filteredFeed: Article[];
  getPreExpandViewportSnapshot?: (
    articleKey: string,
  ) => ArticleViewportSnapshot | null;
  hasConfiguredFeeds: boolean;
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  isCollapseScrollRestoreActive: boolean;
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  loadingMoreArticleCount: number;
  /** Stable callback invoked when a specific article's entrance animation finishes. */
  onArticleEnteringDone: (articleKey: string) => void;
  onArticleExpandedSwipeRead: (article: Article) => void;
  onArticlePrepareExpand: (article: Article) => void;
  onArticleSwipeRead: (article: Article) => void;
  onArticleToggle: (article: Article) => void;
  onArticleToggleRead: (article: Article) => void;
  onArticleToggleStarred: (article: Article) => void;
  onLoadMore?: () => void;
  refreshEpoch: number;
  searchTerm: string;
  showFavicons: boolean;
  updatingArticleState: Record<string, boolean>;
}

interface DashboardFilterBarState {
  articleFilter: ArticleFilter;
  /** Current display sort order: newest-first (default) or oldest-first. */
  articleSortOrder: ArticleSortOrder;
  isSearchPending: boolean;
  isShellLoading: boolean;
  lastRefreshLabel: string;
  loading: boolean;
  setArticleFilter: (value: ArticleFilter) => void;
  /** Callback to update the user's preferred article sort order. */
  setArticleSortOrder: (value: ArticleSortOrder) => void;
}

interface DashboardSettingsState<CategoryTreeController> {
  articlesPerPage: number;
  autoRefreshIntervalMinutes: number;
  backgroundMode: BackgroundMode;
  categories: CategoryTreeNode[];
  categoryTree: CategoryTreeController;
  distillStrategy: string;
  handleCloseSettings: () => void;
  onBackgroundModeChange: (value: BackgroundMode) => void;
  onDistillStrategyChange: (value: string) => void;
  selectedCategory: string;
  setArticlesPerPage: (value: number) => void;
  setAutoRefreshIntervalMinutes: (value: React.SetStateAction<number>) => void;
  setShowFavicons: (value: boolean) => void;
  showFavicons: boolean;
  showSettingsModal: boolean;
  usePlaceholderData: boolean;
}

interface DashboardSidebarContentState {
  isCategoriesLoading: boolean;
  isSidebarVisible: boolean;
  onCategoryClick: (categoryNode: CategoryTreeNode) => void;
  onCategoryPrefetch: (categoryNode: CategoryTreeNode) => void;
  onFeedClick: (feedNode: CategoryTreeNode) => void;
  onFeedPrefetch: (feedNode: CategoryTreeNode) => void;
  selectedCategory: string;
  showFavicons: boolean;
  sidebarCategories: CategoryTreeNode[];
}

interface DashboardSidebarState<SidebarScrollRef> {
  isMobileSidebarOpen: boolean;
  isSidebarVisible: boolean;
  setIsMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarContentProps: DashboardSidebarContentState;
  sidebarScrollRef: SidebarScrollRef;
}

/**
 * Build the dashboard controller state.
 * @param options - The options used to build the dashboard controller state.
 * @returns The dashboard controller state.
 */
export function buildDashboardControllerState<
  CategoryTreeController,
  SidebarScrollRef,
>(
  options: DashboardControllerState<CategoryTreeController, SidebarScrollRef>,
): DashboardControllerState<CategoryTreeController, SidebarScrollRef> {
  const { feedList, filterBar, settings, sidebar } = options;
  return {
    feedList,
    filterBar,
    settings,
    sidebar,
  };
}

/**
 * Build the dashboard sidebar content props.
 * @param options - The options used to build the dashboard sidebar content props.
 * @returns The dashboard sidebar content props.
 */
export function buildDashboardSidebarContentProps(
  options: DashboardSidebarContentState,
): DashboardSidebarContentState {
  const {
    isCategoriesLoading,
    isSidebarVisible,
    onCategoryClick,
    onCategoryPrefetch,
    onFeedClick,
    onFeedPrefetch,
    selectedCategory,
    showFavicons,
    sidebarCategories,
  } = options;
  return {
    isCategoriesLoading,
    isSidebarVisible,
    onCategoryClick,
    onCategoryPrefetch,
    onFeedClick,
    onFeedPrefetch,
    selectedCategory,
    showFavicons,
    sidebarCategories,
  };
}
