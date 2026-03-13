"use client";

/**
 * Feed-source CRUD: add, remove, rename, import OPML, select, drag-move.
 * Extracted from useCategoryManager so each hook has one responsibility.
 */

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

import type { FeedSourceActionState } from "./types";

import { type OpmlFeedImportEntry } from "@/lib";

interface UseFeedSourceActionsOptions extends FeedSourceActionState {
  ensureCategoryLabelExists: (label: string) => void;
}

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
        category,
        fetchFeed,
        loadFeedSources,
        name,
        setSelectedCategory,
        url,
      });
    },
    [loadFeedSources, setSelectedCategory, fetchFeed],
  );

  const removeFeedSource = useCallback(
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
        loadFeedSources,
        nextName,
        nextUrl,
      });
    },
    [categories, loadFeedSources],
  );

  const moveFeedByDrop = useCallback(
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
    [categories, setCategories, ensureCategoryLabelExists, loadFeedSources],
  );

  const setFeedSourceEnabled = useCallback(
    async (key: string, enabled: boolean) => {
      return setFeedSourceEnabledAndRefresh({
        categories,
        enabled,
        fetchAllFeeds,
        fetchFeed,
        key,
        loadFeedSources,
        selectedCategory,
        setSelectedCategory,
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
        loadFeedSources,
        settings,
      });
    },
    [categories, loadFeedSources],
  );

  return {
    addFeedSource,
    importOpmlFeeds,
    moveFeedByDrop,
    removeFeedSource,
    renameFeedSource,
    selectFeedByKey,
    setFeedSourceEnabled,
    updateFeedSettings,
  };
}
