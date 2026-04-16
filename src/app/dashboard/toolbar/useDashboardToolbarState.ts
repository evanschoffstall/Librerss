"use client";

import type React from "react";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
  DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
  DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
} from "@/app/dashboard/dashboard-services";
import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";
import {
  dispatchDashboardWindowEvent,
  readDashboardShellLoadingFromDocument,
  readDashboardShellLoadingFromEvent,
  resolveDashboardShellLoadingState,
} from "@/app/dashboard/toolbar/dashboardWindowEvents";
import { useDashboardShellLoadingState } from "@/app/dashboard/toolbar/useDashboardShellLoadingState";
import { useDashboardToolbarWindowState } from "@/app/dashboard/toolbar/useDashboardToolbarWindowState";
import { AuthService } from "@/lib/api";
import { clearClientOriginState } from "@/lib/browser";

export {
  readDashboardShellLoadingFromDocument,
  readDashboardShellLoadingFromEvent,
  resolveDashboardShellLoadingState,
};

/**
 * @param startInShellLoading  Optimistic initial state for the event-based path.
 * @param controlledIsShellLoading  When provided by a parent controller the toolbar
 *   skips the event bus entirely and uses this value directly, guaranteeing it
 *   hydrates in the same React render as the article list and filter bar.
 */
export function useDashboardToolbarState(
  startInShellLoading = false,
  controlledIsShellLoading?: boolean,
) {
  const { resolvedTheme, setTheme } = useTheme();
  const toolbarState = useDashboardToolbarRuntimeState(
    startInShellLoading,
    controlledIsShellLoading,
  );
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

  const { handleToggleTheme, isDark, themeToggleLabel } =
    useDashboardThemeState({
      mounted: toolbarState.mounted,
      resolvedTheme,
      setTheme,
    });
  const toolbarActions = useDashboardToolbarActions({
    isPreviewMode,
    isRefreshing,
    isResetting: toolbarState.isResetting,
    isSigningOut: toolbarState.isSigningOut,
    setIsPreviewMode,
    setIsResetting: toolbarState.setIsResetting,
    setIsSigningOut: toolbarState.setIsSigningOut,
    setSearch,
  });

  return buildDashboardToolbarState({
    ...toolbarActions,
    handleToggleTheme,
    isDark,
    isDevelopmentMode: toolbarState.isDevelopmentMode,
    isMarkingAllRead,
    isMarkingViewportRead,
    isRefreshing,
    isResetting: toolbarState.isResetting,
    isSearchPending,
    isShellLoading: toolbarState.isShellLoading,
    isSigningOut: toolbarState.isSigningOut,
    mounted: toolbarState.mounted,
    search,
    themeToggleLabel,
    title,
  });
}

function buildDashboardToolbarState(state: {
  handleMarkAllRead: () => void;
  handleMarkViewportRead: () => void;
  handleOpenFeedsSidebar: () => void;
  handleOpenSettings: () => void;
  handleRefresh: () => void;
  handleRefreshFromUpstream: () => void;
  handleReset: () => Promise<void>;
  handleSearchChange: (term: string) => void;
  handleSignOut: () => Promise<void>;
  handleToggleTheme: () => void;
  isDark: boolean;
  isDevelopmentMode: boolean;
  isMarkingAllRead: boolean;
  isMarkingViewportRead: boolean;
  isRefreshing: boolean;
  isResetting: boolean;
  isSearchPending: boolean;
  isShellLoading: boolean;
  isSigningOut: boolean;
  mounted: boolean;
  search: string;
  themeToggleLabel: string;
  title: string;
}) {
  return state;
}

function setDashboardPreviewPersistence(enabled: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = enabled
    ? "librerss_dashboard_preview=1; Path=/; Max-Age=2592000; SameSite=Lax"
    : "librerss_dashboard_preview=; Path=/; Max-Age=0; SameSite=Lax";
}

function useDashboardThemeState({
  mounted,
  resolvedTheme,
  setTheme,
}: {
  mounted: boolean;
  resolvedTheme: string | undefined;
  setTheme: (theme: string) => void;
}) {
  const isDark = mounted && (resolvedTheme ?? "dark") === "dark";
  const nextTheme = isDark ? "light" : "dark";

  return {
    handleToggleTheme: () => {
      setTheme(nextTheme);
    },
    isDark,
    themeToggleLabel: mounted ? `Switch to ${nextTheme} mode` : "Toggle theme",
  };
}

