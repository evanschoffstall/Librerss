import type {
  ArticleFilter,
  ArticleSortOrder,
  CategoryTreeNode,
} from "@/lib/core";

import { findFeedNodeByKey } from "@/app/dashboard/dashboard-services/category-tree";
import {
  ALL_FEEDS_NODE_KEY,
  DEFAULT_FEED_URL,
} from "@/app/dashboard/dashboard-services/dashboard-constants";

export interface FeedFetchOptions {
  articleFilter?: ArticleFilter;
  articleLimit?: number;
  articleSortOrder?: ArticleSortOrder;
  forceRefresh?: boolean;
  forceResolveUpstream?: boolean;
  keepExistingFeed?: boolean;
  knownLastFetchedAtByUrl?: ReadonlyMap<string, Date>;
  requestSource?: FeedRequestSource;
  searchTerm?: string;
  skipRefresh?: boolean;
}

export interface FeedSelectionFetchers {
  fetchAllFeeds: (
    categories?: CategoryTreeNode[],
    options?: FeedFetchOptions,
  ) => Promise<void>;
  fetchCategoryFeeds: (
    category: CategoryTreeNode,
    options?: FeedFetchOptions,
  ) => Promise<void>;
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
}

type FeedRequestSource =
  | "article-filter-change"
  | "article-sort-order-change"
  | "auto-refresh"
  | "dashboard-initial-cache"
  | "feed-added"
  | "feed-hidden-selection-fallback"
  | "feed-reenabled"
  | "feed-scroll-load-more"
  | "manual-refresh"
  | "opml-imported"
  | "search-change"
  | "sidebar-category-prefetch"
  | "sidebar-category-select"
  | "sidebar-feed-prefetch"
  | "sidebar-feed-select";

type InitializeDashboardSelectionOptions = FeedSelectionFetchers & {
  initialArticleLimit?: number;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setIsCategoriesLoading: (value: boolean) => void;
  setSelectedCategory: (value: string) => void;
};

type RefreshCurrentSelectionOptions = FeedSelectionFetchers & {
  articleLimit?: number;
  fallbackFeedUrl?: string;
  forceRefresh?: boolean;
  forceResolveUpstream?: boolean;
  keepExistingFeed?: boolean;
  requestSource?: FeedRequestSource;
  searchTerm?: string;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  skipRefresh?: boolean;
};

/**
 * Initialize the dashboard selection.
 * @param options - The options used to initialize the dashboard selection.
 */
export async function initializeDashboardSelection(
  options: InitializeDashboardSelectionOptions,
): Promise<void> {
  const {
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    initialArticleLimit,
    loadFeedSources,
    selectedCategory,
    setIsCategoriesLoading,
    setSelectedCategory,
  } = options;

  try {
    const loadedCategories = await loadFeedSources();
    const initialFetchOptions: FeedFetchOptions = {
      ...(typeof initialArticleLimit === "number"
        ? { articleLimit: initialArticleLimit }
        : {}),
      requestSource: "dashboard-initial-cache",
      skipRefresh: true,
    };

    if (selectedCategory === ALL_FEEDS_NODE_KEY) {
      await fetchAllFeeds(loadedCategories, initialFetchOptions);
      return;
    }

    const selectedFeedNode = findFeedNodeByKey(
      loadedCategories,
      selectedCategory,
    );
    if (
      selectedFeedNode?.data?.url &&
      selectedFeedNode.data.enabled !== false
    ) {
      await fetchFeed(selectedFeedNode.data.url, initialFetchOptions);
      return;
    }

    const selectedCategoryNode = loadedCategories.find(
      (node) => node.key === selectedCategory,
    );
    if (selectedCategoryNode) {
      await fetchCategoryFeeds(selectedCategoryNode, initialFetchOptions);
      return;
    }

    setSelectedCategory(ALL_FEEDS_NODE_KEY);
    await fetchAllFeeds(loadedCategories, initialFetchOptions);
  } finally {
    setIsCategoriesLoading(false);
  }
}

/**
 * Process the refresh current selection.
 * @param options - The options used to process the refresh current selection.
 */
export async function refreshCurrentSelection(
  options: RefreshCurrentSelectionOptions,
): Promise<void> {
  const {
    fallbackFeedUrl = DEFAULT_FEED_URL,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    forceRefresh = false,
    forceResolveUpstream,
    keepExistingFeed,
    requestSource,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    skipRefresh,
  } = options;

  const fetchOptions: FeedFetchOptions = {
    articleLimit: options.articleLimit,
    ...(forceResolveUpstream === true ? { forceResolveUpstream: true } : {}),
    forceRefresh,
    keepExistingFeed,
    requestSource,
    searchTerm: options.searchTerm,
    skipRefresh,
  };

  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    await fetchAllFeeds(undefined, fetchOptions);
    return;
  }

  if (selectedFeedUrl) {
    await fetchFeed(selectedFeedUrl, fetchOptions);
    return;
  }

  if (selectedCategoryNode) {
    await fetchCategoryFeeds(selectedCategoryNode, fetchOptions);
    return;
  }

  await fetchFeed(fallbackFeedUrl, fetchOptions);
}
