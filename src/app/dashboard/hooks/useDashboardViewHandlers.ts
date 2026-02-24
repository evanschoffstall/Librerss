"use client";

import { type CategoryTreeNode } from "@/lib";
import { useCallback } from "react";
import { ALL_FEEDS_NODE_KEY } from "../constants";
import {
  type FeedFetchOptions,
  refreshCurrentSelection,
} from "../helpers/selection";

type UseDashboardViewHandlersOptions = {
  selectedCategory: string;
  selectedFeedUrl?: string;
  selectedCategoryNode?: CategoryTreeNode;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  setIsMobileSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  fetchAllFeeds: (
    categories?: CategoryTreeNode[],
    options?: FeedFetchOptions,
  ) => Promise<void>;
  fetchFeed: (url: string, options?: FeedFetchOptions) => Promise<void>;
  fetchCategoryFeeds: (
    categoryNode: CategoryTreeNode,
    options?: FeedFetchOptions,
  ) => Promise<void>;
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
      setSelectedCategory(feedNode.key);
      setIsMobileSidebarOpen(false);
      if (feedNode.data?.url) {
        void fetchFeed(feedNode.data.url);
      }
    },
    [setSelectedCategory, setIsMobileSidebarOpen, fetchFeed],
  );

  const handleCategoryClick = useCallback(
    (categoryNode: CategoryTreeNode) => {
      setSelectedCategory(categoryNode.key);
      setIsMobileSidebarOpen(false);

      if (categoryNode.key === ALL_FEEDS_NODE_KEY) {
        void fetchAllFeeds();
        return;
      }

      void fetchCategoryFeeds(categoryNode);
    },
    [
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