function useDashboardToolbarActions(options: {
  isPreviewMode: boolean;
  isRefreshing: boolean;
  isResetting: boolean;
  isSigningOut: boolean;
  setIsPreviewMode: (value: boolean) => void;
  setIsResetting: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSigningOut: React.Dispatch<React.SetStateAction<boolean>>;
  setSearch: (term: string) => void;
}) {
  return {
    ...useDashboardToolbarEventActions({
      isRefreshing: options.isRefreshing,
      setSearch: options.setSearch,
    }),
    ...useDashboardToolbarSessionActions({
      isPreviewMode: options.isPreviewMode,
      isResetting: options.isResetting,
      isSigningOut: options.isSigningOut,
      setIsPreviewMode: options.setIsPreviewMode,
      setIsResetting: options.setIsResetting,
      setIsSigningOut: options.setIsSigningOut,
    }),
  };
}

function useDashboardToolbarEventActions({
  isRefreshing,
  setSearch,
}: {
  isRefreshing: boolean;
  setSearch: (term: string) => void;
}) {
  return {
    handleMarkAllRead: () => {
      dispatchDashboardWindowEvent(DASHBOARD_EVENTS.MARK_ALL_READ);
    },
    handleMarkViewportRead: () => {
      dispatchDashboardWindowEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ);
    },
    handleOpenFeedsSidebar: () => {
      dispatchDashboardWindowEvent(DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR);
    },
    handleOpenSettings: () => {
      dispatchDashboardWindowEvent(DASHBOARD_EVENTS.OPEN_SETTINGS);
    },
    handleRefresh: () => {
      if (!isRefreshing) {
        dispatchDashboardWindowEvent(DASHBOARD_EVENTS.REFRESH);
      }
    },
    handleRefreshFromUpstream: () => {
      if (!isRefreshing) {
        dispatchDashboardWindowEvent(DASHBOARD_EVENTS.REFRESH, {
          forceResolveUpstream: true,
        });
      }
    },
    handleSearchChange: (term: string) => {
      setSearch(term);
      dispatchDashboardWindowEvent(DASHBOARD_EVENTS.SEARCH_CHANGE, { term });
    },
  };
}

function useDashboardToolbarRuntimeState(
  startInShellLoading: boolean,
  controlledIsShellLoading?: boolean,
) {
  const mounted = useMountedFlag();
  const [isResetting, setIsResetting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const eventBasedIsShellLoading = useDashboardShellLoadingState(
    controlledIsShellLoading !== undefined ? false : startInShellLoading,
  );

  return {
    isDevelopmentMode: process.env.NODE_ENV === "development",
    isResetting,
    isShellLoading: controlledIsShellLoading ?? eventBasedIsShellLoading,
    isSigningOut,
    mounted,
    setIsResetting,
    setIsSigningOut,
  };
}

function useDashboardToolbarSessionActions({
  isPreviewMode,
  isResetting,
  isSigningOut,
  setIsPreviewMode,
  setIsResetting,
  setIsSigningOut,
}: {
  isPreviewMode: boolean;
  isResetting: boolean;
  isSigningOut: boolean;
  setIsPreviewMode: (value: boolean) => void;
  setIsResetting: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSigningOut: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const navigateToLanding = async () => {
    await clearClientOriginState();
    setIsPreviewMode(false);
    setDashboardPreviewPersistence(false);
    window.location.assign("/landing");
  };

  return {
    handleReset: async () => {
      if (isResetting) {
        return;
      }

       setIsResetting(true);
      try {
        const resetTargetUrl = window.location.href;
        await clearClientOriginState({
          preserveLocalStorageKeys: [
            DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
            DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
            DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
          ],
        });
        window.location.assign(resetTargetUrl);
      } catch {
        toast.error("Unable to reset app state.");
        setIsResetting(false);
      }
    },
    handleSignOut: async () => {
      if (isSigningOut) {
        return;
      }

      if (isPreviewMode) {
        await navigateToLanding();
        return;
      }

      setIsSigningOut(true);
      try {
        await AuthService.logout();
        await navigateToLanding();
      } catch {
        toast.error("Unable to sign out.");
        setIsSigningOut(false);
      }
    },
  };
}

function useMountedFlag() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
