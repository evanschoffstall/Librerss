"use client";

import { useCallback, useState } from "react";

import { includesCategoryLabel } from "@/lib";

import type { FeedSourceActionState } from "./types";

import {
  addCategoryLabel,
  moveCategoryByDropInOrder,
  removeCategoryAndRefresh,
  renameCategoryAndRefresh,
} from "../services/category-operations";
import { hasCategoryLabelInTree } from "../services/category-tree";

interface UseCategoryCrudActionsOptions extends Omit<
  FeedSourceActionState,
  "fetchAllFeeds" | "fetchCategoryFeeds" | "fetchFeed" | "setFeed"
> {
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useCategoryCrudActions({
  categories,
  loadFeedSources,
  selectedCategory,
  setCategories,
  setOrderedCategoryLabels,
  setSelectedCategory,
}: UseCategoryCrudActionsOptions) {
  const [customCategoryLabels, setCustomCategoryLabels] = useState<string[]>(
    [],
  );
  const [pendingCategoryRemovalLabel, setPendingCategoryRemovalLabel] =
    useState<null | string>(null);

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
    [categories, setOrderedCategoryLabels],
  );

  const addCategory = useCallback(
    (label: string) =>
      addCategoryLabel({
        categories,
        customCategoryLabels,
        label,
        setCustomCategoryLabels,
      }),
    [categories, customCategoryLabels],
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
      loadFeedSources,
      selectedCategory,
      setOrderedCategoryLabels,
      setSelectedCategory,
    ],
  );

  const moveCategoryByDrop = useCallback(
    (label: string, targetIndex: number) => {
      setOrderedCategoryLabels((current) =>
        moveCategoryByDropInOrder(current, label, targetIndex),
      );
    },
    [setOrderedCategoryLabels],
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
      ensureCategoryLabelExists,
      loadFeedSources,
      pendingCategoryRemovalLabel,
      selectedCategory,
      setCategories,
      setOrderedCategoryLabels,
      setSelectedCategory,
    ],
  );

  return {
    addCategory,
    customCategoryLabels,
    ensureCategoryLabelExists,
    moveCategoryByDrop,
    pendingCategoryRemovalLabel,
    removeCategory,
    renameCategory,
    setCustomCategoryLabels,
  };
}
