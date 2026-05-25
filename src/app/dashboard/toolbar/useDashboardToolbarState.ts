"use client";

import type React from "react";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
  DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
  DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
} from "@/app/dashboard/services";
import { DASHBOARD_EVENTS } from "@/app/dashboard/services/dashboard-constants";
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
 * Describes the options for dashboard theme state.
 */
interface DashboardThemeStateOptions {
  mounted: boolean;
  resolvedTheme: string | undefined;
  setTheme: (theme: string) => void;
}
/**
 * Describes the options for dashboard toolbar actions.
 */
interface DashboardToolbarActionsOptions {
  isPreviewMode: boolean;
  isRefreshing: boolean;
  isResetting: boolean;
  isSigningOut: boolean;
  setIsPreviewMode: (value: boolean) => void;
  setIsResetting: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSigningOut: React.Dispatch<React.SetStateAction<boolean>>;
  setSearch: (term: string) => void;
}

/**
 * Describes the options for dashboard toolbar event actions.
 */
interface DashboardToolbarEventActionsOptions {
  isRefreshing: boolean;
  setSearch: (term: string) => void;
}

/**
 * Describes the options for dashboard toolbar session actions.
 */
interface DashboardToolbarSessionActionsOptions {
  isPreviewMode: boolean;
  isResetting: boolean;
  isSigningOut: boolean;
  setIsPreviewMode: (value: boolean) => void;
  setIsResetting: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSigningOut: React.Dispatch<React.SetStateAction<boolean>>;
}
/**
 * Describes the dashboard toolbar state state.
 */
interface DashboardToolbarStateState {
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
}

/**
 * Manage the dashboard toolbar state.
 * @param startInShellLoading - The start in shell loading.
 * @param controlledIsShellLoading - The controlled is shell loading.
 * @returns The dashboard toolbar state and callbacks.
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
/**
 * Build the dashboard toolbar state.
 * @param state - The state.
 * @returns The dashboard toolbar state.
 */
function buildDashboardToolbarState(state: DashboardToolbarStateState) {
  return state;
}

/**
 * Process the set dashboard preview persistence.
 * @param enabled - The enabled.
 */
function setDashboardPreviewPersistence(enabled: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = enabled
    ? "librerss_dashboard_preview=1; Path=/; Max-Age=2592000; SameSite=Lax"
    : "librerss_dashboard_preview=; Path=/; Max-Age=0; SameSite=Lax";
}
/**
 * Manage the dashboard theme state.
 * @param options - The options used to manage the dashboard theme state.
 * @returns The dashboard theme state and callbacks.
 */
function useDashboardThemeState(options: DashboardThemeStateOptions) {
  const { mounted, resolvedTheme, setTheme } = options;
  const isDark = mounted && (resolvedTheme ?? "dark") === "dark";
  const nextTheme = isDark ? "light" : "dark";

  return {
    /**
     * Process the handle toggle theme.
     */
    handleToggleTheme: () => {
      setTheme(nextTheme);
    },
    isDark,
    themeToggleLabel: mounted ? `Switch to ${nextTheme} mode` : "Toggle theme",
  };
}

/**
 * Manage the dashboard toolbar actions.
 * @param options - The options used to manage the dashboard toolbar actions.
 * @returns The dashboard toolbar actions state and callbacks.
 */
function useDashboardToolbarActions(options: DashboardToolbarActionsOptions) {
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

/**
 * Manage the dashboard toolbar event actions.
 * @param options - The options used to manage the dashboard toolbar event actions.
 * @returns The dashboard toolbar event actions state and callbacks.
 */
function useDashboardToolbarEventActions(
  options: DashboardToolbarEventActionsOptions,
) {
  const { isRefreshing, setSearch } = options;
  return {
    /**
     * Process the handle mark all read.
     */
    handleMarkAllRead: () => {
      dispatchDashboardWindowEvent(DASHBOARD_EVENTS.MARK_ALL_READ);
    },
    /**
     * Process the handle mark viewport read.
     */
    handleMarkViewportRead: () => {
      dispatchDashboardWindowEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ);
    },
    /**
     * Process the handle open feeds sidebar.
     */
    handleOpenFeedsSidebar: () => {
      dispatchDashboardWindowEvent(DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR);
    },
    /**
     * Process the handle open settings.
     */
    handleOpenSettings: () => {
      dispatchDashboardWindowEvent(DASHBOARD_EVENTS.OPEN_SETTINGS);
    },
    /**
     * Process the handle refresh.
     */
    handleRefresh: () => {
      if (!isRefreshing) {
        dispatchDashboardWindowEvent(DASHBOARD_EVENTS.REFRESH);
      }
    },
    /**
     * Process the handle refresh from upstream.
     */
    handleRefreshFromUpstream: () => {
      if (!isRefreshing) {
        dispatchDashboardWindowEvent(DASHBOARD_EVENTS.REFRESH, {
          forceResolveUpstream: true,
        });
      }
    },
    /**
     * Process the handle search change.
     * @param term - The term.
     */
    handleSearchChange: (term: string) => {
      setSearch(term);
      dispatchDashboardWindowEvent(DASHBOARD_EVENTS.SEARCH_CHANGE, { term });
    },
  };
}
/**
 * Manage the dashboard toolbar runtime state.
 * @param startInShellLoading - The start in shell loading.
 * @param controlledIsShellLoading - The controlled is shell loading.
 * @returns The dashboard toolbar runtime state and callbacks.
 */
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

/**
 * Manage the dashboard toolbar session actions.
 * @param options - The options used to manage the dashboard toolbar session actions.
 * @returns The dashboard toolbar session actions state and callbacks.
 */
function useDashboardToolbarSessionActions(
  options: DashboardToolbarSessionActionsOptions,
) {
  const {
    isPreviewMode,
    isResetting,
    isSigningOut,
    setIsPreviewMode,
    setIsResetting,
    setIsSigningOut,
  } = options;
  /**
   * Process the navigate to landing.
   */
  const navigateToLanding = async () => {
    await clearClientOriginState();
    setIsPreviewMode(false);
    setDashboardPreviewPersistence(false);
    window.location.assign("/landing");
  };

  return {
    /**
     * Process the handle reset.
     */
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
    /**
     * Process the handle sign out.
     */
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

/**
 * Manage the mounted flag.
 * @returns Whether mounted flag.
 */
function useMountedFlag() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
