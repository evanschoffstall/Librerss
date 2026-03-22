"use client";

import { type Dispatch, type SetStateAction, useEffect } from "react";

import { type UseDashboardEffectsOptions } from "./dashboard-effects.types";
import { useDashboardBroadcasts } from "./useDashboardBroadcasts";
import { useDashboardInitialization } from "./useDashboardInitialization";
import { useFeedLoadingTimeout } from "./useFeedLoadingTimeout";

/**
 * Options for broadcasting dashboard UI state to decoupled listeners.
 *
 * The dashboard uses window-level custom events to synchronize chrome concerns
 * such as the document title and search widgets that live outside this hook
 * layer.
 */
/**
 * Runs the dashboard's shared effects from one canonical entry point.
 *
 * Grouping these related effects behind a single exported hook keeps the
 * controller focused on state composition while this module owns the mount,
 * timeout, initialization, and broadcast side effects.
 *
 * @param options Dashboard effect inputs sourced from controller state.
 */
export function useDashboardEffects({
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  hasInitializedDashboardRef,
  isSearchPending,
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
    loadFeedSources,
    selectedCategory,
    setIsCategoriesLoading,
    setSelectedCategory,
  });
  useDashboardBroadcasts({
    isSearchPending,
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
 * @param setIsSidebarVisible Sidebar visibility state setter from the controller.
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
