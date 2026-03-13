"use client";

/**
 * Subscribes to window-level dashboard events and dispatches them to
 * the appropriate handler callbacks. Keeps the event bus wiring out of
 * the main DashboardView render function.
 */

import { useEffect } from "react";
import { toast } from "sonner";

import { ALL_FEEDS_NODE_KEY, DASHBOARD_EVENTS } from "../constants";

import { ArticleService, type CategoryTreeNode } from "@/lib";
import { READING_LIST_STREAM } from "@/lib/core/stream-ids";

interface UseDashboardEventsOptions {
  fetchAllFeeds: () => Promise<void>;
  fetchCategoryFeeds: (category: CategoryTreeNode) => Promise<void>;
  fetchFeed: (url: string) => Promise<void>;
  onMarkAllReadLocally?: () => void;
  onOpenFeedsSidebar: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onSearchChange: (term: string) => void;
  selectedCategory: string;
  selectedCategoryNode: CategoryTreeNode | undefined;
  selectedFeedUrl: string | undefined;
  usePlaceholderData?: boolean;
}

export function useDashboardEvents({
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  onMarkAllReadLocally,
  onOpenFeedsSidebar,
  onOpenSettings,
  onRefresh,
  onSearchChange,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
  usePlaceholderData = false,
}: UseDashboardEventsOptions) {
  useEffect(() => {
    const handleMarkAllRead = () => {
      void (async () => {
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
      })();
    };

    const handleSearchChange = (event: Event) => {
      const detail = (event as CustomEvent<{ term?: string }>).detail;
      const term = typeof detail.term === "string" ? detail.term : "";
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

function collectMarkAllReadStreams(
  selectedCategory: string,
  selectedFeedUrl: string | undefined,
  selectedCategoryNode: CategoryTreeNode | undefined,
): string[] {
  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    return [READING_LIST_STREAM];
  }

  if (selectedFeedUrl) {
    return [`feed/${selectedFeedUrl}`];
  }

  const childNodes = selectedCategoryNode?.children;
  if (childNodes === undefined || childNodes.length === 0) {
    return [];
  }

  return childNodes
    .map((node) => node.data?.url)
    .filter((url): url is string => Boolean(url))
    .map((url) => `feed/${url}`);
}
