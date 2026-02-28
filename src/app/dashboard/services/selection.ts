import type { CategoryTreeNode } from "@/lib";
import { ALL_FEEDS_NODE_KEY, DEFAULT_FEED_URL } from "../constants";
import { findFeedNodeByKey } from "./category-tree";

export type FeedFetchOptions = {
  forceRefresh?: boolean;
  requestSource?: string;
  skipRefresh?: boolean;
  keepExistingFeed?: boolean;
};

type InitializeDashboardSelectionOptions = {
  selectedCategory: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  fetchAllFeeds: (
    categories?: CategoryTreeNode[],
    options?: FeedFetchOptions,
  ) => Promise<void>;
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  fetchCategoryFeeds: (
    category: CategoryTreeNode,
    options?: FeedFetchOptions,
  ) => Promise<void>;
  setSelectedCategory: (value: string) => void;
  setIsCategoriesLoading: (value: boolean) => void;
};

export async function initializeDashboardSelection(
  options: InitializeDashboardSelectionOptions,
): Promise<void> {
  const {
    selectedCategory,
    loadFeedSources,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    setSelectedCategory,
    setIsCategoriesLoading,
  } = options;

  const loadedCategories = await loadFeedSources();
  setIsCategoriesLoading(false);
  const initialFetchOptions: FeedFetchOptions = {
    skipRefresh: true,
    requestSource: "dashboard-initial-cache",
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

type RefreshCurrentSelectionOptions = {
  selectedCategory: string;
  selectedFeedUrl?: string;
  selectedCategoryNode?: CategoryTreeNode;
  fetchAllFeeds: (
    categories?: CategoryTreeNode[],
    options?: FeedFetchOptions,
  ) => Promise<void>;
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  fetchCategoryFeeds: (
    category: CategoryTreeNode,
    options?: FeedFetchOptions,
  ) => Promise<void>;
  fallbackFeedUrl?: string;
  forceRefresh?: boolean;
  requestSource?: string;
  skipRefresh?: boolean;
  keepExistingFeed?: boolean;
};

export function refreshCurrentSelection(
  options: RefreshCurrentSelectionOptions,
): void {
  const {
    selectedCategory,
    selectedFeedUrl,
    selectedCategoryNode,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    fallbackFeedUrl = DEFAULT_FEED_URL,
    forceRefresh = false,
    requestSource,
    skipRefresh,
    keepExistingFeed,
  } = options;

  const fetchOptions: FeedFetchOptions = {
    forceRefresh,
    requestSource,
    skipRefresh,
    keepExistingFeed,
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
