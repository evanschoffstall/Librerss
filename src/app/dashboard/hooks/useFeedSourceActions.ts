"use client";

/**
 * Feed-source CRUD: add, remove, rename, import OPML, select, drag-move.
 * Extracted from useCategoryManager so each hook has one responsibility.
 */

import { type OpmlFeedImportEntry } from "@/lib";
import { useCallback } from "react";
import {
  addFeedSourceAndRefresh,
  moveFeedByDropAndPersist,
  removeFeedSourceAndRefresh,
  renameFeedSourceAndRefresh,
  selectFeedByKeyFromCategories,
  setFeedSourceEnabledAndRefresh,
  updateFeedSettingsAndRefresh,
} from "../services/feed-source-operations";
import { importOpmlFeedsAndRefresh } from "../services/opml-import";
import type { FeedSourceActionState } from "./feedSourceActionTypes";

interface UseFeedSourceActionsOptions extends FeedSourceActionState {
  ensureCategoryLabelExists: (label: string) => void;
}

export function useFeedSourceActions({
  categories,
  selectedCategory,
  setCategories,
  setSelectedCategory,
  setFeed,
  loadFeedSources,
  fetchFeed,
  fetchAllFeeds,
  fetchCategoryFeeds,
  ensureCategoryLabelExists,
}: UseFeedSourceActionsOptions) {
  const selectFeedByKey = useCallback(
    (key: string) => {
      selectFeedByKeyFromCategories(
        categories,
        key,
        setSelectedCategory,
        fetchFeed,
      );
    },
    [categories, setSelectedCategory, fetchFeed],
  );

  const addFeedSource = useCallback(
    async (name: string, url: string, category: string) => {
      return addFeedSourceAndRefresh({
        name,
        url,
        category,
        loadFeedSources,
        setSelectedCategory,
        fetchFeed,
      });
    },
    [loadFeedSources, setSelectedCategory, fetchFeed],
  );

  const removeFeedSource = useCallback(
    async (key: string) => {
      await removeFeedSourceAndRefresh({
        categories,
        selectedCategory,
        key,
        loadFeedSources,
        setSelectedCategory,
        setFeed,
        fetchFeed,
        fetchCategoryFeeds,
      });
    },
    [
      categories,
      selectedCategory,
      loadFeedSources,
      setSelectedCategory,
      setFeed,
      fetchFeed,
      fetchCategoryFeeds,
    ],
  );

  const renameFeedSource = useCallback(
    async (key: string, nextName: string, nextUrl: string) => {
      return renameFeedSourceAndRefresh({
        categories,
        key,
        nextName,
        nextUrl,
        loadFeedSources,
      });
    },
    [categories, loadFeedSources],
  );

  const moveFeedByDrop = useCallback(
    async (key: string, targetCategory: string, targetIndex: number) => {
      await moveFeedByDropAndPersist({
        categories,
        key,
        targetCategory,
        targetIndex,
        setCategories,
        ensureCategoryLabelExists,
        loadFeedSources,
      });
    },
    [categories, setCategories, ensureCategoryLabelExists, loadFeedSources],
  );

  const setFeedSourceEnabled = useCallback(
    async (key: string, enabled: boolean) => {
      return setFeedSourceEnabledAndRefresh({
        categories,
        selectedCategory,
        key,
        enabled,
        setSelectedCategory,
        loadFeedSources,
        fetchFeed,
        fetchAllFeeds,
      });
    },
    [
      categories,
      selectedCategory,
      setSelectedCategory,
      loadFeedSources,
      fetchFeed,
      fetchAllFeeds,
    ],
  );

  const importOpmlFeeds = useCallback(
    async (
      entries: OpmlFeedImportEntry[],
      {
        setCustomCategoryLabels,
      }: {
        setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
      },
    ) =>
      importOpmlFeedsAndRefresh({
        entries,
        categories,
        selectedCategory,
        setCustomCategoryLabels,
        setSelectedCategory,
        loadFeedSources,
        fetchFeed,
      }),
    [
      categories,
      selectedCategory,
      loadFeedSources,
      setSelectedCategory,
      fetchFeed,
    ],
  );

  const updateFeedSettings = useCallback(
    async (
      key: string,
      settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
    ) => {
      return updateFeedSettingsAndRefresh({
        categories,
        key,
        settings,
        loadFeedSources,
      });
    },
    [categories, loadFeedSources],
  );

  return {
    selectFeedByKey,
    addFeedSource,
    removeFeedSource,
    renameFeedSource,
    setFeedSourceEnabled,
    updateFeedSettings,
    moveFeedByDrop,
    importOpmlFeeds,
  };
}
