"use client";

import { type RefObject, useEffect } from "react";
import { toast } from "sonner";

import { DASHBOARD_EVENTS } from "../constants";
import {
  type FeedSelectionFetchers,
  initializeDashboardSelection,
} from "../services/selection";

import type { CategoryTreeNode } from "@/lib";

/**
 * Options for broadcasting dashboard UI state to decoupled listeners.
 *
 * The dashboard uses window-level custom events to synchronize chrome concerns
 * such as the document title and search widgets that live outside this hook
 * layer.
 */
interface UseDashboardBroadcastsOptions {
  /** Whether the deferred search pipeline is still catching up to current input. */
  isSearchPending: boolean;
  /** Current raw search term entered by the user. */
  searchTerm: string;
  /** Human-readable selected feed label used by title listeners. */
  selectedFeed?: string;
}

/**
 * Options for bootstrapping the dashboard's initial category/feed selection.
 *
 * This extends the shared feed-selection fetchers with the local state and refs
 * needed to ensure the initialization flow runs exactly once per mounted
 * dashboard instance.
 */
type UseDashboardInitializationOptions = FeedSelectionFetchers & {
  /** Ref gate that prevents repeated initialization when dependencies change. */
  hasInitializedDashboardRef: RefObject<boolean>;
  /** Loads the category/feed tree prior to selecting the initial view. */
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  /** Current persisted category key restored from storage. */
  selectedCategory: string;
  /** Toggles sidebar/category loading state during initial selection resolution. */
  setIsCategoriesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  /** Persists the computed initial category selection. */
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
};

/**
 * Options for guarding against indefinitely stuck feed-loading states.
 */
interface UseFeedLoadingTimeoutOptions {
  /** Whether a feed request is currently considered active by the UI. */
  loading: boolean;
  /** Monotonic request epoch used to restart the timeout for each new load. */
  loadingEpoch: number;
  /** Optional custom timeout handler, usually used to cancel an in-flight request. */
  onTimeout?: () => void;
  /** Fallback loading-state setter used when no explicit timeout callback is supplied. */
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  /** Maximum allowed load duration in milliseconds before the request is treated as wedged. */
  timeoutMs: number;
}

/**
 * Emits dashboard state changes as window-level custom events.
 *
 * This keeps shell-level listeners synchronized without tightly coupling them to
 * the dashboard component tree. Each concern is broadcast independently so
 * downstream listeners can subscribe only to the events they care about.
 *
 * @param options Broadcast payload sources derived from dashboard state.
 */
export function useDashboardBroadcasts({
  isSearchPending,
  searchTerm,
  selectedFeed,
}: UseDashboardBroadcastsOptions) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.TITLE_CHANGE, {
        detail: { title: selectedFeed ?? "LibreRSS" },
      }),
    );
  }, [selectedFeed]);

  // Keep external search consumers aligned with the raw input value, not the
  // deferred value used for expensive in-tree filtering work.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SEARCH_SYNC, {
        detail: { term: searchTerm },
      }),
    );
  }, [searchTerm]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SEARCH_PENDING, {
        detail: { pending: isSearchPending },
      }),
    );
  }, [isSearchPending]);
}

/**
 * Runs the one-time dashboard boot sequence.
 *
 * Initialization is intentionally guarded by a mutable ref instead of a stable
 * dependency array hack so the effect remains explicit about the values it uses
 * while still executing only once per mount.
 *
 * @param options Feed-selection fetchers and local state setters needed for boot.
 */
export function useDashboardInitialization({
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  hasInitializedDashboardRef,
  loadFeedSources,
  selectedCategory,
  setIsCategoriesLoading,
  setSelectedCategory,
}: UseDashboardInitializationOptions) {
  useEffect(() => {
    if (hasInitializedDashboardRef.current) {
      return;
    }

    hasInitializedDashboardRef.current = true;

    // Initialization is intentionally fire-and-forget because the service owns
    // its own loading/error side effects and the hook only needs to trigger it.
    void initializeDashboardSelection({
      fetchAllFeeds,
      fetchCategoryFeeds,
      fetchFeed,
      loadFeedSources,
      selectedCategory,
      setIsCategoriesLoading,
      setSelectedCategory,
    });
  }, [
    selectedCategory,
    loadFeedSources,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    setSelectedCategory,
    setIsCategoriesLoading,
    hasInitializedDashboardRef,
  ]);
}

/**
 * Enforces a client-side timeout around feed-loading sessions.
 *
 * If the request lifecycle stalls, the hook either delegates to a caller-supplied
 * timeout handler or clears the loading state directly, then surfaces a toast so
 * the user understands why the spinner disappeared.
 *
 * @param options Active loading state, timeout duration, and recovery behavior.
 */
export function useFeedLoadingTimeout({
  loading,
  loadingEpoch,
  onTimeout,
  setLoading,
  timeoutMs,
}: UseFeedLoadingTimeoutOptions) {
  useEffect(() => {
    if (!loading) {
      return;
    }

    // Re-arm the timeout for each loading epoch so retried requests receive a
    // full timeout window rather than inheriting the previous request's timer.
    const timeoutId = window.setTimeout(() => {
      if (onTimeout) {
        onTimeout();
      } else {
        setLoading(false);
      }
      toast.error("Feed loading timed out.", {
        description: "Please try refreshing the selected source again.",
      });
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loading, loadingEpoch, timeoutMs, setLoading, onTimeout]);
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
  setIsSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>,
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
