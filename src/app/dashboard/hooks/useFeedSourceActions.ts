"use client";

/**
 * Feed-source CRUD: add, remove, rename, import OPML, select, drag-move.
 * Extracted from useCategoryManager so each hook has one responsibility.
 */

import {
  type Article,
  type CategoryTreeNode,
  type OpmlFeedImportEntry,
} from "@/lib";
import { useCallback } from "react";
import {
  addFeedSourceAndRefresh,
  moveFeedByDropAndPersist,
  removeFeedSourceAndRefresh,
  renameFeedSourceAndRefresh,
  selectFeedByKeyFromCategories,
} from "../services/feed-source-operations";
import { importOpmlFeedsAndRefresh } from "../services/opml-import";

interface UseFeedSourceActionsOptions {
  categories: CategoryTreeNode[];
  selectedCategory: string;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  fetchFeed: (url: string) => Promise<void>;
  fetchCategoryFeeds: (categoryNode: CategoryTreeNode) => Promise<void>;
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

  return {
    selectFeedByKey,
    addFeedSource,
    removeFeedSource,
    renameFeedSource,
    moveFeedByDrop,
    importOpmlFeeds,
  };
}
