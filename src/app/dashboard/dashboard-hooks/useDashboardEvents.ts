"use client";

/**
 * Subscribes to window-level dashboard events and dispatches them to
 * the appropriate handler callbacks. Keeps the event bus wiring out of
 * the main DashboardView render function.
 */

import { startTransition, useEffect, useRef } from "react";
import { toast } from "sonner";

import type { CategoryTreeNode } from "@/lib/core";

import {
  ALL_FEEDS_NODE_KEY,
  DASHBOARD_EVENTS,
} from "@/app/dashboard/dashboard-services/dashboard-constants";
import { ArticleService } from "@/lib/api";
import { READING_LIST_STREAM } from "@/lib/core";

interface DashboardMarkAllReadCommandOptions {
  markAllRead?: (stream: string) => Promise<unknown>;
  onMarkAllReadLocally?: () => void;
  onRefresh: (options?: DashboardRefreshEventDetail) => Promise<void>;
  selectedCategory: string;
  selectedCategoryNode: CategoryTreeNode | undefined;
  selectedFeedUrl: string | undefined;
  usePlaceholderData: boolean;
}

interface DashboardRefreshEventDetail {
  forceResolveUpstream?: boolean;
}

interface UseDashboardEventsOptions {
  onMarkAllReadLocally?: () => void;
  onMarkViewportRead: () => Promise<void>;
  onOpenFeedsSidebar: () => void;
  onOpenSettings: () => void;
  onRefresh: (options?: DashboardRefreshEventDetail) => Promise<void>;
  onSearchChange: (term: string) => void;
  selectedCategory: string;
  selectedCategoryNode: CategoryTreeNode | undefined;
  selectedFeedUrl: string | undefined;
  usePlaceholderData?: boolean;
}

/** Runs the mark-all-read command and emits the matching toolbar lifecycle events. */
export async function runDashboardMarkAllReadCommand(
  target: Pick<Window, "dispatchEvent">,
  options: DashboardMarkAllReadCommandOptions,
) {
  const markAllRead =
    options.markAllRead ??
    ((stream: string) => {
      return ArticleService.markAllRead(stream);
    });
  target.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_START));
  if (options.usePlaceholderData) {
    options.onMarkAllReadLocally?.();
    target.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_END));
    return;
  }

  const streams = collectMarkAllReadStreams(
    options.selectedCategory,
    options.selectedFeedUrl,
    options.selectedCategoryNode,
  );
  if (streams.length === 0) {
    toast.info("No readable feed selected.");
    target.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_END));
    return;
  }

  try {
    await Promise.all(
      Array.from(new Set(streams)).map((stream) => markAllRead(stream)),
    );
    await options.onRefresh();
  } catch (error) {
    console.error("Mark all read error:", error);
    toast.error("Unable to mark all as read right now.");
  } finally {
    target.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_END));
  }
}

/** Runs the refresh command and emits the matching toolbar lifecycle events. */
export async function runDashboardRefreshCommand(
  target: Pick<Window, "dispatchEvent">,
  onRefresh: (options?: DashboardRefreshEventDetail) => Promise<void>,
  detail: DashboardRefreshEventDetail | null | undefined,
) {
  target.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_START));
  try {
    await onRefresh({
      forceResolveUpstream:
        detail !== null && detail?.forceResolveUpstream === true,
    });
  } finally {
    target.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_END));
  }
}

/** Runs the viewport-read command and emits the matching toolbar lifecycle events. */
export async function runDashboardViewportReadCommand(
  target: Pick<Window, "dispatchEvent">,
  onMarkViewportRead: () => Promise<void>,
) {
  target.dispatchEvent(
    new CustomEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START),
  );
  try {
    await onMarkViewportRead();
  } finally {
    target.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ_END),
    );
  }
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
  const searchRefs = useDashboardSearchRefs(onSearchChange);
  const actionRefs = useDashboardActionRefs({
    onMarkAllReadLocally,
    onMarkViewportRead,
    onOpenFeedsSidebar,
    onOpenSettings,
    onRefresh,
  });
  const selectionRefs = useDashboardSelectionRefs({
    selectedCategory,
    selectedCategoryNode,
    selectedFeedUrl,
    usePlaceholderData,
  });

  useDashboardSearchEvent({
    onSearchChangeRef: searchRefs.onSearchChangeRef,
    pendingSearchTermRef: searchRefs.pendingSearchTermRef,
    searchFrameRef: searchRefs.searchFrameRef,
  });
  useDashboardRefreshEvents({
    onMarkViewportReadRef: actionRefs.onMarkViewportReadRef,
    onRefreshRef: actionRefs.onRefreshRef,
  });
  useDashboardMarkAllReadEvent({
    onMarkAllReadLocallyRef: actionRefs.onMarkAllReadLocallyRef,
    onRefreshRef: actionRefs.onRefreshRef,
    selectedCategoryNodeRef: selectionRefs.selectedCategoryNodeRef,
    selectedCategoryRef: selectionRefs.selectedCategoryRef,
    selectedFeedUrlRef: selectionRefs.selectedFeedUrlRef,
    usePlaceholderDataRef: selectionRefs.usePlaceholderDataRef,
  });
  useDashboardOpenPanelEvents({
    onOpenFeedsSidebarRef: actionRefs.onOpenFeedsSidebarRef,
    onOpenSettingsRef: actionRefs.onOpenSettingsRef,
  });
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

