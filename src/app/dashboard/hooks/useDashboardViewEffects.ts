"use client";

import { type RefObject, useEffect } from "react";
import { toast } from "sonner";

import { DASHBOARD_EVENTS } from "../constants";
import {
  type FeedSelectionFetchers,
  initializeDashboardSelection,
} from "../services/selection";

import type { CategoryTreeNode } from "@/lib";

interface UseDashboardBroadcastsOptions {
  searchTerm: string;
  selectedFeed?: string;
}

type UseDashboardInitializationOptions = FeedSelectionFetchers & {
  hasInitializedDashboardRef: RefObject<boolean>;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setIsCategoriesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
};

interface UseFeedLoadingTimeoutOptions {
  loading: boolean;
  loadingEpoch: number;
  onTimeout?: () => void;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  timeoutMs: number;
}

export function useDashboardBroadcasts({
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

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SEARCH_SYNC, {
        detail: { term: searchTerm },
      }),
    );
  }, [searchTerm]);
}

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
    const frame = window.requestAnimationFrame(() => {
      setIsSidebarVisible(true);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [setIsSidebarVisible]);
}
