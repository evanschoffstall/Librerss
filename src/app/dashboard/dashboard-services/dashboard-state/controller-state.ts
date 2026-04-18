import type React from "react";

import type {
  ArticleViewportSnapshot,
  CollapsingArticles,
} from "@/app/dashboard/display-types";
import type { Article, CategoryTreeNode } from "@/lib/core";

import { type ArticleFilter } from "@/app/dashboard/dashboard-services/article";
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
  isSearchPending: boolean;
  isShellLoading: boolean;
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
 * Builds the grouped controller contract consumed by the dashboard view.
 * @param root0
 * @param root0.feedList
 * @param root0.filterBar
 * @param root0.settings
 * @param root0.sidebar
 */
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

/**
 * Builds the memoized sidebar content prop bag shared by desktop and mobile rails.
 * @param root0
 * @param root0.isCategoriesLoading
 * @param root0.isSidebarVisible
 * @param root0.onCategoryClick
 * @param root0.onCategoryPrefetch
 * @param root0.onFeedClick
 * @param root0.onFeedPrefetch
 * @param root0.selectedCategory
 * @param root0.showFavicons
 * @param root0.sidebarCategories
 */
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
