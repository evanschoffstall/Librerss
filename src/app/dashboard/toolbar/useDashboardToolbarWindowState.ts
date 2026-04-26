"use client";

import { useEffect, useState } from "react";

import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { readDashboardPreviewModeFromLocation } from "@/app/dashboard/toolbar/dashboardWindowEvents";

/**
 * Describes the options for dashboard toolbar window listeners.
 */
interface DashboardToolbarWindowListenersOptions {
  setIsMarkingAllRead: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMarkingViewportRead: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPreviewMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchPending: React.Dispatch<React.SetStateAction<boolean>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * Describes the dashboard toolbar window state.
 */
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
 * Create the dashboard search listeners that synchronize toolbar search state.
 * @param setIsSearchPending - Updates the pending-search state.
 * @param setSearch - Updates the toolbar search term.
 * @returns The search listeners consumed by the window event registration.
 */
function createDashboardToolbarSearchListeners(
  setIsSearchPending: React.Dispatch<React.SetStateAction<boolean>>,
  setSearch: React.Dispatch<React.SetStateAction<string>>,
) {
  return {
    /**
     * Sync the pending-search flag from dashboard window events.
     * @param event - The dashboard event carrying the pending flag.
     */
    searchPending: (event: Event) => {
      setIsSearchPending(readSearchPendingEvent(event));
    },
    /**
     * Sync the toolbar search term from dashboard window events.
     * @param event - The dashboard event carrying the search term.
     */
    searchSync: (event: Event) => {
      setSearch(readSearchSyncTerm(event));
    },
  };
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
  const searchListeners = createDashboardToolbarSearchListeners(
    setIsSearchPending,
    setSearch,
  );
  /**
   * Sync the dashboard title from window events.
   * @param event - The dashboard event carrying the current title.
   */
  const titleChange = (event: Event) => {
    setTitle(readDashboardTitle(event));
  };

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
      setBooleanState(setIsMarkingAllRead, false);
    },
    /**
     * Process the mark all read start.
     */
    markAllReadStart: () => {
      setBooleanState(setIsMarkingAllRead, true);
    },
    /**
     * Process the mark viewport read end.
     */
    markViewportReadEnd: () => {
      setBooleanState(setIsMarkingViewportRead, false);
    },
    /**
     * Process the mark viewport read start.
     */
    markViewportReadStart: () => {
      setBooleanState(setIsMarkingViewportRead, true);
    },
    /**
     * Process the refresh end.
     */
    refreshEnd: () => {
      setBooleanState(setIsRefreshing, false);
    },
    /**
     * Process the refresh start.
     */
    refreshStart: () => {
      setBooleanState(setIsRefreshing, true);
    },
    searchPending: searchListeners.searchPending,
    searchSync: searchListeners.searchSync,
    titleChange,
  };
}

/**
 * Read the dashboard title from a window event and normalize empty values.
 * @param event - The dashboard event carrying the title.
 * @returns The normalized dashboard title.
 */
function readDashboardTitle(event: Event): string {
  const detail = (event as CustomEvent<{ title?: string }>).detail;
  const nextTitle = typeof detail.title === "string" ? detail.title.trim() : "";

  return nextTitle === "" ? "LibreRSS" : nextTitle;
}

/**
 * Read the pending search flag from a dashboard window event.
 * @param event - The dashboard event carrying the pending flag.
 * @returns Whether search is currently pending.
 */
function readSearchPendingEvent(event: Event): boolean {
  const detail = (event as CustomEvent<{ pending?: boolean }>).detail;

  return detail.pending === true;
}

/**
 * Read the search term from a dashboard search sync event.
 * @param event - The dashboard event carrying the search term.
 * @returns The normalized search term.
 */
function readSearchSyncTerm(event: Event): string {
  const detail = (event as CustomEvent<{ term?: string }>).detail;

  return typeof detail.term === "string" ? detail.term : "";
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

/**
 * Set a boolean React state value.
 * @param setter - The React state setter.
 * @param value - The boolean value to apply.
 */
function setBooleanState(
  setter: React.Dispatch<React.SetStateAction<boolean>>,
  value: boolean,
): void {
  setter(value);
}
