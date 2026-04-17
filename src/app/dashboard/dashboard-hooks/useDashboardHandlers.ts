"use client";

import { useCallback, useMemo } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import {
  autoRefreshDashboardSelection,
  prefetchDashboardCategory,
  prefetchDashboardFeed,
  refreshDashboardSelection,
  selectDashboardCategory,
  selectDashboardFeed,
} from "@/app/dashboard/dashboard-services/dashboard-state";
import {
  type FeedFetchOptions,
  type FeedSelectionFetchers,
} from "@/app/dashboard/dashboard-services/selection";

/**
 * Inputs for the dashboard action handlers that drive selection and refresh.
 *
 * These handlers sit between presentational components and the shared selection
 * services, binding the current selection context with sidebar UI state changes.
 */
type UseDashboardHandlersOptions = FeedSelectionFetchers & {
  articleLimit?: FeedFetchOptions["articleLimit"];
  /** Optional hook invoked immediately before a refresh starts, typically to capture scroll state. */
  onBeforeRefresh?: () => void;
  /** Silently warms the synthetic all-feeds selection. */
  prefetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
  /** Silently warms a category selection before the user commits it. */
  prefetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
  /** Silently warms an individual feed selection before the user commits it. */
  prefetchFeed: FeedSelectionFetchers["fetchFeed"];
  searchTerm?: FeedFetchOptions["searchTerm"];
  /** Currently selected category or feed node key. */
  selectedCategory: string;
  /** Resolved category tree node for the current selection when available. */
  selectedCategoryNode?: CategoryTreeNode;
  /** Selected concrete feed URL for single-feed views. */
  selectedFeedUrl?: string;
  /** Closes the mobile sidebar after the user commits a selection. */
  setIsMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Persists the newly selected category/feed node key. */
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
};

/**
 * Builds the dashboard's stable UI event handlers for refresh and selection.
 *
 * The hook centralizes the semantics for manual refresh, background refresh, and
 * category/feed switching so UI components can stay declarative and free of
 * selection-service details.
 *
 * @param options Current selection context, fetchers, and local UI setters.
 * @returns Stable callbacks for feed/category clicks and refresh actions.
 */
export function useDashboardHandlers({
  articleLimit,
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  onBeforeRefresh,
  prefetchAllFeeds,
  prefetchCategoryFeeds,
  prefetchFeed,
  searchTerm,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
  setIsMobileSidebarOpen,
  setSelectedCategory,
}: UseDashboardHandlersOptions) {
  const { handleAutoRefreshSelection, handleRefreshSelection } =
    useDashboardRefreshHandlers({
      articleLimit,
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      onBeforeRefresh,
      searchTerm,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
    });
  const {
    handleCategoryClick,
    handleCategoryPrefetch,
    handleFeedClick,
    handleFeedPrefetch,
  } = useDashboardSelectionHandlers({
    articleLimit,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    prefetchAllFeeds,
    prefetchCategoryFeeds,
    prefetchFeed,
    searchTerm,
    selectedCategory,
    setIsMobileSidebarOpen,
    setSelectedCategory,
  });

  /**
   * Exposes the stable handler set consumed by the dashboard controller.
   *
   * `refreshFeedList` intentionally aliases the manual refresh handler because the
   * pull-to-refresh surface should behave the same as an explicit user refresh.
   */
  return {
    autoRefreshFeedList: handleAutoRefreshSelection,
    handleCategoryClick,
    handleCategoryPrefetch,
    handleFeedClick,
    handleFeedPrefetch,
    handleRefreshSelection,
    refreshFeedList: handleRefreshSelection,
  };
}

function useDashboardCategorySelectionHandlers({
  articleLimit,
  fetchAllFeeds,
  fetchCategoryFeeds,
  prefetchAllFeeds,
  prefetchCategoryFeeds,
  searchTerm,
  selectedCategory,
  setIsMobileSidebarOpen,
  setSelectedCategory,
}: Pick<
  UseDashboardHandlersOptions,
  | "articleLimit"
  | "fetchAllFeeds"
  | "fetchCategoryFeeds"
  | "prefetchAllFeeds"
  | "prefetchCategoryFeeds"
  | "searchTerm"
  | "selectedCategory"
  | "setIsMobileSidebarOpen"
  | "setSelectedCategory"
>) {
  return {
    handleCategoryClick: useCallback(
      (categoryNode: CategoryTreeNode) => {
        selectDashboardCategory(categoryNode, {
          articleLimit,
          fetchAllFeeds,
          fetchCategoryFeeds,
          searchTerm,
          setIsMobileSidebarOpen,
          setSelectedCategory,
        });
      },
      [
        articleLimit,
        fetchAllFeeds,
        fetchCategoryFeeds,
        searchTerm,
        setIsMobileSidebarOpen,
        setSelectedCategory,
      ],
    ),
    handleCategoryPrefetch: useCallback(
      (categoryNode: CategoryTreeNode) => {
        prefetchDashboardCategory(categoryNode, {
          articleLimit,
          prefetchAllFeeds,
          prefetchCategoryFeeds,
          searchTerm,
          selectedCategory,
        });
      },
      [
        articleLimit,
        prefetchAllFeeds,
        prefetchCategoryFeeds,
        searchTerm,
        selectedCategory,
      ],
    ),
  };
}

