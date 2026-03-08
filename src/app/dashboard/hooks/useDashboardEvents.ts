"use client";

/**
 * Subscribes to window-level dashboard events and dispatches them to
 * the appropriate handler callbacks. Keeps the event bus wiring out of
 * the main DashboardView render function.
 */

import { ArticleService, type CategoryTreeNode } from "@/lib";
import { useEffect } from "react";
import { toast } from "sonner";
import { ALL_FEEDS_NODE_KEY, DASHBOARD_EVENTS } from "../constants";

interface UseDashboardEventsOptions {
  selectedCategory: string;
  selectedFeedUrl: string | undefined;
  selectedCategoryNode: CategoryTreeNode | undefined;
  fetchAllFeeds: () => Promise<void>;
  fetchFeed: (url: string) => Promise<void>;
  fetchCategoryFeeds: (category: CategoryTreeNode) => Promise<void>;
  onOpenSettings: () => void;
  onOpenFeedsSidebar: () => void;
  onSearchChange: (term: string) => void;
  onRefresh: () => void;
  usePlaceholderData?: boolean;
  onMarkAllReadLocally?: () => void;
}

function collectMarkAllReadStreams(
  selectedCategory: string,
  selectedFeedUrl: string | undefined,
  selectedCategoryNode: CategoryTreeNode | undefined,
): string[] {
  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    return ["user/-/state/com.google/reading-list"];
  }

  if (selectedFeedUrl) {
    return [`feed/${selectedFeedUrl}`];
  }

  if (!selectedCategoryNode?.children?.length) {
    return [];
  }

  return selectedCategoryNode.children
    .map((node) => node.data?.url)
    .filter((url): url is string => Boolean(url))
    .map((url) => `feed/${url}`);
}

export function useDashboardEvents({
  selectedCategory,
  selectedFeedUrl,
  selectedCategoryNode,
  fetchAllFeeds,
  fetchFeed,
  fetchCategoryFeeds,
  onOpenSettings,
  onOpenFeedsSidebar,
  onSearchChange,
  onRefresh,
  usePlaceholderData = false,
  onMarkAllReadLocally,
}: UseDashboardEventsOptions) {
  useEffect(() => {
    const handleMarkAllRead = async () => {
      window.dispatchEvent(
        new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_START),
      );

      if (usePlaceholderData) {
        onMarkAllReadLocally?.();
        toast.success("Marked all as read.");
        window.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_END),
        );
        return;
      }

      const streams = collectMarkAllReadStreams(
        selectedCategory,
        selectedFeedUrl,
        selectedCategoryNode,
      );

      if (streams.length === 0) {
        toast.info("No readable feed selected.");
        window.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_END),
        );
        return;
      }

      try {
        await Promise.all(
          Array.from(new Set(streams)).map((stream) =>
            ArticleService.markAllRead(stream),
          ),
        );
        toast.success("Marked all as read.");
        onRefresh();
      } catch (error) {
        console.error("Mark all read error:", error);
        toast.error("Unable to mark all as read right now.");
      } finally {
        window.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_END),
        );
      }
    };

    const handleSearchChange = (event: Event) => {
      const term = (event as CustomEvent<{ term?: string }>).detail?.term ?? "";
      onSearchChange(term);
    };

    window.addEventListener(DASHBOARD_EVENTS.REFRESH, onRefresh);
    window.addEventListener(DASHBOARD_EVENTS.MARK_ALL_READ, handleMarkAllRead);
    window.addEventListener(DASHBOARD_EVENTS.OPEN_SETTINGS, onOpenSettings);
    window.addEventListener(
      DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR,
      onOpenFeedsSidebar,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.SEARCH_CHANGE,
      handleSearchChange as EventListener,
    );

    return () => {
      window.removeEventListener(DASHBOARD_EVENTS.REFRESH, onRefresh);
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_ALL_READ,
        handleMarkAllRead,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.OPEN_SETTINGS,
        onOpenSettings,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR,
        onOpenFeedsSidebar,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.SEARCH_CHANGE,
        handleSearchChange as EventListener,
      );
    };
  }, [
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    onOpenSettings,
    onOpenFeedsSidebar,
    onSearchChange,
    onRefresh,
    usePlaceholderData,
    onMarkAllReadLocally,
  ]);
}
