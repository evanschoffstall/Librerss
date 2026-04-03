"use client";

import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AuthService, useLocalStorage } from "@/lib";
import { clearClientOriginState } from "@/lib/auth/clear-client-origin-state";

import { DASHBOARD_EVENTS, DASHBOARD_PREVIEW_STORAGE_KEY } from "../constants";
import { setDashboardPreviewPersistence } from "../preview-mode";

interface ShellLoadingEventDetail {
  loading?: boolean;
}

/** Bridges dashboard window events into the persistent toolbar state and actions. */
export function useDashboardToolbarState(startInShellLoading = false) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDevelopmentMode = process.env.NODE_ENV === "development";
  const hasReceivedShellLoadingEventRef = useRef(false);
  const [isShellLoading, setIsShellLoading] = useState(startInShellLoading);
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("LibreRSS");
  const [search, setSearch] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useLocalStorage(
    DASHBOARD_PREVIEW_STORAGE_KEY,
    false,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [isMarkingViewportRead, setIsMarkingViewportRead] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    const syncShellLoadingFromDocument = () => {
      const shellLoading = document.documentElement.dataset.dashboardShellLoading;

      if (shellLoading !== "true" && shellLoading !== "false") {
        return false;
      }

      hasReceivedShellLoadingEventRef.current = true;
      setIsShellLoading(shellLoading === "true");
      return true;
    };

    const settleOptimisticShellLoading = () => {
      if (syncShellLoadingFromDocument()) {
        return;
      }

      if (
        !hasReceivedShellLoadingEventRef.current &&
        document.readyState === "complete"
      ) {
        setIsShellLoading(false);
      }
    };

    const handleShellLoading = (event: Event) => {
      const detail = (event as CustomEvent<ShellLoadingEventDetail>).detail;
      hasReceivedShellLoadingEventRef.current = true;
      setIsShellLoading(detail.loading === true);
    };

    const handleReadyStateChange = () => {
      settleOptimisticShellLoading();
    };

    window.addEventListener(
      DASHBOARD_EVENTS.SHELL_LOADING,
      handleShellLoading as EventListener,
    );

    const shellLoadingObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            syncShellLoadingFromDocument();
          });

    shellLoadingObserver?.observe(document.documentElement, {
      attributeFilter: ["data-dashboard-shell-loading"],
      attributes: true,
    });

    syncShellLoadingFromDocument();

    if (startInShellLoading) {
      document.addEventListener("readystatechange", handleReadyStateChange);
      queueMicrotask(settleOptimisticShellLoading);
    }

    return () => {
      window.removeEventListener(
        DASHBOARD_EVENTS.SHELL_LOADING,
        handleShellLoading as EventListener,
      );
      shellLoadingObserver?.disconnect();

      if (startInShellLoading) {
        document.removeEventListener(
          "readystatechange",
          handleReadyStateChange,
        );
      }
    };
  }, [startInShellLoading]);

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
      window.removeEventListener(
        DASHBOARD_EVENTS.ENTER_PREVIEW,
        handleEnterPreview,
      );
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
  }, [setIsPreviewMode]);

  const isDark = mounted && (resolvedTheme ?? "dark") === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const themeToggleLabel = mounted
    ? `Switch to ${nextTheme} mode`
    : "Toggle theme";

  const handleSearchChange = (term: string) => {
    setSearch(term);
    dispatchDashboardEvent(DASHBOARD_EVENTS.SEARCH_CHANGE, { term });
  };

  const handleRefresh = () => {
    if (isRefreshing) {
      return;
    }

    dispatchDashboardEvent(DASHBOARD_EVENTS.REFRESH);
  };

  const handleRefreshFromUpstream = () => {
    if (isRefreshing) {
      return;
    }

    dispatchDashboardEvent(DASHBOARD_EVENTS.REFRESH, {
      forceResolveUpstream: true,
    });
  };

  const handleMarkAllRead = () => {
    dispatchDashboardEvent(DASHBOARD_EVENTS.MARK_ALL_READ);
  };

  const handleMarkViewportRead = () => {
    dispatchDashboardEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ);
  };

  const handleOpenFeedsSidebar = () => {
    dispatchDashboardEvent(DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR);
  };

  const handleOpenSettings = () => {
    dispatchDashboardEvent(DASHBOARD_EVENTS.OPEN_SETTINGS);
  };

  const handleToggleTheme = () => {
    setTheme(nextTheme);
  };

  const handleReset = async () => {
    if (isResetting) return;

    setIsResetting(true);
    try {
      const resetTargetUrl = window.location.href;

      await clearClientOriginState();

      if (isPreviewMode) {
        setDashboardPreviewPersistence(true);
      }

      window.location.assign(resetTargetUrl);
    } catch {
      toast.error("Unable to reset app state.");
      setIsResetting(false);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;

    if (isPreviewMode) {
      await clearClientOriginState();
      setIsPreviewMode(false);
      setDashboardPreviewPersistence(false);
      window.location.assign("/landing");
      return;
    }

    setIsSigningOut(true);
    try {
      await AuthService.logout();
      await clearClientOriginState();
      setIsPreviewMode(false);
      setDashboardPreviewPersistence(false);
      window.location.assign("/landing");
    } catch {
      toast.error("Unable to sign out.");
      setIsSigningOut(false);
    }
  };

  return {
    handleMarkAllRead,
    handleMarkViewportRead,
    handleOpenFeedsSidebar,
    handleOpenSettings,
    handleRefresh,
    handleRefreshFromUpstream,
    handleReset,
    handleSearchChange,
    handleSignOut,
    handleToggleTheme,
    isDark,
    isDevelopmentMode,
    isMarkingAllRead,
    isMarkingViewportRead,
    isRefreshing,
    isResetting,
    isSearchPending,
    isShellLoading,
    isSigningOut,
    mounted,
    search,
    themeToggleLabel,
    title,
  };
}

/** Dispatches a dashboard-scoped custom event with an optional detail payload. */
function dispatchDashboardEvent(
  eventName: string,
  detail?: Record<string, unknown>,
) {
  window.dispatchEvent(
    new CustomEvent(eventName, detail ? { detail } : undefined),
  );
}