function useDashboardActionRefs(options: {
  onMarkAllReadLocally: (() => void) | undefined;
  onMarkViewportRead: () => Promise<void>;
  onOpenFeedsSidebar: () => void;
  onOpenSettings: () => void;
  onRefresh: (options?: DashboardRefreshEventDetail) => Promise<void>;
}) {
  const onMarkAllReadLocallyRef = useRef(options.onMarkAllReadLocally);
  const onMarkViewportReadRef = useRef(options.onMarkViewportRead);
  const onOpenFeedsSidebarRef = useRef(options.onOpenFeedsSidebar);
  const onOpenSettingsRef = useRef(options.onOpenSettings);
  const onRefreshRef = useRef(options.onRefresh);

  onMarkAllReadLocallyRef.current = options.onMarkAllReadLocally;
  onMarkViewportReadRef.current = options.onMarkViewportRead;
  onOpenFeedsSidebarRef.current = options.onOpenFeedsSidebar;
  onOpenSettingsRef.current = options.onOpenSettings;
  onRefreshRef.current = options.onRefresh;

  return {
    onMarkAllReadLocallyRef,
    onMarkViewportReadRef,
    onOpenFeedsSidebarRef,
    onOpenSettingsRef,
    onRefreshRef,
  };
}

function useDashboardMarkAllReadEvent(options: {
  onMarkAllReadLocallyRef: React.RefObject<(() => void) | undefined>;
  onRefreshRef: React.RefObject<
    (options?: DashboardRefreshEventDetail) => Promise<void>
  >;
  selectedCategoryNodeRef: React.RefObject<CategoryTreeNode | undefined>;
  selectedCategoryRef: React.RefObject<string>;
  selectedFeedUrlRef: React.RefObject<string | undefined>;
  usePlaceholderDataRef: React.RefObject<boolean>;
}) {
  const {
    onMarkAllReadLocallyRef,
    onRefreshRef,
    selectedCategoryNodeRef,
    selectedCategoryRef,
    selectedFeedUrlRef,
    usePlaceholderDataRef,
  } = options;
  useEffect(() => {
    const handleMarkAllRead = () => {
      void runDashboardMarkAllReadCommand(window, {
        onMarkAllReadLocally: onMarkAllReadLocallyRef.current,
        onRefresh: onRefreshRef.current,
        selectedCategory: selectedCategoryRef.current,
        selectedCategoryNode: selectedCategoryNodeRef.current,
        selectedFeedUrl: selectedFeedUrlRef.current,
        usePlaceholderData: usePlaceholderDataRef.current,
      });
    };

    window.addEventListener(DASHBOARD_EVENTS.MARK_ALL_READ, handleMarkAllRead);
    return () => {
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_ALL_READ,
        handleMarkAllRead,
      );
    };
  }, [
    onMarkAllReadLocallyRef,
    onRefreshRef,
    selectedCategoryNodeRef,
    selectedCategoryRef,
    selectedFeedUrlRef,
    usePlaceholderDataRef,
  ]);
}

function useDashboardOpenPanelEvents(options: {
  onOpenFeedsSidebarRef: React.RefObject<() => void>;
  onOpenSettingsRef: React.RefObject<() => void>;
}) {
  const { onOpenFeedsSidebarRef, onOpenSettingsRef } = options;
  useEffect(() => {
    const handleOpenSettings = () => {
      onOpenSettingsRef.current();
    };
    const handleOpenFeedsSidebar = () => {
      onOpenFeedsSidebarRef.current();
    };

    window.addEventListener(DASHBOARD_EVENTS.OPEN_SETTINGS, handleOpenSettings);
    window.addEventListener(
      DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR,
      handleOpenFeedsSidebar,
    );

    return () => {
      window.removeEventListener(
        DASHBOARD_EVENTS.OPEN_SETTINGS,
        handleOpenSettings,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR,
        handleOpenFeedsSidebar,
      );
    };
  }, [onOpenFeedsSidebarRef, onOpenSettingsRef]);
}

