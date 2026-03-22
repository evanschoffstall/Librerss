import { type Dispatch, type SetStateAction } from "react";

import { type CategoryTreeNode } from "@/lib";

import { ALL_FEEDS_NODE_KEY } from "../constants";
import { type FeedSelectionFetchers, refreshCurrentSelection } from "./selection";

interface DashboardRefreshContext extends FeedSelectionFetchers {
  onBeforeRefresh?: () => void;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
}

/** Performs the interval-driven refresh for the current dashboard selection. */
export function autoRefreshDashboardSelection({
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  onBeforeRefresh,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
}: DashboardRefreshContext) {
  onBeforeRefresh?.();
  refreshCurrentSelection({
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    forceRefresh: false,
    keepExistingFeed: true,
    requestSource: "auto-refresh",
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
  });
}

/** Prefetches a category or synthetic all-feeds node when it is not already active. */
export function prefetchDashboardCategory(
  categoryNode: CategoryTreeNode,
  options: {
    prefetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
    prefetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
    selectedCategory: string;
  },
) {
  const { prefetchAllFeeds, prefetchCategoryFeeds, selectedCategory } = options;
  if (selectedCategory === categoryNode.key) {
    return;
  }

  if (categoryNode.key === ALL_FEEDS_NODE_KEY) {
    void prefetchAllFeeds(undefined, {
      requestSource: "sidebar-category-prefetch",
    });
    return;
  }

  void prefetchCategoryFeeds(categoryNode, {
    requestSource: "sidebar-category-prefetch",
  });
}

/** Prefetches a concrete feed node unless it is already selected or disabled. */
export function prefetchDashboardFeed(
  feedNode: CategoryTreeNode,
  options: {
    prefetchFeed: FeedSelectionFetchers["fetchFeed"];
    selectedCategory: string;
  },
) {
  const { prefetchFeed, selectedCategory } = options;
  if (
    selectedCategory === feedNode.key ||
    !feedNode.data?.url ||
    feedNode.data.enabled === false
  ) {
    return;
  }

  void prefetchFeed(feedNode.data.url, {
    requestSource: "sidebar-feed-prefetch",
  });
}

/** Performs the explicit user-initiated refresh for the current dashboard selection. */
export function refreshDashboardSelection({
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  onBeforeRefresh,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
}: DashboardRefreshContext) {
  onBeforeRefresh?.();
  refreshCurrentSelection({
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    forceRefresh: true,
    keepExistingFeed: true,
    requestSource: "manual-refresh",
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
  });
}

/** Switches to a category or the synthetic all-feeds node and fetches its surface. */
export function selectDashboardCategory(
  categoryNode: CategoryTreeNode,
  options: {
    fetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
    fetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
    setIsMobileSidebarOpen: Dispatch<SetStateAction<boolean>>;
    setSelectedCategory: Dispatch<SetStateAction<string>>;
  },
) {
  const {
    fetchAllFeeds,
    fetchCategoryFeeds,
    setIsMobileSidebarOpen,
    setSelectedCategory,
  } = options;

  setSelectedCategory(categoryNode.key);
  setIsMobileSidebarOpen(false);

  if (categoryNode.key === ALL_FEEDS_NODE_KEY) {
    void fetchAllFeeds(undefined, {
      requestSource: "sidebar-category-select",
    });
    return;
  }

  void fetchCategoryFeeds(categoryNode, {
    requestSource: "sidebar-category-select",
  });
}

/** Switches to a concrete feed node and fetches it when the source is enabled. */
export function selectDashboardFeed(
  feedNode: CategoryTreeNode,
  options: {
    fetchFeed: FeedSelectionFetchers["fetchFeed"];
    setIsMobileSidebarOpen: Dispatch<SetStateAction<boolean>>;
    setSelectedCategory: Dispatch<SetStateAction<string>>;
  },
) {
  const { fetchFeed, setIsMobileSidebarOpen, setSelectedCategory } = options;

  setSelectedCategory(feedNode.key);
  setIsMobileSidebarOpen(false);

  if (feedNode.data?.url && feedNode.data.enabled !== false) {
    void fetchFeed(feedNode.data.url, {
      requestSource: "sidebar-feed-select",
    });
  }
}