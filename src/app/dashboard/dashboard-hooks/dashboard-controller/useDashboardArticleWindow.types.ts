import type { FeedSelectionFetchers } from "@/app/dashboard/dashboard-services/selection";
import type { CategoryTreeNode } from "@/lib/core";

export interface DashboardArticleWindowState {
  articleWindowLimit: number | undefined;
  handleLoadMoreArticles: () => void;
  hasMoreServerArticles: boolean;
  isLoadingMoreArticles: boolean;
  pendingLoadMoreArticleCount: number;
  requestedArticleLimit: number;
}

export interface UseDashboardArticleWindowOptions extends FeedSelectionFetchers {
  articleFilter: string;
  articlesPerPage: number;
  currentFeedLength: number;
  currentFilteredFeedLength: number;
  isCategoriesLoading: boolean;
  isLoading: boolean;
  prefetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
  prefetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
  prefetchFeed: FeedSelectionFetchers["fetchFeed"];
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  shouldUseArticleWindow: boolean;
  usePlaceholderData: boolean;
}
