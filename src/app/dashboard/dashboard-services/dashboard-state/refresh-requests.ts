import { type Dispatch, type SetStateAction } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";
import {
  type FeedFetchOptions,
  type FeedSelectionFetchers,
  refreshCurrentSelection,
} from "@/app/dashboard/dashboard-services/selection";

interface DashboardRefreshContext extends FeedSelectionFetchers {
  articleLimit?: number;
  onBeforeRefresh?: () => void;
  searchTerm?: FeedFetchOptions["searchTerm"];
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
}

interface ManualDashboardRefreshContext extends DashboardRefreshContext {
  forceResolveUpstream?: FeedFetchOptions["forceResolveUpstream"];
}

/** Performs the interval-driven refresh for the current dashboard selection. */
export async function autoRefreshDashboardSelection({
  articleLimit,
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  onBeforeRefresh,
  searchTerm,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
}: DashboardRefreshContext) {
  onBeforeRefresh?.();
  await refreshCurrentSelection({
    articleLimit,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    forceRefresh: false,
    keepExistingFeed: true,
    requestSource: "auto-refresh",
    searchTerm,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
  });
}

/** Prefetches a category or synthetic all-feeds node when it is not already active. */
export function prefetchDashboardCategory(
  categoryNode: CategoryTreeNode,
  options: {
    articleLimit?: FeedFetchOptions["articleLimit"];
    prefetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
    prefetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
    searchTerm?: FeedFetchOptions["searchTerm"];
    selectedCategory: string;
  },
) {
  const {
    articleLimit,
    prefetchAllFeeds,
    prefetchCategoryFeeds,
    searchTerm,
    selectedCategory,
  } = options;
  if (selectedCategory === categoryNode.key) {
    return;
  }

  if (categoryNode.key === ALL_FEEDS_NODE_KEY) {
    void prefetchAllFeeds(undefined, {
      ...(typeof articleLimit === "number" ? { articleLimit } : {}),
      requestSource: "sidebar-category-prefetch",
      searchTerm,
    });
    return;
  }

  void prefetchCategoryFeeds(categoryNode, {
    ...(typeof articleLimit === "number" ? { articleLimit } : {}),
    requestSource: "sidebar-category-prefetch",
    searchTerm,
  });
}

/** Prefetches a concrete feed node unless it is already selected or disabled. */
export function prefetchDashboardFeed(
  feedNode: CategoryTreeNode,
  options: {
    articleLimit?: FeedFetchOptions["articleLimit"];
    prefetchFeed: FeedSelectionFetchers["fetchFeed"];
    searchTerm?: FeedFetchOptions["searchTerm"];
    selectedCategory: string;
  },
) {
  const { articleLimit, prefetchFeed, searchTerm, selectedCategory } = options;
  if (
    selectedCategory === feedNode.key ||
    !feedNode.data?.url ||
    feedNode.data.enabled === false
  ) {
    return;
  }

  void prefetchFeed(feedNode.data.url, {
    ...(typeof articleLimit === "number" ? { articleLimit } : {}),
    requestSource: "sidebar-feed-prefetch",
    searchTerm,
  });
}

/** Performs the explicit user-initiated refresh for the current dashboard selection. */
export async function refreshDashboardSelection({
  articleLimit,
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  forceResolveUpstream,
  onBeforeRefresh,
  searchTerm,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
}: ManualDashboardRefreshContext) {
  onBeforeRefresh?.();
  await refreshCurrentSelection({
    articleLimit,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    forceRefresh: true,
    forceResolveUpstream,
    keepExistingFeed: true,
    requestSource: "manual-refresh",
    searchTerm,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
  });
}

/** Switches to a category or the synthetic all-feeds node and fetches its surface. */
export function selectDashboardCategory(
  categoryNode: CategoryTreeNode,
  options: {
    articleLimit?: FeedFetchOptions["articleLimit"];
    fetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
    fetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
    searchTerm?: FeedFetchOptions["searchTerm"];
    setIsMobileSidebarOpen: Dispatch<SetStateAction<boolean>>;
    setSelectedCategory: Dispatch<SetStateAction<string>>;
  },
) {
  const {
    articleLimit,
    fetchAllFeeds,
    fetchCategoryFeeds,
    searchTerm,
    setIsMobileSidebarOpen,
    setSelectedCategory,
  } = options;

  setSelectedCategory(categoryNode.key);
  setIsMobileSidebarOpen(false);

  if (categoryNode.key === ALL_FEEDS_NODE_KEY) {
    void fetchAllFeeds(undefined, {
      ...(typeof articleLimit === "number" ? { articleLimit } : {}),
      requestSource: "sidebar-category-select",
      searchTerm,
    });
    return;
  }

  void fetchCategoryFeeds(categoryNode, {
    ...(typeof articleLimit === "number" ? { articleLimit } : {}),
    requestSource: "sidebar-category-select",
    searchTerm,
  });
}

/** Switches to a concrete feed node and fetches it when the source is enabled. */
export function selectDashboardFeed(
  feedNode: CategoryTreeNode,
  options: {
    articleLimit?: FeedFetchOptions["articleLimit"];
    fetchFeed: FeedSelectionFetchers["fetchFeed"];
    searchTerm?: FeedFetchOptions["searchTerm"];
    setIsMobileSidebarOpen: Dispatch<SetStateAction<boolean>>;
    setSelectedCategory: Dispatch<SetStateAction<string>>;
  },
) {
  const {
    articleLimit,
    fetchFeed,
    searchTerm,
    setIsMobileSidebarOpen,
    setSelectedCategory,
  } = options;

  setSelectedCategory(feedNode.key);
  setIsMobileSidebarOpen(false);

  if (feedNode.data?.url && feedNode.data.enabled !== false) {
    void fetchFeed(feedNode.data.url, {
      ...(typeof articleLimit === "number" ? { articleLimit } : {}),
      requestSource: "sidebar-feed-select",
      searchTerm,
    });
  }
}
