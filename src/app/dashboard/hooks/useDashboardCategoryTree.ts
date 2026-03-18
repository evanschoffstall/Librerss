"use client";

/**
 * Category-tree composition: order persistence, category CRUD, and feed-source CRUD.
 */

import { useCallback } from "react";

import type { FeedSourceActionState } from "./types";

import { useCategoryCrudActions } from "./useCategoryCrudActions";
import { useCategoryOrderState } from "./useCategoryOrderState";
import { useFeedSourceActions } from "./useFeedSourceActions";

interface UseDashboardCategoryTreeOptions extends FeedSourceActionState {
  usePlaceholderData?: boolean;
}

/**
 * Composes the dashboard's category tree state and mutations.
 *
 * This hook owns the ordered category labels, custom-category state, and all
 * feed-source/category mutations that reshape the sidebar tree.
 *
 * @param options Category tree state, fetchers, and persistence setters.
 * @returns Category tree state and mutations consumed by dashboard settings and sidebar flows.
 */
export function useDashboardCategoryTree({
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
}: UseDashboardCategoryTreeOptions) {
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
