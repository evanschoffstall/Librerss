import type { CategoryTreeNode } from "@/lib";
import { ALL_FEEDS_NODE_KEY, DEFAULT_FEED_URL } from "../constants";
import { flattenCategoryFeeds } from "./category-helpers";

export type FeedFetchOptions = {
  forceRefresh?: boolean;
  requestSource?: string;
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

  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    await fetchAllFeeds(loadedCategories);
    return;
  }

  const selectedFeedNode = flattenCategoryFeeds(loadedCategories).find(
    (node) => node.key === selectedCategory,
  );
  if (selectedFeedNode?.data?.url) {
    await fetchFeed(selectedFeedNode.data.url);
    return;
  }

  const selectedCategoryNode = loadedCategories.find(
    (node) => node.key === selectedCategory,
  );
  if (selectedCategoryNode) {
    await fetchCategoryFeeds(selectedCategoryNode);
    return;
  }

  setSelectedCategory(ALL_FEEDS_NODE_KEY);
  await fetchAllFeeds(loadedCategories);
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
  } = options;

  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    void fetchAllFeeds(undefined, { forceRefresh, requestSource });
    return;
  }

  if (selectedFeedUrl) {
    void fetchFeed(selectedFeedUrl, { forceRefresh, requestSource });
    return;
  }

  if (selectedCategoryNode) {
    void fetchCategoryFeeds(selectedCategoryNode, {
      forceRefresh,
      requestSource,
    });
    return;
  }

  void fetchFeed(fallbackFeedUrl, { forceRefresh, requestSource });
}
