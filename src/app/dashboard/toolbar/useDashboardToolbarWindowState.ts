"use client";

import { useEffect, useState } from "react";

import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { readDashboardPreviewModeFromLocation } from "@/app/dashboard/toolbar/dashboardWindowEvents";

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

/** Subscribes the toolbar to passive dashboard window state events. */
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
 * @param listeners
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
 * @param root0
 * @param root0.setIsMarkingAllRead
 * @param root0.setIsMarkingViewportRead
 * @param root0.setIsPreviewMode
 * @param root0.setIsRefreshing
 * @param root0.setIsSearchPending
 * @param root0.setSearch
 * @param root0.setTitle
 */
function createDashboardToolbarWindowListeners({
  setIsMarkingAllRead,
  setIsMarkingViewportRead,
  setIsPreviewMode,
  setIsRefreshing,
  setIsSearchPending,
  setSearch,
  setTitle,
}: {
  setIsMarkingAllRead: React.Dispatch<React.SetStateAction<boolean>>;
  setIsMarkingViewportRead: React.Dispatch<React.SetStateAction<boolean>>;
  setIsPreviewMode: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchPending: React.Dispatch<React.SetStateAction<boolean>>;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
}) {
  return {
    /**
     *
     */
    enterPreview: () => {
      setIsPreviewMode(true);
    },
    /**
     *
     */
    locationChange: () => {
      setIsPreviewMode(readDashboardPreviewModeFromLocation());
    },
    /**
     *
     */
    markAllReadEnd: () => {
      setIsMarkingAllRead(false);
    },
    /**
     *
     */
    markAllReadStart: () => {
      setIsMarkingAllRead(true);
    },
    /**
     *
     */
    markViewportReadEnd: () => {
      setIsMarkingViewportRead(false);
    },
    /**
     *
     */
    markViewportReadStart: () => {
      setIsMarkingViewportRead(true);
    },
    /**
     *
     */
    refreshEnd: () => {
      setIsRefreshing(false);
    },
    /**
     *
     */
    refreshStart: () => {
      setIsRefreshing(true);
    },
    /**
     * @param event
     */
    searchPending: (event: Event) => {
      const detail = (event as CustomEvent<{ pending?: boolean }>).detail;
      setIsSearchPending(detail.pending === true);
    },
    /**
     * @param event
     */
    searchSync: (event: Event) => {
      const detail = (event as CustomEvent<{ term?: string }>).detail;
      setSearch(typeof detail.term === "string" ? detail.term : "");
    },
    /**
     * @param event
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
 * @param listeners
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
