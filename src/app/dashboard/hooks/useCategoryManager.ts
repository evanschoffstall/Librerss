"use client";

/**
 * Category CRUD: add, rename, remove, reorder.
 * Feed-source CRUD lives in useFeedSourceActions.
 */

import {
  FeedService,
  includesCategoryLabel,
  type Article,
  type CategoryTreeNode,
} from "@/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasCategoryLabelInTree } from "../services/category-labels";
import {
  addCategoryLabel,
  moveCategoryByDropInOrder,
  removeCategoryAndRefresh,
  renameCategoryAndRefresh,
} from "../services/category-operations";
import { useFeedSourceActions } from "./useFeedSourceActions";

interface UseCategoryManagerOptions {
  categories: CategoryTreeNode[];
  selectedCategory: string;
  setCategories: React.Dispatch<React.SetStateAction<CategoryTreeNode[]>>;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  fetchFeed: (url: string) => Promise<void>;
  fetchCategoryFeeds: (categoryNode: CategoryTreeNode) => Promise<void>;
}

export function useCategoryManager({
  categories,
  selectedCategory,
  setCategories,
  setSelectedCategory,
  setFeed,
  loadFeedSources,
  fetchFeed,
  fetchCategoryFeeds,
}: UseCategoryManagerOptions) {
  const [customCategoryLabels, setCustomCategoryLabels] = useState<string[]>(
    [],
  );
  const [orderedCategoryLabels, setOrderedCategoryLabels] = useState<string[]>(
    [],
  );
  const [pendingCategoryRemovalLabel, setPendingCategoryRemovalLabel] =
    useState<string | null>(null);
  const hasLoadedOrderRef = useRef(false);
  const savePendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load category order from DB on mount
  useEffect(() => {
    if (hasLoadedOrderRef.current) return;
    hasLoadedOrderRef.current = true;
    void FeedService.getCategoryOrder()
      .then((labels) => {
        if (labels.length > 0) {
          setOrderedCategoryLabels(labels);
        }
      })
      .catch(() => {
        // Silently ignore — will fall back to default ordering
      });
  }, []);

  // Debounced save to DB whenever order changes
  const hasMountedRef = useRef(false);
  useEffect(() => {
    // Skip the initial render and the initial DB load
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (orderedCategoryLabels.length === 0) return;

    if (savePendingRef.current) {
      clearTimeout(savePendingRef.current);
    }
    savePendingRef.current = setTimeout(() => {
      void FeedService.saveCategoryOrder(orderedCategoryLabels).catch(() => {
        // Silently ignore save errors
      });
    }, 500);

    return () => {
      if (savePendingRef.current) {
        clearTimeout(savePendingRef.current);
      }
    };
  }, [orderedCategoryLabels]);

  const ensureCategoryLabelExists = useCallback(
    (label: string) => {
      setCustomCategoryLabels((current) => {
        if (includesCategoryLabel(current, label)) return current;
        if (hasCategoryLabelInTree(categories, label)) {
          return current;
        }

        return [...current, label];
      });

      setOrderedCategoryLabels((current) => {
        if (includesCategoryLabel(current, label)) return current;
        return [...current, label];
      });
    },
    [categories],
  );

  const feedSourceActions = useFeedSourceActions({
    categories,
    selectedCategory,
    setCategories,
    setSelectedCategory,
    setFeed,
    loadFeedSources,
    fetchFeed,
    fetchCategoryFeeds,
    ensureCategoryLabelExists,
  });

  const addCategory = useCallback(
    (label: string) =>
      addCategoryLabel({
        label,
        categories,
        customCategoryLabels,
        setCustomCategoryLabels,
      }),
    [categories, customCategoryLabels, setCustomCategoryLabels],
  );

  const renameCategory = useCallback(
    async (currentLabel: string, nextLabel: string) => {
      return renameCategoryAndRefresh({
        categories,
        customCategoryLabels,
        selectedCategory,
        currentLabel,
        nextLabel,
        setCustomCategoryLabels,
        setOrderedCategoryLabels,
        setSelectedCategory,
        loadFeedSources,
      });
    },
    [
      categories,
      customCategoryLabels,
      selectedCategory,
      setCustomCategoryLabels,
      setOrderedCategoryLabels,
      loadFeedSources,
      setSelectedCategory,
    ],
  );

  const moveCategoryByDrop = useCallback(
    async (label: string, targetIndex: number) =>
      setOrderedCategoryLabels((current) =>
        moveCategoryByDropInOrder(current, label, targetIndex),
      ),
    [],
  );

  const removeCategory = useCallback(
    async (label: string) =>
      removeCategoryAndRefresh({
        categories,
        customCategoryLabels,
        pendingCategoryRemovalLabel,
        selectedCategory,
        label,
        setPendingCategoryRemovalLabel,
        setCategories,
        setCustomCategoryLabels,
        setOrderedCategoryLabels,
        setSelectedCategory,
        ensureCategoryLabelExists,
        loadFeedSources,
      }),
    [
      categories,
      customCategoryLabels,
      pendingCategoryRemovalLabel,
      selectedCategory,
      setCategories,
      ensureCategoryLabelExists,
      setCustomCategoryLabels,
      setOrderedCategoryLabels,
      loadFeedSources,
      setSelectedCategory,
    ],
  );

  const importOpmlFeeds = useCallback(
    (entries: Parameters<typeof feedSourceActions.importOpmlFeeds>[0]) =>
      feedSourceActions.importOpmlFeeds(entries, { setCustomCategoryLabels }),
    [feedSourceActions],
  );

  return {
    // State
    customCategoryLabels,
    orderedCategoryLabels,
    setOrderedCategoryLabels,
    pendingCategoryRemovalLabel,
    // Category actions
    ensureCategoryLabelExists,
    addCategory,
    renameCategory,
    moveCategoryByDrop,
    removeCategory,
    // Feed source actions (delegated)
    addFeedSource: feedSourceActions.addFeedSource,
    removeFeedSource: feedSourceActions.removeFeedSource,
    renameFeedSource: feedSourceActions.renameFeedSource,
    moveFeedByDrop: feedSourceActions.moveFeedByDrop,
    selectFeedByKey: feedSourceActions.selectFeedByKey,
    importOpmlFeeds,
  };
}