function useDashboardRefreshEvents(options: {
  onMarkViewportReadRef: React.RefObject<() => Promise<void>>;
  onRefreshRef: React.RefObject<
    (options?: DashboardRefreshEventDetail) => Promise<void>
  >;
}) {
  const { onMarkViewportReadRef, onRefreshRef } = options;
  useEffect(() => {
    const handleRefresh = (event: Event) => {
      void (async () => {
        const detail = (
          event as CustomEvent<DashboardRefreshEventDetail | null>
        ).detail;
        await runDashboardRefreshCommand(window, onRefreshRef.current, detail);
      })();
    };

    const handleMarkViewportRead = () => {
      void runDashboardViewportReadCommand(
        window,
        onMarkViewportReadRef.current,
      );
    };

    window.addEventListener(DASHBOARD_EVENTS.REFRESH, handleRefresh);
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ,
      handleMarkViewportRead,
    );

    return () => {
      window.removeEventListener(DASHBOARD_EVENTS.REFRESH, handleRefresh);
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_VIEWPORT_READ,
        handleMarkViewportRead,
      );
    };
  }, [onMarkViewportReadRef, onRefreshRef]);
}

function useDashboardSearchEvent(options: {
  onSearchChangeRef: React.RefObject<(term: string) => void>;
  pendingSearchTermRef: React.RefObject<string>;
  searchFrameRef: React.RefObject<null | number>;
}) {
  const { onSearchChangeRef, pendingSearchTermRef, searchFrameRef } = options;
  useEffect(() => {
    const flushSearchChange = () => {
      searchFrameRef.current = null;
      const nextTerm = pendingSearchTermRef.current;
      startTransition(() => {
        onSearchChangeRef.current(nextTerm);
      });
    };

    const handleSearchChange = (event: Event) => {
      const detail = (event as CustomEvent<{ term?: string }>).detail;
      pendingSearchTermRef.current =
        typeof detail.term === "string" ? detail.term : "";
      if (typeof requestAnimationFrame !== "function") {
        flushSearchChange();
        return;
      }
      searchFrameRef.current ??= requestAnimationFrame(() => {
        flushSearchChange();
      });
    };
    window.addEventListener(DASHBOARD_EVENTS.SEARCH_CHANGE, handleSearchChange);

    return () => {
      const searchFrameId = searchFrameRef.current;
      if (
        searchFrameId !== null &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(searchFrameId);
      }
      window.removeEventListener(
        DASHBOARD_EVENTS.SEARCH_CHANGE,
        handleSearchChange,
      );
    };
  }, [onSearchChangeRef, pendingSearchTermRef, searchFrameRef]);
}

function useDashboardSearchRefs(onSearchChange: (term: string) => void) {
  const pendingSearchTermRef = useRef("");
  const searchFrameRef = useRef<null | number>(null);
  const onSearchChangeRef = useRef(onSearchChange);
  onSearchChangeRef.current = onSearchChange;

  return {
    onSearchChangeRef,
    pendingSearchTermRef,
    searchFrameRef,
  };
}

function useDashboardSelectionRefs(options: {
  selectedCategory: string;
  selectedCategoryNode: CategoryTreeNode | undefined;
  selectedFeedUrl: string | undefined;
  usePlaceholderData: boolean;
}) {
  const selectedCategoryRef = useRef(options.selectedCategory);
  const selectedCategoryNodeRef = useRef(options.selectedCategoryNode);
  const selectedFeedUrlRef = useRef(options.selectedFeedUrl);
  const usePlaceholderDataRef = useRef(options.usePlaceholderData);

  selectedCategoryRef.current = options.selectedCategory;
  selectedCategoryNodeRef.current = options.selectedCategoryNode;
  selectedFeedUrlRef.current = options.selectedFeedUrl;
  usePlaceholderDataRef.current = options.usePlaceholderData;

  return {
    selectedCategoryNodeRef,
    selectedCategoryRef,
    selectedFeedUrlRef,
    usePlaceholderDataRef,
  };
}
