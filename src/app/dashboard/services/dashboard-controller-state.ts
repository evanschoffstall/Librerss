import type React from "react";

import { type Article, type CategoryTreeNode } from "@/lib";

import { type BackgroundMode } from "../constants";
import {
  type ArticleViewportSnapshot,
  type CollapsingArticles,
} from "../hooks/useArticleCollapseState";
import { type ArticleFilter } from "./article-filters";

interface DashboardControllerState<
  CategoryTreeController,
  SidebarScrollRef,
> {
  feedList: DashboardFeedListState;
  filterBar: DashboardFilterBarState;
  settings: DashboardSettingsState<CategoryTreeController>;
  sidebar: DashboardSidebarState<SidebarScrollRef>;
}

interface DashboardFeedListState {
  articleFilter: ArticleFilter;
  articlesPerPage: number;
  collapsingArticles: CollapsingArticles;
  expandedArticleKey: null | string;
  feedViewKey: string;
  filteredFeed: Article[];
  getPreExpandViewportSnapshot?: (articleKey: string) => ArticleViewportSnapshot | null;
  hasConfiguredFeeds: boolean;
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  isCollapseScrollRestoreActive: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  onArticleExpandedSwipeRead: (article: Article) => void;
  onArticlePrepareExpand: (article: Article) => void;
  onArticleSwipeRead: (article: Article) => void;
  onArticleToggle: (article: Article) => void;
  onArticleToggleRead: (article: Article) => void;
  onArticleToggleStarred: (article: Article) => void;
  refreshEpoch: number;
  searchTerm: string;
  showFavicons: boolean;
  updatingArticleState: Record<string, boolean>;
}

interface DashboardFilterBarState {
  articleFilter: ArticleFilter;
  lastRefreshLabel: string;
  loading: boolean;
  setArticleFilter: (value: ArticleFilter) => void;
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
  setAutoRefreshIntervalMinutes: (value: number) => void;
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

/** Builds the grouped controller contract consumed by the dashboard view. */
export function buildDashboardControllerState<
  CategoryTreeController,
  SidebarScrollRef,
>({
  feedList,
  filterBar,
  settings,
  sidebar,
}: DashboardControllerState<
  CategoryTreeController,
  SidebarScrollRef
>): DashboardControllerState<CategoryTreeController, SidebarScrollRef> {
  return {
    feedList,
    filterBar,
    settings,
    sidebar,
  };
}

/** Builds the memoized sidebar content prop bag shared by desktop and mobile rails. */
export function buildDashboardSidebarContentProps({
  isCategoriesLoading,
  isSidebarVisible,
  onCategoryClick,
  onCategoryPrefetch,
  onFeedClick,
  onFeedPrefetch,
  selectedCategory,
  showFavicons,
  sidebarCategories,
}: DashboardSidebarContentState): DashboardSidebarContentState {
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