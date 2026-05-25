"use client";

import { useCallback, useState } from "react";

import type { FeedSourceActionState } from "@/app/dashboard/hooks/feedSourceActionState";
import type { CategoryTreeNode } from "@/lib/core";

import {
  addCategoryLabel,
  hasCategoryLabelInTree,
  moveCategoryByDropInOrder,
  removeCategoryAndRefresh,
  renameCategoryAndRefresh,
} from "@/app/dashboard/services/category";
import { includesCategoryLabel } from "@/lib/utils";

/**
 * Describes the options for add category action.
 */
interface AddCategoryActionOptions {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}

/**
 * Describes the options for ensure category label exists.
 */
interface EnsureCategoryLabelExistsOptions {
  categories: CategoryTreeNode[];
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}

/**
 * Describes the options for move category by drop action.
 */
interface MoveCategoryByDropActionOptions {
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}

/**
 * Describes the options for remove category action.
 */
interface RemoveCategoryActionOptions {
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
}
/**
 * Describes the options for rename category action.
 */
interface RenameCategoryActionOptions {
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  loadFeedSources: FeedSourceActionState["loadFeedSources"];
  selectedCategory: FeedSourceActionState["selectedCategory"];
  setCustomCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedCategory: FeedSourceActionState["setSelectedCategory"];
}

/**
 * Describes the options for use category crud actions.
 */
interface UseCategoryCrudActionsOptions extends Omit<
  FeedSourceActionState,
  "fetchAllFeeds" | "fetchCategoryFeeds" | "fetchFeed" | "setFeed"
> {
  setOrderedCategoryLabels: React.Dispatch<React.SetStateAction<string[]>>;
}
/**
 * Manage the category crud actions.
 * @param options - The options used to manage the category crud actions.
 * @returns The category crud actions state and callbacks.
 */
export function useCategoryCrudActions(options: UseCategoryCrudActionsOptions) {
  const {
    categories,
    loadFeedSources,
    selectedCategory,
    setCategories,
    setOrderedCategoryLabels,
    setSelectedCategory,
  } = options;
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
 * Process the ensure category label in list.
 * @param current - The current.
 * @param label - The label.
 * @param categories - The categories.
 * @returns The ensure category label in list.
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
 * Process the ensure label in collection.
 * @param current - The current.
 * @param label - The label.
 * @returns The ensure label in collection.
 */
function ensureLabelInCollection(current: string[], label: string) {
  if (includesCategoryLabel(current, label)) {
    return current;
  }

  return [...current, label];
}

/**
 * Manage the add category action.
 * @param options - The options used to manage the add category action.
 * @returns The add category action state and callbacks.
 */
function useAddCategoryAction(options: AddCategoryActionOptions) {
  const { categories, customCategoryLabels, setCustomCategoryLabels } = options;
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
 * Manage the ensure category label exists.
 * @param options - The options used to manage the ensure category label exists.
 * @returns The ensure category label exists state and callbacks.
 */
function useEnsureCategoryLabelExists(
  options: EnsureCategoryLabelExistsOptions,
) {
  const { categories, setCustomCategoryLabels, setOrderedCategoryLabels } =
    options;
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
 * Manage the move category by drop action.
 * @param options - The options used to manage the move category by drop action.
 * @returns The move category by drop action state and callbacks.
 */
function useMoveCategoryByDropAction(options: MoveCategoryByDropActionOptions) {
  const { setOrderedCategoryLabels } = options;
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
 * Manage the remove category action.
 * @param options - The options used to manage the remove category action.
 * @returns The remove category action state and callbacks.
 */
function useRemoveCategoryAction(options: RemoveCategoryActionOptions) {
  const {
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
  } = options;
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
 * Manage the rename category action.
 * @param options - The options used to manage the rename category action.
 * @returns The rename category action state and callbacks.
 */
function useRenameCategoryAction(options: RenameCategoryActionOptions) {
  const {
    categories,
    customCategoryLabels,
    loadFeedSources,
    selectedCategory,
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    setSelectedCategory,
  } = options;
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
