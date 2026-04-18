"use client";

/**
 * Category-tree composition: order persistence, category CRUD, and feed-source CRUD.
 */

import { useCallback } from "react";

import type { FeedSourceActionState } from "@/app/dashboard/dashboard-hooks/feedSourceActionState";

import { useFeedSourceActions } from "@/app/dashboard/dashboard-hooks/category-tree/useFeedSourceActions";
import { useCategoryCrudActions } from "@/app/dashboard/dashboard-hooks/useCategoryCrudActions";
import { useCategoryOrderState } from "@/app/dashboard/dashboard-hooks/useCategoryOrderState";

interface UseDashboardCategoryTreeOptions extends FeedSourceActionState {
  usePlaceholderData?: boolean;
}

/**
 * Manage the dashboard category tree.
 * @param options - The options used to manage the dashboard category tree.
 * @returns The dashboard category tree state and callbacks.
 */
export function useDashboardCategoryTree(
  options: UseDashboardCategoryTreeOptions,
) {
  const {
    categories,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    loadFeedSources,
    selectedCategory,
    setCategories,
    setFeed,
    setSelectedCategory,
    usePlaceholderData = false,
  } = options;
  const { orderedCategoryLabels, setOrderedCategoryLabels } =
    useCategoryOrderState({ usePlaceholderData });
  const categoryCrudActions = useCategoryCrudActions({
    categories,
    loadFeedSources,
    selectedCategory,
    setCategories,
    setOrderedCategoryLabels,
    setSelectedCategory,
  });

  const feedSourceActions = useFeedSourceActions({
    categories,
    ensureCategoryLabelExists: categoryCrudActions.ensureCategoryLabelExists,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    loadFeedSources,
    selectedCategory,
    setCategories,
    setFeed,
    setSelectedCategory,
  });

  const importOpmlFeeds = useCallback(
    (entries: Parameters<typeof feedSourceActions.importOpmlFeeds>[0]) =>
      feedSourceActions.importOpmlFeeds(entries, {
        setCustomCategoryLabels: categoryCrudActions.setCustomCategoryLabels,
      }),
    [feedSourceActions, categoryCrudActions.setCustomCategoryLabels],
  );

  return {
    addCategory: categoryCrudActions.addCategory,
    addFeedSource: feedSourceActions.addFeedSource,
    customCategoryLabels: categoryCrudActions.customCategoryLabels,
    ensureCategoryLabelExists: categoryCrudActions.ensureCategoryLabelExists,
    importOpmlFeeds,
    moveCategoryByDrop: categoryCrudActions.moveCategoryByDrop,
    moveFeedByDrop: feedSourceActions.moveFeedByDrop,
    orderedCategoryLabels,
    pendingCategoryRemovalLabel:
      categoryCrudActions.pendingCategoryRemovalLabel,
    removeCategory: categoryCrudActions.removeCategory,
    removeFeedSource: feedSourceActions.removeFeedSource,
    renameCategory: categoryCrudActions.renameCategory,
    renameFeedSource: feedSourceActions.renameFeedSource,
    selectFeedByKey: feedSourceActions.selectFeedByKey,
    setFeedSourceEnabled: feedSourceActions.setFeedSourceEnabled,
    setOrderedCategoryLabels,
    updateFeedSettings: feedSourceActions.updateFeedSettings,
  };
}
