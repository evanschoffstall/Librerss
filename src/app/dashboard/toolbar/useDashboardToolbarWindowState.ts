"use client";

import { useEffect, useState } from "react";

import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { readDashboardPreviewModeFromLocation } from "@/app/dashboard/toolbar/dashboardWindowEvents";

interface DashboardToolbarWindowListenersOptions {
  setIsMarkingAllRead: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMarkingViewportRead: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPreviewMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchPending: React.Dispatch<React.SetStateAction<boolean>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
}

interface DashboardToolbarWindowState {
  isMarkingAllRead: boolean;
  isMarkingViewportRead: boolean;
  isPreviewMode: boolean;
  isRefreshing: boolean;
  isSearchPending: boolean;
  search: string;
  setIsPreviewMode: React.Dispatch<React.SetStateAction<boolean>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  title: string;
}

/**
 * Manage the dashboard toolbar window state.
 * @returns The dashboard toolbar window state state and callbacks.
 */
export function useDashboardToolbarWindowState(): DashboardToolbarWindowState {
  const [title, setTitle] = useState("LibreRSS");
  const [search, setSearch] = useState("");
  const [isPreviewMode, setIsPreviewMode] = useState(
    readDashboardPreviewModeFromLocation,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [isMarkingViewportRead, setIsMarkingViewportRead] = useState(false);
  const [isSearchPending, setIsSearchPending] = useState(false);

  useEffect(() => {
    const listeners = createDashboardToolbarWindowListeners({
      setIsMarkingAllRead,
      setIsMarkingViewportRead,
      setIsPreviewMode,
      setIsRefreshing,
      setIsSearchPending,
      setSearch,
      setTitle,
    });

    addDashboardToolbarWindowListeners(listeners);

    return () => {
      removeDashboardToolbarWindowListeners(listeners);
    };
  }, []);

  return {
    isMarkingAllRead,
    isMarkingViewportRead,
    isPreviewMode,
    isRefreshing,
    isSearchPending,
    search,
    setIsPreviewMode,
    setSearch,
    title,
  };
}
/**
 * Process the add dashboard toolbar window listeners.
 * @param listeners - The callback that listeners.
 */
function addDashboardToolbarWindowListeners(
  listeners: ReturnType<typeof createDashboardToolbarWindowListeners>,
) {
  window.addEventListener(
    DASHBOARD_EVENTS.TITLE_CHANGE,
    listeners.titleChange as EventListener,
  );
  window.addEventListener(
    DASHBOARD_EVENTS.SEARCH_SYNC,
    listeners.searchSync as EventListener,
  );
  window.addEventListener(
    DASHBOARD_EVENTS.SEARCH_PENDING,
    listeners.searchPending as EventListener,
  );
  window.addEventListener(
    DASHBOARD_EVENTS.ENTER_PREVIEW,
    listeners.enterPreview,
  );
  window.addEventListener("popstate", listeners.locationChange);
  window.addEventListener(
    DASHBOARD_EVENTS.REFRESH_START,
    listeners.refreshStart,
  );
  window.addEventListener(DASHBOARD_EVENTS.REFRESH_END, listeners.refreshEnd);
  window.addEventListener(
    DASHBOARD_EVENTS.MARK_ALL_READ_START,
    listeners.markAllReadStart,
  );
  window.addEventListener(
    DASHBOARD_EVENTS.MARK_ALL_READ_END,
    listeners.markAllReadEnd,
  );
  window.addEventListener(
    DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
    listeners.markViewportReadStart,
  );
  window.addEventListener(
    DASHBOARD_EVENTS.MARK_VIEWPORT_READ_END,
    listeners.markViewportReadEnd,
  );
}

/**
 * Create the dashboard toolbar window listeners.
 * @param options - The options used to create the dashboard toolbar window listeners.
 * @returns The dashboard toolbar window listeners.
 */
function createDashboardToolbarWindowListeners(
  options: DashboardToolbarWindowListenersOptions,
) {
  const {
    setIsMarkingAllRead,
    setIsMarkingViewportRead,
    setIsPreviewMode,
    setIsRefreshing,
    setIsSearchPending,
    setSearch,
    setTitle,
  } = options;
  return {
    /**
     * Process the enter preview.
     */
    enterPreview: () => {
      setIsPreviewMode(true);
    },
    /**
     * Process the location change.
     */
    locationChange: () => {
      setIsPreviewMode(readDashboardPreviewModeFromLocation());
    },
    /**
     * Process the mark all read end.
     */
    markAllReadEnd: () => {
      setIsMarkingAllRead(false);
    },
    /**
     * Process the mark all read start.
     */
    markAllReadStart: () => {
      setIsMarkingAllRead(true);
    },
    /**
     * Process the mark viewport read end.
     */
    markViewportReadEnd: () => {
      setIsMarkingViewportRead(false);
    },
    /**
     * Process the mark viewport read start.
     */
    markViewportReadStart: () => {
      setIsMarkingViewportRead(true);
    },
    /**
     * Process the refresh end.
     */
    refreshEnd: () => {
      setIsRefreshing(false);
    },
    /**
     * Process the refresh start.
     */
    refreshStart: () => {
      setIsRefreshing(true);
    },
    /**
     * Process the search pending.
     * @param event - The incoming event.
     */
    searchPending: (event: Event) => {
      const detail = (event as CustomEvent<{ pending?: boolean }>).detail;
      setIsSearchPending(detail.pending === true);
    },
    /**
     * Process the search sync.
     * @param event - The incoming event.
     */
    searchSync: (event: Event) => {
      const detail = (event as CustomEvent<{ term?: string }>).detail;
      setSearch(typeof detail.term === "string" ? detail.term : "");
    },
    /**
     * Process the title change.
     * @param event - The incoming event.
     */
    titleChange: (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string }>).detail;
      const nextTitle =
        typeof detail.title === "string" ? detail.title.trim() : "";
      setTitle(nextTitle === "" ? "LibreRSS" : nextTitle);
    },
  };
}

/**
 * Process the remove dashboard toolbar window listeners.
 * @param listeners - The callback that listeners.
 */
function removeDashboardToolbarWindowListeners(
  listeners: ReturnType<typeof createDashboardToolbarWindowListeners>,
) {
  window.removeEventListener(
    DASHBOARD_EVENTS.TITLE_CHANGE,
    listeners.titleChange as EventListener,
  );
  window.removeEventListener(
    DASHBOARD_EVENTS.SEARCH_SYNC,
    listeners.searchSync as EventListener,
  );
  window.removeEventListener(
    DASHBOARD_EVENTS.SEARCH_PENDING,
    listeners.searchPending as EventListener,
  );
  window.removeEventListener(
    DASHBOARD_EVENTS.ENTER_PREVIEW,
    listeners.enterPreview,
  );
  window.removeEventListener("popstate", listeners.locationChange);
  window.removeEventListener(
    DASHBOARD_EVENTS.REFRESH_START,
    listeners.refreshStart,
  );
  window.removeEventListener(
    DASHBOARD_EVENTS.REFRESH_END,
    listeners.refreshEnd,
  );
  window.removeEventListener(
    DASHBOARD_EVENTS.MARK_ALL_READ_START,
    listeners.markAllReadStart,
  );
  window.removeEventListener(
    DASHBOARD_EVENTS.MARK_ALL_READ_END,
    listeners.markAllReadEnd,
  );
  window.removeEventListener(
    DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
    listeners.markViewportReadStart,
  );
  window.removeEventListener(
    DASHBOARD_EVENTS.MARK_VIEWPORT_READ_END,
    listeners.markViewportReadEnd,
  );
}
