import type { CategoryTreeNode } from "@/lib";
import { ALL_FEEDS_NODE_KEY, DEFAULT_FEED_URL } from "../constants";
import { flattenCategoryFeeds } from "./category-helpers";

type InitializeDashboardSelectionOptions = {
  selectedCategory: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  fetchAllFeeds: (categories?: CategoryTreeNode[]) => Promise<void>;
  fetchFeed: (url: string) => Promise<void>;
  fetchCategoryFeeds: (category: CategoryTreeNode) => Promise<void>;
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
  fetchAllFeeds: () => Promise<void>;
  fetchFeed: (url: string) => Promise<void>;
  fetchCategoryFeeds: (category: CategoryTreeNode) => Promise<void>;
  fallbackFeedUrl?: string;
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
  } = options;

  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    void fetchAllFeeds();
    return;
  }

  if (selectedFeedUrl) {
    void fetchFeed(selectedFeedUrl);
    return;
  }

  if (selectedCategoryNode) {
    void fetchCategoryFeeds(selectedCategoryNode);
    return;
  }

  void fetchFeed(fallbackFeedUrl);
}
