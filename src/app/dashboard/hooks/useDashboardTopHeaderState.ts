"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthService } from "@/lib";
import { clearClientOriginState } from "@/lib/auth/clear-client-origin-state";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";

import { DASHBOARD_EVENTS, DASHBOARD_PREVIEW_STORAGE_KEY } from "../constants";
import { setDashboardPreviewPersistence } from "../preview-mode";

export function useDashboardTopHeaderState() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDevelopmentMode = process.env.NODE_ENV === "development";
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("LibreRSS");
  const [search, setSearch] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useLocalStorage<boolean>(
    DASHBOARD_PREVIEW_STORAGE_KEY,
    false,
  );
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    const handleMarkAllReadStart = () => {
      setIsMarkingAllRead(true);
    };
    const handleMarkAllReadEnd = () => {
      setIsMarkingAllRead(false);
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
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_ALL_READ_START,
      handleMarkAllReadStart,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_ALL_READ_END,
      handleMarkAllReadEnd,
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
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_ALL_READ_START,
        handleMarkAllReadStart,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_ALL_READ_END,
        handleMarkAllReadEnd,
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
    dispatchDashboardEvent(DASHBOARD_EVENTS.REFRESH);
  };

  const handleMarkAllRead = () => {
    dispatchDashboardEvent(DASHBOARD_EVENTS.MARK_ALL_READ);
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
      await clearClientOriginState();
      window.location.assign("/dashboard");
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
    handleOpenFeedsSidebar,
    handleOpenSettings,
    handleRefresh,
    handleReset,
    handleSearchChange,
    handleSignOut,
    handleToggleTheme,
    isDark,
    isDevelopmentMode,
    isMarkingAllRead,
    isResetting,
    isSearchPending,
    isSigningOut,
    mounted,
    search,
    themeToggleLabel,
    title,
  };
}

function dispatchDashboardEvent(eventName: string, detail?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(eventName, detail ? { detail } : undefined));
}