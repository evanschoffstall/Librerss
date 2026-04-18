"use client";

import { useCallback, useState } from "react";

import type { FeedSourceActionState } from "@/app/dashboard/dashboard-hooks/feedSourceActionState";
import type { CategoryTreeNode } from "@/lib/core";

import {
  addCategoryLabel,
  hasCategoryLabelInTree,
  moveCategoryByDropInOrder,
  removeCategoryAndRefresh,
  renameCategoryAndRefresh,
} from "@/app/dashboard/dashboard-services/category";
import { includesCategoryLabel } from "@/lib/utils";

interface UseCategoryCrudActionsOptions extends Omit<
  FeedSourceActionState,
  "fetchAllFeeds" | "fetchCategoryFeeds" | "fetchFeed" | "setFeed"
> {
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.loadFeedSources
 * @param root0.selectedCategory
 * @param root0.setCategories
 * @param root0.setOrderedCategoryLabels
 * @param root0.setSelectedCategory
 */
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
  const ensureCategoryLabelExists = useEnsureCategoryLabelExists({
    categories,
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
  });
  const addCategory = useAddCategoryAction({
    categories,
    customCategoryLabels,
    setCustomCategoryLabels,
  });
  const renameCategory = useRenameCategoryAction({
    categories,
    customCategoryLabels,
    loadFeedSources,
    selectedCategory,
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    setSelectedCategory,
  });
  const moveCategoryByDrop = useMoveCategoryByDropAction({
    setOrderedCategoryLabels,
  });
  const removeCategory = useRemoveCategoryAction({
    categories,
    customCategoryLabels,
    ensureCategoryLabelExists,
    loadFeedSources,
    pendingCategoryRemovalLabel,
    selectedCategory,
    setCategories,
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    setPendingCategoryRemovalLabel,
    setSelectedCategory,
  });
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

/**
 * @param current
 * @param label
 * @param categories
 */
function ensureCategoryLabelInList(
  current: string[],
  label: string,
  categories: CategoryTreeNode[],
) {
  if (
    includesCategoryLabel(current, label) ||
    hasCategoryLabelInTree(categories, label)
  ) {
    return current;
  }

  return [...current, label];
}

/**
 * @param current
 * @param label
 */
function ensureLabelInCollection(current: string[], label: string) {
  if (includesCategoryLabel(current, label)) {
    return current;
  }

  return [...current, label];
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.customCategoryLabels
 * @param root0.setCustomCategoryLabels
 */
function useAddCategoryAction({
  categories,
  customCategoryLabels,
  setCustomCategoryLabels,
}: {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return useCallback(
    (label: string) =>
      addCategoryLabel({
        categories,
        customCategoryLabels,
        label,
        setCustomCategoryLabels,
      }),
    [categories, customCategoryLabels, setCustomCategoryLabels],
  );
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.setCustomCategoryLabels
 * @param root0.setOrderedCategoryLabels
 */
function useEnsureCategoryLabelExists({
  categories,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
}: {
  categories: CategoryTreeNode[];
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return useCallback(
    (label: string) => {
      setCustomCategoryLabels((current) =>
        ensureCategoryLabelInList(current, label, categories),
      );
      setOrderedCategoryLabels((current) =>
        ensureLabelInCollection(current, label),
      );
    },
    [categories, setCustomCategoryLabels, setOrderedCategoryLabels],
  );
}

/**
 * @param root0
 * @param root0.setOrderedCategoryLabels
 */
function useMoveCategoryByDropAction({
  setOrderedCategoryLabels,
}: {
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return useCallback(
    (label: string, targetIndex: number) => {
      setOrderedCategoryLabels((current) =>
        moveCategoryByDropInOrder(current, label, targetIndex),
      );
    },
    [setOrderedCategoryLabels],
  );
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.customCategoryLabels
 * @param root0.ensureCategoryLabelExists
 * @param root0.loadFeedSources
 * @param root0.pendingCategoryRemovalLabel
 * @param root0.selectedCategory
 * @param root0.setCategories
 * @param root0.setCustomCategoryLabels
 * @param root0.setOrderedCategoryLabels
 * @param root0.setPendingCategoryRemovalLabel
 * @param root0.setSelectedCategory
 */
function useRemoveCategoryAction({
  categories,
  customCategoryLabels,
  ensureCategoryLabelExists,
  loadFeedSources,
  pendingCategoryRemovalLabel,
  selectedCategory,
  setCategories,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
  setPendingCategoryRemovalLabel,
  setSelectedCategory,
}: {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  ensureCategoryLabelExists: (label: string) => void;
  loadFeedSources: FeedSourceActionState["loadFeedSources"];
  pendingCategoryRemovalLabel: null | string;
  selectedCategory: FeedSourceActionState["selectedCategory"];
  setCategories: FeedSourceActionState["setCategories"];
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setPendingCategoryRemovalLabel: React.Dispatch<
    React.SetStateAction<null | string>
  >;
  setSelectedCategory: FeedSourceActionState["setSelectedCategory"];
}) {
  return useCallback(
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
      setCustomCategoryLabels,
      setOrderedCategoryLabels,
      setPendingCategoryRemovalLabel,
      setSelectedCategory,
    ],
  );
}

/**
 * @param root0
 * @param root0.categories
 * @param root0.customCategoryLabels
 * @param root0.loadFeedSources
 * @param root0.selectedCategory
 * @param root0.setCustomCategoryLabels
 * @param root0.setOrderedCategoryLabels
 * @param root0.setSelectedCategory
 */
function useRenameCategoryAction({
  categories,
  customCategoryLabels,
  loadFeedSources,
  selectedCategory,
  setCustomCategoryLabels,
  setOrderedCategoryLabels,
  setSelectedCategory,
}: {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  loadFeedSources: FeedSourceActionState["loadFeedSources"];
  selectedCategory: FeedSourceActionState["selectedCategory"];
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedCategory: FeedSourceActionState["setSelectedCategory"];
}) {
  return useCallback(
    (currentLabel: string, nextLabel: string) =>
      renameCategoryAndRefresh({
        categories,
        currentLabel,
        customCategoryLabels,
        loadFeedSources,
        nextLabel,
        selectedCategory,
        setCustomCategoryLabels,
        setOrderedCategoryLabels,
        setSelectedCategory,
      }),
    [
      categories,
      customCategoryLabels,
      loadFeedSources,
      selectedCategory,
      setCustomCategoryLabels,
      setOrderedCategoryLabels,
      setSelectedCategory,
    ],
  );
}
