import { type Dispatch, type SetStateAction } from "react";

import type { CategoryTreeNode } from "@/lib/core";

import {
  collectKnownCategoryLabels,
  findFeedNodeByUrl,
  toCategoryKey,
} from "@/app/dashboard/dashboard-services/category-tree";
import {
  isSameCategoryLabel,
  normalizeCategory,
  removeCategoryLabel,
} from "@/lib/utils";

export function getCategoryRemovalTarget(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
  labelToRemove: string,
): string | undefined {
  return collectKnownCategoryLabels(categories, customCategoryLabels)
    .map((label) => normalizeCategory(label))
    .find((label) => !isSameCategoryLabel(label, labelToRemove));
}

export function removeCategoryFromLabelCollections(
  setCustomCategoryLabels: Dispatch<SetStateAction<string[]>>,
  setOrderedCategoryLabels: Dispatch<SetStateAction<string[]>>,
  label: string,
): void {
  updateCategoryLabelCollections(
    setCustomCategoryLabels,
    setOrderedCategoryLabels,
    (current) => removeCategoryLabel(current, label),
  );
}

export function removeCategoryFromLocalState(
  currentCategories: CategoryTreeNode[],
  labelToRemove: string,
  targetCategory?: string,
): CategoryTreeNode[] {
  const sourceIndex = currentCategories.findIndex((category) =>
    isSameCategoryLabel(category.label, labelToRemove),
  );
  if (sourceIndex < 0) return currentCategories;

  const sourceCategory = currentCategories[sourceIndex];
  const sourceFeeds = sourceCategory.children ?? [];
  const nextCategories = currentCategories
    .filter((category) => !isSameCategoryLabel(category.label, labelToRemove))
    .map((category) => ({
      ...category,
      children: [...(category.children ?? [])],
    }));

  if (!targetCategory || sourceFeeds.length === 0) {
    return nextCategories;
  }

  let targetIndex = nextCategories.findIndex((category) =>
    isSameCategoryLabel(category.label, targetCategory),
  );

  if (targetIndex < 0) {
    nextCategories.push({
      children: [],
      key: toCategoryKey(targetCategory),
      label: targetCategory,
    });
    targetIndex = nextCategories.length - 1;
  }

  const destination = nextCategories[targetIndex];
  destination.children.push(
    ...sourceFeeds.map((feed) => ({
      ...feed,
      data: {
        ...(feed.data ?? { url: "" }),
        category: destination.label,
      },
    })),
  );

  return nextCategories;
}

export function restoreSelectedCategoryFromSourceUrl({
  refreshedCategories,
  selectedSourceUrl,
  setSelectedCategory,
}: {
  refreshedCategories: CategoryTreeNode[];
  selectedSourceUrl?: string;
  setSelectedCategory: Dispatch<SetStateAction<string>>;
}): void {
  if (!selectedSourceUrl) {
    return;
  }

  const selectedNode = findFeedNodeByUrl(
    refreshedCategories,
    selectedSourceUrl,
  );

  if (selectedNode) {
    setSelectedCategory(selectedNode.key);
  }
}

export function updateCategoryLabelCollections(
  setCustomCategoryLabels: Dispatch<SetStateAction<string[]>>,
  setOrderedCategoryLabels: Dispatch<SetStateAction<string[]>>,
  update: (labels: string[]) => string[],
): void {
  setCustomCategoryLabels((current) => update(current));
  setOrderedCategoryLabels((current) => update(current));
}
