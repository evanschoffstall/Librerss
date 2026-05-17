"use client";

import { useEffect } from "react";

import { type UseDashboardInitializationOptions } from "@/app/dashboard/dashboard-hooks/dashboard-effects.contracts";
import { initializeDashboardSelection } from "@/app/dashboard/dashboard-services/selection";

/**
 * Manage the dashboard initialization.
 * @param options - The options used to manage the dashboard initialization.
 */
export function useDashboardInitialization(
  options: UseDashboardInitializationOptions,
) {
  const {
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
  } = options;
  useEffect(() => {
    if (!hasHydratedPersistedPreferences) {
      return;
    }

    if (hasInitializedDashboardRef.current) {
      return;
    }

    hasInitializedDashboardRef.current = true;

    void initializeDashboardSelection({
      articleFilter,
      articleSortOrder,
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
    articleFilter,
    articleSortOrder,
    hasHydratedPersistedPreferences,
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
