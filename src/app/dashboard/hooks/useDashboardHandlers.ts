"use client";

import { useCallback } from "react";

import { type CategoryTreeNode } from "@/lib";

import {
  autoRefreshDashboardSelection,
  prefetchDashboardCategory,
  prefetchDashboardFeed,
  refreshDashboardSelection,
  selectDashboardCategory,
  selectDashboardFeed,
} from "../services/dashboard-refresh-requests";
import {
  type FeedSelectionFetchers,
} from "../services/selection";

/**
 * Inputs for the dashboard action handlers that drive selection and refresh.
 *
 * These handlers sit between presentational components and the shared selection
 * services, binding the current selection context with sidebar UI state changes.
 */
type UseDashboardHandlersOptions = FeedSelectionFetchers & {
  /** Optional hook invoked immediately before a refresh starts, typically to capture scroll state. */
  onBeforeRefresh?: () => void;
  /** Silently warms the synthetic all-feeds selection. */
  prefetchAllFeeds: FeedSelectionFetchers["fetchAllFeeds"];
  /** Silently warms a category selection before the user commits it. */
  prefetchCategoryFeeds: FeedSelectionFetchers["fetchCategoryFeeds"];
  /** Silently warms an individual feed selection before the user commits it. */
  prefetchFeed: FeedSelectionFetchers["fetchFeed"];
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
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  onBeforeRefresh,
  prefetchAllFeeds,
  prefetchCategoryFeeds,
  prefetchFeed,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
  setIsMobileSidebarOpen,
  setSelectedCategory,
}: UseDashboardHandlersOptions) {
  /** Performs a user-initiated refresh of the current selection. */
  const handleRefreshSelection = useCallback(() => {
    refreshDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      onBeforeRefresh,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
    });
  }, [
    onBeforeRefresh,
    selectedCategory,
    selectedFeedUrl,
    selectedCategoryNode,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
  ]);

  /** Performs a background or interval-driven refresh of the current selection. */
  const handleAutoRefreshSelection = useCallback(() => {
    autoRefreshDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      onBeforeRefresh,
      selectedCategory,
      selectedCategoryNode,
      selectedFeedUrl,
    });
  }, [
    onBeforeRefresh,
    selectedCategory,
    selectedFeedUrl,
    selectedCategoryNode,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
  ]);

  /**
   * Switches to a specific feed node and eagerly loads it when the source is enabled.
   *
   * Disabled feeds still become selected so the rest of the UI remains consistent
   * with the sidebar state, but the network request is intentionally skipped.
   */
  const handleFeedClick = useCallback(
    (feedNode: CategoryTreeNode) => {
      selectDashboardFeed(feedNode, {
        fetchFeed,
        setIsMobileSidebarOpen,
        setSelectedCategory,
      });
    },
    [setSelectedCategory, setIsMobileSidebarOpen, fetchFeed],
  );

  /** Prefetches a feed on hover/focus so selection can reuse a warm query. */
  const handleFeedPrefetch = useCallback(
    (feedNode: CategoryTreeNode) => {
      prefetchDashboardFeed(feedNode, {
        prefetchFeed,
        selectedCategory,
      });
    },
    [prefetchFeed, selectedCategory],
  );

  /**
   * Switches to a category-level selection or the synthetic all-feeds node.
   *
   * The all-feeds node uses a dedicated fetch path because it is not backed by a
   * regular category tree node payload.
   */
  const handleCategoryClick = useCallback(
    (categoryNode: CategoryTreeNode) => {
      selectDashboardCategory(categoryNode, {
        fetchAllFeeds,
        fetchCategoryFeeds,
        setIsMobileSidebarOpen,
        setSelectedCategory,
      });
    },
    [
      setSelectedCategory,
      setIsMobileSidebarOpen,
      fetchAllFeeds,
      fetchCategoryFeeds,
    ],
  );

  /** Prefetches a category on hover/focus so bulk selections land immediately. */
  const handleCategoryPrefetch = useCallback(
    (categoryNode: CategoryTreeNode) => {
      prefetchDashboardCategory(categoryNode, {
        prefetchAllFeeds,
        prefetchCategoryFeeds,
        selectedCategory,
      });
    },
    [prefetchAllFeeds, prefetchCategoryFeeds, selectedCategory],
  );

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
