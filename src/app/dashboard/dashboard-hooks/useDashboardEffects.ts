"use client";

import { type Dispatch, type SetStateAction, useEffect } from "react";

import { type UseDashboardEffectsOptions } from "@/app/dashboard/dashboard-hooks/dashboard-effects.contracts";
import { useDashboardBroadcasts } from "@/app/dashboard/dashboard-hooks/useDashboardBroadcasts";
import { useDashboardInitialization } from "@/app/dashboard/dashboard-hooks/useDashboardInitialization";
import { useFeedLoadingTimeout } from "@/app/dashboard/dashboard-hooks/useFeedLoadingTimeout";

/**
 * Runs the dashboard's shared effects from one canonical entry point.
 *
 * Grouping these related effects behind a single exported hook keeps the
 * controller focused on state composition while this module owns the mount,
 * timeout, initialization, and broadcast side effects.
 *
 * @param options - Dashboard effect inputs sourced from controller state.
 * @param options.fetchAllFeeds
 * @param options.fetchCategoryFeeds
 * @param options.fetchFeed
 * @param options.hasInitializedDashboardRef
 * @param options.initialArticleLimit
 * @param options.isSearchPending
 * @param options.isShellLoading
 * @param options.loadFeedSources
 * @param options.loading
 * @param options.loadingEpoch
 * @param options.onTimeout
 * @param options.searchTerm
 * @param options.selectedCategory
 * @param options.selectedFeed
 * @param options.setIsCategoriesLoading
 * @param options.setIsSidebarVisible
 * @param options.setLoading
 * @param options.setSelectedCategory
 * @param options.timeoutMs
 */
export function useDashboardEffects({
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
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
}: UseDashboardEffectsOptions) {
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
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
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
 * Locks page-level scrolling while the dashboard owns the viewport.
 *
 * The dashboard renders its own nested scroll surfaces, so document scrolling is
 * suppressed to avoid double-scroll behavior and layout jitter on mobile.
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
 * Reveals the sidebar after the first animation frame.
 *
 * Deferring the visibility flip until the next frame allows entry transitions to
 * run after the initial DOM commit instead of being swallowed by mount-time
 * layout.
 *
 * @param setIsSidebarVisible - Sidebar visibility state setter from the controller.
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
