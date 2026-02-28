"use client";

import type { CategoryTreeNode } from "@/lib";
import { useEffect } from "react";
import { toast } from "sonner";
import { DASHBOARD_EVENTS } from "../constants";
import {
  initializeDashboardSelection,
  type FeedSelectionFetchers,
} from "../services/selection";

type UseFeedLoadingTimeoutOptions = {
  loading: boolean;
  timeoutMs: number;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useFeedLoadingTimeout({
  loading,
  timeoutMs,
  setLoading,
}: UseFeedLoadingTimeoutOptions) {
  useEffect(() => {
    if (!loading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLoading(false);
      toast.error("Feed loading timed out.", {
        description: "Please try refreshing the selected source again.",
      });
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [loading, timeoutMs, setLoading]);
}

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

export function useRevealSidebarOnMount(
  setIsSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>,
) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsSidebarVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [setIsSidebarVisible]);
}

type UseDashboardInitializationOptions = FeedSelectionFetchers & {
  hasInitializedDashboardRef: React.MutableRefObject<boolean>;
  selectedCategory: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  setIsCategoriesLoading: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useDashboardInitialization({
  hasInitializedDashboardRef,
  selectedCategory,
  loadFeedSources,
  fetchAllFeeds,
  fetchFeed,
  fetchCategoryFeeds,
  setSelectedCategory,
  setIsCategoriesLoading,
}: UseDashboardInitializationOptions) {
  useEffect(() => {
    if (hasInitializedDashboardRef.current) {
      return;
    }

    hasInitializedDashboardRef.current = true;

    void initializeDashboardSelection({
      selectedCategory,
      loadFeedSources,
      fetchAllFeeds,
      fetchFeed,
      fetchCategoryFeeds,
      setSelectedCategory,
      setIsCategoriesLoading,
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

type UseDashboardBroadcastsOptions = {
  selectedFeed?: string;
  searchTerm: string;
};

export function useDashboardBroadcasts({
  selectedFeed,
  searchTerm,
}: UseDashboardBroadcastsOptions) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.TITLE_CHANGE, {
        detail: { title: selectedFeed ?? "LibreRSS" },
      }),
    );
  }, [selectedFeed]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SEARCH_SYNC, {
        detail: { term: searchTerm },
      }),
    );
  }, [searchTerm]);
}
