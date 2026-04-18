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
 * Manage the feed source actions.
 * @param options - The options used to manage the feed source actions.
 * @returns The feed source actions state and callbacks.
 */
export function useFeedSourceActions(options: UseFeedSourceActionsOptions) {
  const {
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
  } = options;
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
 * Manage the feed source category mutation actions.
 * @param options - The options used to manage the feed source category mutation actions.
 * @returns The feed source category mutation actions state and callbacks.
 */
function useFeedSourceCategoryMutationActions(
  options: FeedSourceCategoryMutationOptions,
) {
  const {
    categories,
    ensureCategoryLabelExists,
    fetchCategoryFeeds,
    fetchFeed,
    loadFeedSources,
    selectedCategory,
    setCategories,
    setFeed,
    setSelectedCategory,
  } = options;
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
 * Manage the feed source crud actions.
 * @param options - The options used to manage the feed source crud actions.
 * @returns The feed source crud actions state and callbacks.
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
 * Manage the feed source import actions.
 * @param options - The options used to manage the feed source import actions.
 * @returns The feed source import actions state and callbacks.
 */
function useFeedSourceImportActions(
  options: Pick<
    UseFeedSourceActionsOptions,
    | "categories"
    | "fetchFeed"
    | "loadFeedSources"
    | "selectedCategory"
    | "setSelectedCategory"
  >,
) {
  const {
    categories,
    fetchFeed,
    loadFeedSources,
    selectedCategory,
    setSelectedCategory,
  } = options;
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
 * Manage the feed source mutation actions.
 * @param options - The options used to manage the feed source mutation actions.
 * @returns The feed source mutation actions state and callbacks.
 */
function useFeedSourceMutationActions(
  options: Omit<UseFeedSourceActionsOptions, never>,
) {
  const {
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
  } = options;
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
 * Manage the feed source selection actions.
 * @param options - The options used to manage the feed source selection actions.
 * @returns The feed source selection actions state and callbacks.
 */
function useFeedSourceSelectionActions(
  options: Pick<
    UseFeedSourceActionsOptions,
    "categories" | "fetchFeed" | "setSelectedCategory"
  >,
) {
  const { categories, fetchFeed, setSelectedCategory } = options;
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
 * Manage the feed source settings actions.
 * @param options - The options used to manage the feed source settings actions.
 * @returns The feed source settings actions state and callbacks.
 */
function useFeedSourceSettingsActions(
  options: Pick<
    UseFeedSourceActionsOptions,
    | "categories"
    | "fetchAllFeeds"
    | "fetchFeed"
    | "loadFeedSources"
    | "selectedCategory"
    | "setSelectedCategory"
  >,
) {
  const {
    categories,
    fetchAllFeeds,
    fetchFeed,
    loadFeedSources,
    selectedCategory,
    setSelectedCategory,
  } = options;
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
