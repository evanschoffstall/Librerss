import type { CategoryTreeNode } from "@/lib";
import type { ArticleFilter } from "@/lib/core/article-filters";

import { ALL_FEEDS_NODE_KEY, DEFAULT_FEED_URL } from "../constants";
import { findFeedNodeByKey } from "./category-tree";

export interface FeedFetchOptions {
  articleFilter?: ArticleFilter;
  articleLimit?: number;
  forceRefresh?: boolean;
  forceResolveUpstream?: boolean;
  keepExistingFeed?: boolean;
  knownLastFetchedAtByUrl?: ReadonlyMap<string, Date>;
  requestSource?: FeedRequestSource;
  skipRefresh?: boolean;
}

/** Feed fetch callbacks used when resolving a selected dashboard surface. */
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

/**
 * Canonical request-source labels for dashboard-triggered feed fetches.
 *
 * Keeping these labels explicit prevents silent naming drift across the dashboard
 * fetch layer while preserving the existing analytics and diagnostics semantics.
 */
type FeedRequestSource =
  | "article-filter-change"
  | "auto-refresh"
  | "dashboard-initial-cache"
  | "feed-added"
  | "feed-hidden-selection-fallback"
  | "feed-reenabled"
  | "feed-scroll-load-more"
  | "manual-refresh"
  | "opml-imported"
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
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  skipRefresh?: boolean;
};

/**
 * Boots the dashboard's initial selection and keeps sidebar/feed loading in sync.
 *
 * The sidebar should not reveal before the initial feed selection has resolved,
 * otherwise the dashboard appears to load in two separate phases. The loading
 * flag is therefore released only after the initial fetch path settles.
 *
 * @param options Selection fetchers and state setters required during boot.
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

/** Refreshes whatever feed or category surface is currently selected. */
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
