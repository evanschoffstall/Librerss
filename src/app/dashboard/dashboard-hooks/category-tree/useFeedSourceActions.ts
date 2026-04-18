"use client";

import { useCallback } from "react";

import type { FeedSourceActionState } from "@/app/dashboard/dashboard-hooks/feedSourceActionState";
import type { OpmlFeedImportEntry } from "@/lib/utils";

import {
  addFeedSourceAndRefresh,
  importOpmlFeedsAndRefresh,
  moveFeedByDropAndPersist,
  removeFeedSourceAndRefresh,
  renameFeedSourceAndRefresh,
  selectFeedByKeyFromCategories,
  setFeedSourceEnabledAndRefresh,
  updateFeedSettingsAndRefresh,
} from "@/app/dashboard/dashboard-services/feed-data/source";

type FeedSourceCategoryMutationOptions = Pick<
  UseFeedSourceActionsOptions,
  | "categories"
  | "ensureCategoryLabelExists"
  | "fetchCategoryFeeds"
  | "fetchFeed"
  | "loadFeedSources"
  | "selectedCategory"
  | "setCategories"
  | "setFeed"
  | "setSelectedCategory"
>;

interface UseFeedSourceActionsOptions extends FeedSourceActionState {
  ensureCategoryLabelExists: (label: string) => void;
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.ensureCategoryLabelExists
 * @param root0.fetchAllFeeds
 * @param root0.fetchCategoryFeeds
 * @param root0.fetchFeed
 * @param root0.loadFeedSources
 * @param root0.selectedCategory
 * @param root0.setCategories
 * @param root0.setFeed
 * @param root0.setSelectedCategory
 */
export function useFeedSourceActions({
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
}: UseFeedSourceActionsOptions) {
  const selectionActions = useFeedSourceSelectionActions({
    categories,
    fetchFeed,
    setSelectedCategory,
  });
  const mutationActions = useFeedSourceMutationActions({
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

  return {
    ...mutationActions,
    ...selectionActions,
  };
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.ensureCategoryLabelExists
 * @param root0.fetchCategoryFeeds
 * @param root0.fetchFeed
 * @param root0.loadFeedSources
 * @param root0.selectedCategory
 * @param root0.setCategories
 * @param root0.setFeed
 * @param root0.setSelectedCategory
 */
function useFeedSourceCategoryMutationActions({
  categories,
  ensureCategoryLabelExists,
  fetchCategoryFeeds,
  fetchFeed,
  loadFeedSources,
  selectedCategory,
  setCategories,
  setFeed,
  setSelectedCategory,
}: FeedSourceCategoryMutationOptions) {
  return {
    moveFeedByDrop: useCallback(
      async (key: string, targetCategory: string, targetIndex: number) => {
        await moveFeedByDropAndPersist({
          categories,
          ensureCategoryLabelExists,
          key,
          loadFeedSources,
          setCategories,
          targetCategory,
          targetIndex,
        });
      },
      [categories, ensureCategoryLabelExists, loadFeedSources, setCategories],
    ),
    removeFeedSource: useCallback(
      async (key: string) => {
        await removeFeedSourceAndRefresh({
          categories,
          fetchCategoryFeeds,
          fetchFeed,
          key,
          loadFeedSources,
          selectedCategory,
          setFeed,
          setSelectedCategory,
        });
      },
      [
        categories,
        fetchCategoryFeeds,
        fetchFeed,
        loadFeedSources,
        selectedCategory,
        setFeed,
        setSelectedCategory,
      ],
    ),
  };
}

/**
 * @param options
 */
function useFeedSourceCrudActions(options: FeedSourceCategoryMutationOptions) {
  return {
    ...useFeedSourceImportActions({
      categories: options.categories,
      fetchFeed: options.fetchFeed,
      loadFeedSources: options.loadFeedSources,
      selectedCategory: options.selectedCategory,
      setSelectedCategory: options.setSelectedCategory,
    }),
    ...useFeedSourceCategoryMutationActions(options),
  };
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.fetchFeed
 * @param root0.loadFeedSources
 * @param root0.selectedCategory
 * @param root0.setSelectedCategory
 */
function useFeedSourceImportActions({
  categories,
  fetchFeed,
  loadFeedSources,
  selectedCategory,
  setSelectedCategory,
}: Pick<
  UseFeedSourceActionsOptions,
  | "categories"
  | "fetchFeed"
  | "loadFeedSources"
  | "selectedCategory"
  | "setSelectedCategory"
>) {
  return {
    addFeedSource: useCallback(
      async (name: string, url: string, category: string) =>
        addFeedSourceAndRefresh({
          category,
          fetchFeed,
          loadFeedSources,
          name,
          setSelectedCategory,
          url,
        }),
      [fetchFeed, loadFeedSources, setSelectedCategory],
    ),
    importOpmlFeeds: useCallback(
      async (
        entries: OpmlFeedImportEntry[],
        {
          setCustomCategoryLabels,
        }: {
          setCustomCategoryLabels: React.Dispatch<
            React.SetStateAction<string[]>
          >;
        },
      ) =>
        importOpmlFeedsAndRefresh({
          categories,
          entries,
          fetchFeed,
          loadFeedSources,
          selectedCategory,
          setCustomCategoryLabels,
          setSelectedCategory,
        }),
      [
        categories,
        fetchFeed,
        loadFeedSources,
        selectedCategory,
        setSelectedCategory,
      ],
    ),
  };
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.ensureCategoryLabelExists
 * @param root0.fetchAllFeeds
 * @param root0.fetchCategoryFeeds
 * @param root0.fetchFeed
 * @param root0.loadFeedSources
 * @param root0.selectedCategory
 * @param root0.setCategories
 * @param root0.setFeed
 * @param root0.setSelectedCategory
 */
function useFeedSourceMutationActions({
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
}: Omit<UseFeedSourceActionsOptions, never>) {
  return {
    ...useFeedSourceCrudActions({
      categories,
      ensureCategoryLabelExists,
      fetchCategoryFeeds,
      fetchFeed,
      loadFeedSources,
      selectedCategory,
      setCategories,
      setFeed,
      setSelectedCategory,
    }),
    ...useFeedSourceSettingsActions({
      categories,
      fetchAllFeeds,
      fetchFeed,
      loadFeedSources,
      selectedCategory,
      setSelectedCategory,
    }),
  };
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.fetchFeed
 * @param root0.setSelectedCategory
 */
function useFeedSourceSelectionActions({
  categories,
  fetchFeed,
  setSelectedCategory,
}: Pick<
  UseFeedSourceActionsOptions,
  "categories" | "fetchFeed" | "setSelectedCategory"
>) {
  return {
    selectFeedByKey: useCallback(
      (key: string) => {
        selectFeedByKeyFromCategories(
          categories,
          key,
          setSelectedCategory,
          fetchFeed,
        );
      },
      [categories, fetchFeed, setSelectedCategory],
    ),
  };
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.fetchAllFeeds
 * @param root0.fetchFeed
 * @param root0.loadFeedSources
 * @param root0.selectedCategory
 * @param root0.setSelectedCategory
 */
function useFeedSourceSettingsActions({
  categories,
  fetchAllFeeds,
  fetchFeed,
  loadFeedSources,
  selectedCategory,
  setSelectedCategory,
}: Pick<
  UseFeedSourceActionsOptions,
  | "categories"
  | "fetchAllFeeds"
  | "fetchFeed"
  | "loadFeedSources"
  | "selectedCategory"
  | "setSelectedCategory"
>) {
  return {
    renameFeedSource: useCallback(
      async (key: string, nextName: string, nextUrl: string) =>
        renameFeedSourceAndRefresh({
          categories,
          key,
          loadFeedSources,
          nextName,
          nextUrl,
        }),
      [categories, loadFeedSources],
    ),
    setFeedSourceEnabled: useCallback(
      async (key: string, enabled: boolean) =>
        setFeedSourceEnabledAndRefresh({
          categories,
          enabled,
          fetchAllFeeds,
          fetchFeed,
          key,
          loadFeedSources,
          selectedCategory,
          setSelectedCategory,
        }),
      [
        categories,
        fetchAllFeeds,
        fetchFeed,
        loadFeedSources,
        selectedCategory,
        setSelectedCategory,
      ],
    ),
    updateFeedSettings: useCallback(
      async (
        key: string,
        settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
      ) =>
        updateFeedSettingsAndRefresh({
          categories,
          key,
          loadFeedSources,
          settings,
        }),
      [categories, loadFeedSources],
    ),
  };
}
