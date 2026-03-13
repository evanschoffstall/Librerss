"use client";

/**
 * Category state composition: order persistence, category CRUD, feed-source CRUD.
 */

import { useCallback } from "react";

import type { FeedSourceActionState } from "./types";
import { useCategoryCrudActions } from "./useCategoryCrudActions";
import { useCategoryOrderState } from "./useCategoryOrderState";
import { useFeedSourceActions } from "./useFeedSourceActions";

interface UseCategoryManagerOptions extends FeedSourceActionState {
  usePlaceholderData?: boolean;
}

export function useCategoryManager({
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
}: UseCategoryManagerOptions) {
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
    // Feed source actions (delegated)
    addFeedSource: feedSourceActions.addFeedSource,
    // State
    customCategoryLabels: categoryCrudActions.customCategoryLabels,
    // Category actions
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
