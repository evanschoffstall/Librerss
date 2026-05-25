"use client";

import { type Dispatch, type SetStateAction, useEffect } from "react";

import { type UseDashboardEffectsOptions } from "@/app/dashboard/hooks/dashboard-effects.contracts";
import { useDashboardBroadcasts } from "@/app/dashboard/hooks/useDashboardBroadcasts";
import { useDashboardInitialization } from "@/app/dashboard/hooks/useDashboardInitialization";
import { useFeedLoadingTimeout } from "@/app/dashboard/hooks/useFeedLoadingTimeout";

/**
 * Manage the dashboard effects.
 * @param options - The options used to manage the dashboard effects.
 */
export function useDashboardEffects(options: UseDashboardEffectsOptions) {
  const {
    articleFilter,
    articleSortOrder,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasHydratedPersistedPreferences,
    hasInitializedDashboardRef,
    initialArticleLimit,
    isSearchPending,
    isShellLoading,
    loadFeedSources,
    loading,
    loadingEpoch,
    onTimeout,
    searchTerm,
    selectedCategory,
    selectedFeed,
    setIsCategoriesLoading,
    setIsSidebarVisible,
    setLoading,
    setSelectedCategory,
    timeoutMs,
  } = options;
  useFeedLoadingTimeout({
    loading,
    loadingEpoch,
    onTimeout,
    setLoading,
    timeoutMs,
  });
  useLockDocumentScroll();
  useRevealSidebarOnMount(setIsSidebarVisible);
  useDashboardInitialization({
    articleFilter,
    articleSortOrder,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    hasHydratedPersistedPreferences,
    hasInitializedDashboardRef,
    initialArticleLimit,
    loadFeedSources,
    selectedCategory,
    setIsCategoriesLoading,
    setSelectedCategory,
  });
  useDashboardBroadcasts({
    isSearchPending,
    isShellLoading,
    searchTerm,
    selectedFeed,
  });
}

/**
 * Manage the lock document scroll.
 */
export function useLockDocumentScroll() {
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);
}

/**
 * Manage the reveal sidebar on mount.
 * @param setIsSidebarVisible - The set is sidebar visible.
 */
export function useRevealSidebarOnMount(
  setIsSidebarVisible: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsSidebarVisible(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [setIsSidebarVisible]);
}