function useDashboardFeedSelectionHandlers({
  articleLimit,
  fetchFeed,
  prefetchFeed,
  searchTerm,
  selectedCategory,
  setIsMobileSidebarOpen,
  setSelectedCategory,
}: Pick<
  UseDashboardHandlersOptions,
  | "articleLimit"
  | "fetchFeed"
  | "prefetchFeed"
  | "searchTerm"
  | "selectedCategory"
  | "setIsMobileSidebarOpen"
  | "setSelectedCategory"
>) {
  return {
    handleFeedClick: useCallback(
      (feedNode: CategoryTreeNode) => {
        selectDashboardFeed(feedNode, {
          articleLimit,
          fetchFeed,
          searchTerm,
          setIsMobileSidebarOpen,
          setSelectedCategory,
        });
      },
      [
        articleLimit,
        fetchFeed,
        searchTerm,
        setIsMobileSidebarOpen,
        setSelectedCategory,
      ],
    ),
    handleFeedPrefetch: useCallback(
      (feedNode: CategoryTreeNode) => {
        prefetchDashboardFeed(feedNode, {
          articleLimit,
          prefetchFeed,
          searchTerm,
          selectedCategory,
        });
      },
      [articleLimit, prefetchFeed, searchTerm, selectedCategory],
    ),
  };
}

function useDashboardRefreshHandlers({
  articleLimit,
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  onBeforeRefresh,
  searchTerm,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
}: Pick<
  UseDashboardHandlersOptions,
  | "articleLimit"
  | "fetchAllFeeds"
  | "fetchCategoryFeeds"
  | "fetchFeed"
  | "onBeforeRefresh"
  | "searchTerm"
  | "selectedCategory"
  | "selectedCategoryNode"
  | "selectedFeedUrl"
>) {
  const refreshOptions = useMemo(
    () => ({
      articleLimit,
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      onBeforeRefresh,
      searchTerm,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
    }),
    [
      articleLimit,
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      onBeforeRefresh,
      searchTerm,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
    ],
  );

  return {
    handleAutoRefreshSelection: useCallback(async () => {
      await autoRefreshDashboardSelection(refreshOptions);
    }, [refreshOptions]),
    handleRefreshSelection: useCallback(
      async (options?: {
        forceResolveUpstream?: FeedFetchOptions["forceResolveUpstream"];
      }) => {
        await refreshDashboardSelection({
          ...refreshOptions,
          forceResolveUpstream: options?.forceResolveUpstream,
        });
      },
      [refreshOptions],
    ),
  };
}

function useDashboardSelectionHandlers({
  articleLimit,
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  prefetchAllFeeds,
  prefetchCategoryFeeds,
  prefetchFeed,
  searchTerm,
  selectedCategory,
  setIsMobileSidebarOpen,
  setSelectedCategory,
}: Pick<
  UseDashboardHandlersOptions,
  | "articleLimit"
  | "fetchAllFeeds"
  | "fetchCategoryFeeds"
  | "fetchFeed"
  | "prefetchAllFeeds"
  | "prefetchCategoryFeeds"
  | "prefetchFeed"
  | "searchTerm"
  | "selectedCategory"
  | "setIsMobileSidebarOpen"
  | "setSelectedCategory"
>) {
  const categoryHandlers = useDashboardCategorySelectionHandlers({
    articleLimit,
    fetchAllFeeds,
    fetchCategoryFeeds,
    prefetchAllFeeds,
    prefetchCategoryFeeds,
    searchTerm,
    selectedCategory,
    setIsMobileSidebarOpen,
    setSelectedCategory,
  });
  const feedHandlers = useDashboardFeedSelectionHandlers({
    articleLimit,
    fetchFeed,
    prefetchFeed,
    searchTerm,
    selectedCategory,
    setIsMobileSidebarOpen,
    setSelectedCategory,
  });

  return { ...categoryHandlers, ...feedHandlers };
}
