"use client";

import { type CategoryTreeNode } from "@/lib";
import { useCallback } from "react";
import { ALL_FEEDS_NODE_KEY } from "../constants";
import {
  type FeedSelectionFetchers,
  refreshCurrentSelection,
} from "../services/selection";

type UseDashboardViewHandlersOptions = FeedSelectionFetchers & {
  selectedCategory: string;
  selectedFeedUrl?: string;
  selectedCategoryNode?: CategoryTreeNode;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  setIsMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onFeedSwitch: () => void;
};

export function useDashboardViewHandlers({
  selectedCategory,
  selectedFeedUrl,
  selectedCategoryNode,
  setSelectedCategory,
  setIsMobileSidebarOpen,
  fetchAllFeeds,
  fetchFeed,
  fetchCategoryFeeds,
  onFeedSwitch,
}: UseDashboardViewHandlersOptions) {
  const handleRefreshSelection = useCallback(() => {
    refreshCurrentSelection({
      selectedCategory,
      selectedFeedUrl,
      selectedCategoryNode,
      fetchAllFeeds,
      fetchFeed,
      fetchCategoryFeeds,
      forceRefresh: true,
      requestSource: "manual-refresh",
    });
  }, [
    selectedCategory,
    selectedFeedUrl,
    selectedCategoryNode,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
  ]);

  const handleAutoRefreshSelection = useCallback(() => {
    refreshCurrentSelection({
      selectedCategory,
      selectedFeedUrl,
      selectedCategoryNode,
      fetchAllFeeds,
      fetchFeed,
      fetchCategoryFeeds,
      forceRefresh: false,
      requestSource: "auto-refresh",
      keepExistingFeed: true,
    });
  }, [
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
    refreshFeedList: handleRefreshSelection,
    autoRefreshFeedList: handleAutoRefreshSelection,
    handleRefreshSelection,
    handleFeedClick,
    handleCategoryClick,
  };
}
