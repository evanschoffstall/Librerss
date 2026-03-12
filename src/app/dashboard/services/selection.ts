import { ALL_FEEDS_NODE_KEY, DEFAULT_FEED_URL } from "../constants";

import { findFeedNodeByKey } from "./category-tree";

import type { CategoryTreeNode } from "@/lib";

export interface FeedFetchOptions {
  forceRefresh?: boolean;
  keepExistingFeed?: boolean;
  requestSource?: string;
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

type InitializeDashboardSelectionOptions = FeedSelectionFetchers & {
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setIsCategoriesLoading: (value: boolean) => void;
  setSelectedCategory: (value: string) => void;
};

type RefreshCurrentSelectionOptions = FeedSelectionFetchers & {
  fallbackFeedUrl?: string;
  forceRefresh?: boolean;
  keepExistingFeed?: boolean;
  requestSource?: string;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  skipRefresh?: boolean;
};

export async function initializeDashboardSelection(
  options: InitializeDashboardSelectionOptions,
): Promise<void> {
  const {
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    loadFeedSources,
    selectedCategory,
    setIsCategoriesLoading,
    setSelectedCategory,
  } = options;

  const loadedCategories = await loadFeedSources();
  setIsCategoriesLoading(false);
  const initialFetchOptions: FeedFetchOptions = {
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
  if (selectedFeedNode?.data?.url && selectedFeedNode.data.enabled !== false) {
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
}

export function refreshCurrentSelection(
  options: RefreshCurrentSelectionOptions,
): void {
  const {
    fallbackFeedUrl = DEFAULT_FEED_URL,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    forceRefresh = false,
    keepExistingFeed,
    requestSource,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    skipRefresh,
  } = options;

  const fetchOptions: FeedFetchOptions = {
    forceRefresh,
    keepExistingFeed,
    requestSource,
    skipRefresh,
  };

  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    void fetchAllFeeds(undefined, fetchOptions);
    return;
  }

  if (selectedFeedUrl) {
    void fetchFeed(selectedFeedUrl, fetchOptions);
    return;
  }

  if (selectedCategoryNode) {
    void fetchCategoryFeeds(selectedCategoryNode, fetchOptions);
    return;
  }

  void fetchFeed(fallbackFeedUrl, fetchOptions);
}
