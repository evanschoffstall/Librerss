"use client";

/**
 * Subscribes to window-level dashboard events and dispatches them to
 * the appropriate handler callbacks. Keeps the event bus wiring out of
 * the main DashboardView render function.
 */

import { startTransition, useEffect, useEffectEvent, useRef } from "react";
import { toast } from "sonner";

import { ArticleService, type CategoryTreeNode } from "@/lib";
import { READING_LIST_STREAM } from "@/lib/core/stream-ids";

import { ALL_FEEDS_NODE_KEY, DASHBOARD_EVENTS } from "../constants";

interface UseDashboardEventsOptions {
  onMarkAllReadLocally?: () => void;
  onMarkViewportRead: () => Promise<void>;
  onOpenFeedsSidebar: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onSearchChange: (term: string) => void;
  selectedCategory: string;
  selectedCategoryNode: CategoryTreeNode | undefined;
  selectedFeedUrl: string | undefined;
  usePlaceholderData?: boolean;
}

/**
 * Wires the dashboard's window-level command bus to the latest UI callbacks.
 *
 * React 19 effect events keep the listeners stable while still seeing the
 * newest selected feed context, search callback, and placeholder-mode state.
 */
export function useDashboardEvents({
  onMarkAllReadLocally,
  onMarkViewportRead,
  onOpenFeedsSidebar,
  onOpenSettings,
  onRefresh,
  onSearchChange,
  selectedCategory,
  selectedCategoryNode,
  selectedFeedUrl,
  usePlaceholderData = false,
}: UseDashboardEventsOptions) {
  const pendingSearchTermRef = useRef("");
  const searchFrameRef = useRef<null | number>(null);

  const flushSearchChange = useEffectEvent(() => {
    searchFrameRef.current = null;
    const nextTerm = pendingSearchTermRef.current;
    startTransition(() => {
      onSearchChange(nextTerm);
    });
  });

  const handleMarkAllRead = useEffectEvent(() => {
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
  });

  const handleMarkViewportRead = useEffectEvent(() => {
    void (async () => {
      window.dispatchEvent(
        new CustomEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START),
      );

      try {
        await onMarkViewportRead();
      } finally {
        window.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ_END),
        );
      }
    })();
  });

  const handleSearchChange = useEffectEvent((event: Event) => {
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
  });

  const handleRefresh = useEffectEvent(() => {
    onRefresh();
  });

  const handleOpenSettings = useEffectEvent(() => {
    onOpenSettings();
  });

  const handleOpenFeedsSidebar = useEffectEvent(() => {
    onOpenFeedsSidebar();
  });

  useEffect(() => {
    window.addEventListener(DASHBOARD_EVENTS.REFRESH, handleRefresh);
    window.addEventListener(DASHBOARD_EVENTS.MARK_ALL_READ, handleMarkAllRead);
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ,
      handleMarkViewportRead,
    );
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
        DASHBOARD_EVENTS.MARK_VIEWPORT_READ,
        handleMarkViewportRead,
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
  }, []);
}

/** Resolves the feed stream ids affected by a mark-all-read action. */
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
