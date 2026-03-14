"use client";

import { useCallback } from "react";

import { ALL_FEEDS_NODE_KEY } from "../constants";
import {
  type FeedSelectionFetchers,
  refreshCurrentSelection,
} from "../services/selection";

import { type CategoryTreeNode } from "@/lib";

/**
 * Inputs for the dashboard action handlers that drive selection and refresh.
 *
 * These handlers sit between presentational components and the shared selection
 * services, binding the current selection context with sidebar UI state changes.
 */
type UseDashboardViewHandlersOptions = FeedSelectionFetchers & {
  /** Optional hook invoked immediately before a refresh starts, typically to capture scroll state. */
  onBeforeRefresh?: () => void;
  /** Shared callback fired whenever the user changes the active feed/category selection. */
  onFeedSwitch: () => void;
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
export function useDashboardViewHandlers({
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  onBeforeRefresh,
  onFeedSwitch,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
  setIsMobileSidebarOpen,
  setSelectedCategory,
}: UseDashboardViewHandlersOptions) {
  /** Performs a user-initiated refresh of the current selection. */
  const handleRefreshSelection = useCallback(() => {
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
      onFeedSwitch();
      setSelectedCategory(feedNode.key);
      setIsMobileSidebarOpen(false);
      if (feedNode.data?.url && feedNode.data.enabled !== false) {
        void fetchFeed(feedNode.data.url);
      }
    },
    [onFeedSwitch, setSelectedCategory, setIsMobileSidebarOpen, fetchFeed],
  );

  /**
   * Switches to a category-level selection or the synthetic all-feeds node.
   *
   * The all-feeds node uses a dedicated fetch path because it is not backed by a
   * regular category tree node payload.
   */
  const handleCategoryClick = useCallback(
    (categoryNode: CategoryTreeNode) => {
      onFeedSwitch();
      setSelectedCategory(categoryNode.key);
      setIsMobileSidebarOpen(false);

      if (categoryNode.key === ALL_FEEDS_NODE_KEY) {
        void fetchAllFeeds();
        return;
      }

      void fetchCategoryFeeds(categoryNode);
    },
    [
      onFeedSwitch,
      setSelectedCategory,
      setIsMobileSidebarOpen,
      fetchAllFeeds,
      fetchCategoryFeeds,
    ],
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
    handleFeedClick,
    handleRefreshSelection,
    refreshFeedList: handleRefreshSelection,
  };
}
