"use client";

/**
 * Category-tree composition: order persistence, category CRUD, and feed-source CRUD.
 */

import { useCallback } from "react";

import type { FeedSourceActionState } from "@/app/dashboard/hooks/feedSourceActionState";

import { useFeedSourceActions } from "@/app/dashboard/hooks/category-tree/useFeedSourceActions";
import { useCategoryCrudActions } from "@/app/dashboard/hooks/useCategoryCrudActions";
import { useCategoryOrderState } from "@/app/dashboard/hooks/useCategoryOrderState";

/**
 * Describes the options for use dashboard category tree.
 */
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
    loadFeedSources,
    selectedCategory,
    setCategories,
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
  const feedSourceActions = useDashboardFeedSourceActions(
    options,
    categoryCrudActions.ensureCategoryLabelExists,
  );

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

/**
 * Manage the feed-source actions used by the dashboard category tree.
 * @param options - The dashboard category tree options.
 * @param ensureCategoryLabelExists - Ensures imported and moved feeds target a valid category.
 * @returns The feed-source action bundle for the dashboard category tree.
 */
function useDashboardFeedSourceActions(
  options: UseDashboardCategoryTreeOptions,
  ensureCategoryLabelExists: ReturnType<
    typeof useCategoryCrudActions
  >["ensureCategoryLabelExists"],
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
  } = options;

  return useFeedSourceActions({
    categories,
    ensureCategoryLabelExists,
    fetchAllFeeds,
    fetchCategoryFeeds,
    fetchFeed,
    loadFeedSources,
    selectedCategory,
    setCategories,
    setFeed,
    setSelectedCategory,
  });
}
