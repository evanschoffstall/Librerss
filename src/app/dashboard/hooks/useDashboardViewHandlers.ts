"use client";

import { useCallback } from "react";

import { ALL_FEEDS_NODE_KEY } from "../constants";
import {
  type FeedSelectionFetchers,
  refreshCurrentSelection,
} from "../services/selection";

import { type CategoryTreeNode } from "@/lib";

type UseDashboardViewHandlersOptions = FeedSelectionFetchers & {
  onBeforeRefresh?: () => void;
  onFeedSwitch: () => void;
  selectedCategory: string;
  selectedCategoryNode?: CategoryTreeNode;
  selectedFeedUrl?: string;
  setIsMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
};

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

  return {
    autoRefreshFeedList: handleAutoRefreshSelection,
    handleCategoryClick,
    handleFeedClick,
    handleRefreshSelection,
    refreshFeedList: handleRefreshSelection,
  };
}
