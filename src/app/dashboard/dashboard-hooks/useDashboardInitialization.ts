"use client";

import { useEffect } from "react";

import { type UseDashboardInitializationOptions } from "@/app/dashboard/dashboard-hooks/dashboard-effects.contracts";
import { initializeDashboardSelection } from "@/app/dashboard/dashboard-services/selection";

/** Runs the one-time dashboard boot sequence that resolves the initial selection. */
export function useDashboardInitialization({
  fetchAllFeeds,
  fetchCategoryFeeds,
  fetchFeed,
  hasInitializedDashboardRef,
  initialArticleLimit,
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
      initialArticleLimit,
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
    initialArticleLimit,
    setSelectedCategory,
    setIsCategoriesLoading,
    hasInitializedDashboardRef,
  ]);
}
