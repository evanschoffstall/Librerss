"use client";

/**
 * Subscribes to window-level dashboard events and dispatches them to
 * the appropriate handler callbacks. Keeps the event bus wiring out of
 * the main DashboardView render function.
 */

import { startTransition, useEffect, useRef } from "react";
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
  const onMarkAllReadLocallyRef = useRef(onMarkAllReadLocally);
  const onOpenFeedsSidebarRef = useRef(onOpenFeedsSidebar);
  const onOpenSettingsRef = useRef(onOpenSettings);
  const onRefreshRef = useRef(onRefresh);
  const onSearchChangeRef = useRef(onSearchChange);
  const pendingSearchTermRef = useRef("");
  const selectedCategoryNodeRef = useRef(selectedCategoryNode);
  const selectedCategoryRef = useRef(selectedCategory);
  const selectedFeedUrlRef = useRef(selectedFeedUrl);
  const searchFrameRef = useRef<null | number>(null);
  const usePlaceholderDataRef = useRef(usePlaceholderData);

  onMarkAllReadLocallyRef.current = onMarkAllReadLocally;
  onOpenFeedsSidebarRef.current = onOpenFeedsSidebar;
  onOpenSettingsRef.current = onOpenSettings;
  onRefreshRef.current = onRefresh;
  onSearchChangeRef.current = onSearchChange;
  selectedCategoryNodeRef.current = selectedCategoryNode;
  selectedCategoryRef.current = selectedCategory;
  selectedFeedUrlRef.current = selectedFeedUrl;
  usePlaceholderDataRef.current = usePlaceholderData;

  useEffect(() => {
    const handleMarkAllRead = () => {
      void (async () => {
        window.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_START),
        );

        if (usePlaceholderDataRef.current) {
          onMarkAllReadLocallyRef.current?.();
          toast.success("Marked all as read.");
          window.dispatchEvent(
            new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_END),
          );
          return;
        }

        const streams = collectMarkAllReadStreams(
          selectedCategoryRef.current,
          selectedFeedUrlRef.current,
          selectedCategoryNodeRef.current,
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
          onRefreshRef.current();
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

    const flushSearchChange = () => {
      searchFrameRef.current = null;
      const nextTerm = pendingSearchTermRef.current;
      startTransition(() => {
        onSearchChangeRef.current(nextTerm);
      });
    };

    const handleSearchChange = (event: Event) => {
      const detail = (event as CustomEvent<{ term?: string }>).detail;
      const term = typeof detail.term === "string" ? detail.term : "";
      pendingSearchTermRef.current = term;

      if (typeof requestAnimationFrame !== "function") {
        flushSearchChange();
        return;
      }

      if (searchFrameRef.current !== null) {
        return;
      }

      searchFrameRef.current = requestAnimationFrame(() => {
        flushSearchChange();
      });
    };

    const handleRefresh = () => {
      onRefreshRef.current();
    };
    const handleOpenSettings = () => {
      onOpenSettingsRef.current();
    };
    const handleOpenFeedsSidebar = () => {
      onOpenFeedsSidebarRef.current();
    };

    window.addEventListener(DASHBOARD_EVENTS.REFRESH, handleRefresh);
    window.addEventListener(DASHBOARD_EVENTS.MARK_ALL_READ, handleMarkAllRead);
    window.addEventListener(DASHBOARD_EVENTS.OPEN_SETTINGS, handleOpenSettings);
    window.addEventListener(
      DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR,
      handleOpenFeedsSidebar,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.SEARCH_CHANGE,
      handleSearchChange as EventListener,
    );

    return () => {
      if (
        searchFrameRef.current !== null &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(searchFrameRef.current);
      }
      window.removeEventListener(DASHBOARD_EVENTS.REFRESH, handleRefresh);
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_ALL_READ,
        handleMarkAllRead,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.OPEN_SETTINGS,
        handleOpenSettings,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR,
        handleOpenFeedsSidebar,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.SEARCH_CHANGE,
        handleSearchChange as EventListener,
      );
    };
  }, [fetchAllFeeds, fetchCategoryFeeds, fetchFeed]);
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
