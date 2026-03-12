"use client";

/**
 * Category CRUD: add, rename, remove, reorder.
 * Feed-source CRUD lives in useFeedSourceActions.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  addCategoryLabel,
  moveCategoryByDropInOrder,
  removeCategoryAndRefresh,
  renameCategoryAndRefresh,
} from "../services/category-operations";
import { hasCategoryLabelInTree } from "../services/category-tree";

import type { FeedSourceActionState } from "./types";
import { useFeedSourceActions } from "./useFeedSourceActions";

import { FeedService, includesCategoryLabel } from "@/lib";

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
  const [customCategoryLabels, setCustomCategoryLabels] = useState<string[]>(
    [],
  );
  const [orderedCategoryLabels, setOrderedCategoryLabels] = useState<string[]>(
    [],
  );
  const [pendingCategoryRemovalLabel, setPendingCategoryRemovalLabel] =
    useState<null | string>(null);
  const hasLoadedOrderRef = useRef(false);
  const savePendingRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  // Load category order from DB on mount (skip in placeholder/preview mode)
  useEffect(() => {
    if (usePlaceholderData) return;
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
  }, [usePlaceholderData]);

  // Debounced save to DB whenever order changes
  const hasMountedRef = useRef(false);
  useEffect(() => {
    // Skip the initial render and the initial DB load
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (orderedCategoryLabels.length === 0) return;
    if (usePlaceholderData) return;

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
  }, [orderedCategoryLabels, usePlaceholderData]);

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

  const addCategory = useCallback(
    (label: string) =>
      addCategoryLabel({
        categories,
        customCategoryLabels,
        label,
        setCustomCategoryLabels,
      }),
    [categories, customCategoryLabels, setCustomCategoryLabels],
  );

  const renameCategory = useCallback(
    async (currentLabel: string, nextLabel: string) => {
      return renameCategoryAndRefresh({
        categories,
        currentLabel,
        customCategoryLabels,
        loadFeedSources,
        nextLabel,
        selectedCategory,
        setCustomCategoryLabels,
        setOrderedCategoryLabels,
        setSelectedCategory,
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
    async (label: string, targetIndex: number) => {
      setOrderedCategoryLabels((current) =>
        moveCategoryByDropInOrder(current, label, targetIndex),
      );
    },
    [],
  );

  const removeCategory = useCallback(
    async (label: string) =>
      removeCategoryAndRefresh({
        categories,
        customCategoryLabels,
        ensureCategoryLabelExists,
        label,
        loadFeedSources,
        pendingCategoryRemovalLabel,
        selectedCategory,
        setCategories,
        setCustomCategoryLabels,
        setOrderedCategoryLabels,
        setPendingCategoryRemovalLabel,
        setSelectedCategory,
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
    addCategory,
    // Feed source actions (delegated)
    addFeedSource: feedSourceActions.addFeedSource,
    // State
    customCategoryLabels,
    // Category actions
    ensureCategoryLabelExists,
    importOpmlFeeds,
    moveCategoryByDrop,
    moveFeedByDrop: feedSourceActions.moveFeedByDrop,
    orderedCategoryLabels,
    pendingCategoryRemovalLabel,
    removeCategory,
    removeFeedSource: feedSourceActions.removeFeedSource,
    renameCategory,
    renameFeedSource: feedSourceActions.renameFeedSource,
    selectFeedByKey: feedSourceActions.selectFeedByKey,
    setFeedSourceEnabled: feedSourceActions.setFeedSourceEnabled,
    setOrderedCategoryLabels,
    updateFeedSettings: feedSourceActions.updateFeedSettings,
  };
}
