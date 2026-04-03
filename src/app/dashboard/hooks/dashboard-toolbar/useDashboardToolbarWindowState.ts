"use client";

import { useEffect, useState } from "react";

import { DASHBOARD_EVENTS } from "../../constants";
import { readDashboardPreviewModeFromLocation } from "./events";

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
 * Subscribes the toolbar to dashboard window events that drive passive UI state.
 *
 * Search mirrors, title updates, preview-mode transitions, and toolbar action
 * progress all arrive via the dashboard command bus. Keeping that wiring in its
 * own hook keeps the main toolbar controller focused on user-initiated actions.
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
    const handleTitleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string }>).detail;
      const nextTitle =
        typeof detail.title === "string" ? detail.title.trim() : "";
      setTitle(nextTitle === "" ? "LibreRSS" : nextTitle);
    };

    const handleSearchSync = (event: Event) => {
      const detail = (event as CustomEvent<{ term?: string }>).detail;
      setSearch(typeof detail.term === "string" ? detail.term : "");
    };

    const handleSearchPending = (event: Event) => {
      const detail = (event as CustomEvent<{ pending?: boolean }>).detail;
      setIsSearchPending(detail.pending === true);
    };

    const handleEnterPreview = () => {
      setIsPreviewMode(true);
    };

    const handleLocationChange = () => {
      setIsPreviewMode(readDashboardPreviewModeFromLocation());
    };

    const handleRefreshStart = () => {
      setIsRefreshing(true);
    };

    const handleRefreshEnd = () => {
      setIsRefreshing(false);
    };

    const handleMarkAllReadStart = () => {
      setIsMarkingAllRead(true);
    };

    const handleMarkAllReadEnd = () => {
      setIsMarkingAllRead(false);
    };

    const handleMarkViewportReadStart = () => {
      setIsMarkingViewportRead(true);
    };

    const handleMarkViewportReadEnd = () => {
      setIsMarkingViewportRead(false);
    };

    window.addEventListener(
      DASHBOARD_EVENTS.TITLE_CHANGE,
      handleTitleChange as EventListener,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.SEARCH_SYNC,
      handleSearchSync as EventListener,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.SEARCH_PENDING,
      handleSearchPending as EventListener,
    );
    window.addEventListener(DASHBOARD_EVENTS.ENTER_PREVIEW, handleEnterPreview);
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener(DASHBOARD_EVENTS.REFRESH_START, handleRefreshStart);
    window.addEventListener(DASHBOARD_EVENTS.REFRESH_END, handleRefreshEnd);
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_ALL_READ_START,
      handleMarkAllReadStart,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_ALL_READ_END,
      handleMarkAllReadEnd,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
      handleMarkViewportReadStart,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_END,
      handleMarkViewportReadEnd,
    );

    return () => {
      window.removeEventListener(
        DASHBOARD_EVENTS.TITLE_CHANGE,
        handleTitleChange as EventListener,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.SEARCH_SYNC,
        handleSearchSync as EventListener,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.SEARCH_PENDING,
        handleSearchPending as EventListener,
      );
      window.removeEventListener(DASHBOARD_EVENTS.ENTER_PREVIEW, handleEnterPreview);
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener(DASHBOARD_EVENTS.REFRESH_START, handleRefreshStart);
      window.removeEventListener(DASHBOARD_EVENTS.REFRESH_END, handleRefreshEnd);
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_ALL_READ_START,
        handleMarkAllReadStart,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_ALL_READ_END,
        handleMarkAllReadEnd,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
        handleMarkViewportReadStart,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_VIEWPORT_READ_END,
        handleMarkViewportReadEnd,
      );
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