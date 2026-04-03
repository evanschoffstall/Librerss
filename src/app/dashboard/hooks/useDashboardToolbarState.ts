"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthService } from "@/lib";
import { clearClientOriginState } from "@/lib/auth/clear-client-origin-state";

import { DASHBOARD_EVENTS } from "../constants";
import { setDashboardPreviewPersistence } from "../preview-mode";
import { dispatchDashboardWindowEvent } from "./dashboard-toolbar/events";
import {
  readDashboardShellLoadingFromDocument,
  readDashboardShellLoadingFromEvent,
  resolveDashboardShellLoadingState,
  useDashboardShellLoadingState,
} from "./dashboard-toolbar/useDashboardShellLoadingState";
import { useDashboardToolbarWindowState } from "./dashboard-toolbar/useDashboardToolbarWindowState";

export {
  readDashboardShellLoadingFromDocument,
  readDashboardShellLoadingFromEvent,
  resolveDashboardShellLoadingState,
};

/** Bridges dashboard window events into the persistent toolbar state and actions. */
export function useDashboardToolbarState(startInShellLoading = false) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDevelopmentMode = process.env.NODE_ENV === "development";
  const [mounted, setMounted] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isShellLoading = useDashboardShellLoadingState(startInShellLoading);
  const {
    isMarkingAllRead,
    isMarkingViewportRead,
    isPreviewMode,
    isRefreshing,
    isSearchPending,
    search,
    setIsPreviewMode,
    setSearch,
    title,
  } = useDashboardToolbarWindowState();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && (resolvedTheme ?? "dark") === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const themeToggleLabel = mounted
    ? `Switch to ${nextTheme} mode`
    : "Toggle theme";

  const handleSearchChange = (term: string) => {
    setSearch(term);
    dispatchDashboardWindowEvent(DASHBOARD_EVENTS.SEARCH_CHANGE, { term });
  };

  const handleRefresh = () => {
    if (isRefreshing) {
      return;
    }

    dispatchDashboardWindowEvent(DASHBOARD_EVENTS.REFRESH);
  };

  const handleRefreshFromUpstream = () => {
    if (isRefreshing) {
      return;
    }

    dispatchDashboardWindowEvent(DASHBOARD_EVENTS.REFRESH, {
      forceResolveUpstream: true,
    });
  };

  const handleMarkAllRead = () => {
    dispatchDashboardWindowEvent(DASHBOARD_EVENTS.MARK_ALL_READ);
  };

  const handleMarkViewportRead = () => {
    dispatchDashboardWindowEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ);
  };

  const handleOpenFeedsSidebar = () => {
    dispatchDashboardWindowEvent(DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR);
  };

  const handleOpenSettings = () => {
    dispatchDashboardWindowEvent(DASHBOARD_EVENTS.OPEN_SETTINGS);
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
