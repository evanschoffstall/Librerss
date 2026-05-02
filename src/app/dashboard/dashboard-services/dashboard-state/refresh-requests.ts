import { type Dispatch, type SetStateAction } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";
import {
  type FeedFetchOptions,
  type FeedSelectionFetchers,
  refreshCurrentSelection,
} from "@/app/dashboard/dashboard-services/selection";

/**
 * Describes the dashboard refresh context.
 */
interface DashboardRefreshContext extends FeedSelectionFetchers {
  articleLimit?: number;
  onBeforeRefresh?: () => void;
  searchTerm?: FeedFetchOptions["searchTerm"];
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
}

/**
 * Describes the manual dashboard refresh context.
 */
interface ManualDashboardRefreshContext extends DashboardRefreshContext {
  forceResolveUpstream?: FeedFetchOptions["forceResolveUpstream"];
}

/**
 * Describes the options for prefetch dashboard category.
 */
interface PrefetchDashboardCategoryOptions {
  articleLimit?: FeedFetchOptions["articleLimit"];
  prefetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
  prefetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
  searchTerm?: FeedFetchOptions["searchTerm"];
  selectedCategory: string;
}
/**
 * Describes the options for prefetch dashboard feed.
 */
interface PrefetchDashboardFeedOptions {
  articleLimit?: FeedFetchOptions["articleLimit"];
  prefetchFeed: FeedSelectionFetchers["fetchFeed"];
  searchTerm?: FeedFetchOptions["searchTerm"];
  selectedCategory: string;
}

/**
 * Describes the options for select dashboard category.
 */
interface SelectDashboardCategoryOptions {
  articleLimit?: FeedFetchOptions["articleLimit"];
  fetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
  fetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
  searchTerm?: FeedFetchOptions["searchTerm"];
  setIsMobileSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedCategory: Dispatch<SetStateAction<string>>;
}
/**
 * Describes the options for select dashboard feed.
 */
interface SelectDashboardFeedOptions {
  articleLimit?: FeedFetchOptions["articleLimit"];
  fetchFeed: FeedSelectionFetchers["fetchFeed"];
  searchTerm?: FeedFetchOptions["searchTerm"];
  setIsMobileSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedCategory: Dispatch<SetStateAction<string>>;
}

/**
 * Process the auto refresh dashboard selection.
 * @param options - The options used to process the auto refresh dashboard selection.
 */
export async function autoRefreshDashboardSelection(
  options: DashboardRefreshContext,
) {
  const {
    articleLimit,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    onBeforeRefresh,
    searchTerm,
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
  } = options;
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

/**
 * Process the prefetch dashboard category.
 * @param categoryNode - The category node.
 * @param options - The options used to process the prefetch dashboard category.
 */
export function prefetchDashboardCategory(
  categoryNode: CategoryTreeNode,
  options: PrefetchDashboardCategoryOptions,
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
      skipRefresh: true,
    });
    return;
  }

  void prefetchCategoryFeeds(categoryNode, {
    ...(typeof articleLimit === "number" ? { articleLimit } : {}),
    requestSource: "sidebar-category-prefetch",
    searchTerm,
    skipRefresh: true,
  });
}
/**
 * Process the prefetch dashboard feed.
 * @param feedNode - The feed node.
 * @param options - The options used to process the prefetch dashboard feed.
 */
export function prefetchDashboardFeed(
  feedNode: CategoryTreeNode,
  options: PrefetchDashboardFeedOptions,
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
    skipRefresh: true,
  });
}

/**
 * Process the refresh dashboard selection.
 * @param options - The options used to process the refresh dashboard selection.
 */
export async function refreshDashboardSelection(
  options: ManualDashboardRefreshContext,
) {
  const {
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
  } = options;
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
/**
 * Process the select dashboard category.
 * @param categoryNode - The category node.
 * @param options - The options used to process the select dashboard category.
 */
export function selectDashboardCategory(
  categoryNode: CategoryTreeNode,
  options: SelectDashboardCategoryOptions,
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

/**
 * Process the select dashboard feed.
 * @param feedNode - The feed node.
 * @param options - The options used to process the select dashboard feed.
 */
export function selectDashboardFeed(
  feedNode: CategoryTreeNode,
  options: SelectDashboardFeedOptions,
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
