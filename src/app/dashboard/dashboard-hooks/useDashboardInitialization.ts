"use client";

import { useEffect } from "react";

import { type UseDashboardInitializationOptions } from "@/app/dashboard/dashboard-hooks/dashboard-effects.contracts";
import { initializeDashboardSelection } from "@/app/dashboard/dashboard-services/selection";

/**
 * Runs the one-time dashboard boot sequence that resolves the initial selection.
 * @param root0
 * @param root0.fetchAllFeeds
 * @param root0.fetchCategoryFeeds
 * @param root0.fetchFeed
 * @param root0.hasInitializedDashboardRef
 * @param root0.initialArticleLimit
 * @param root0.loadFeedSources
 * @param root0.selectedCategory
 * @param root0.setIsCategoriesLoading
 * @param root0.setSelectedCategory
 */
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
