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

function ensureLabelInCollection(current: string[], label: string) {
  if (includesCategoryLabel(current, label)) {
    return current;
  }

  return [...current, label];
}

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
