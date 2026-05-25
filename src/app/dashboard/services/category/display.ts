import type { CategoryTreeNode } from "@/lib/core";

import {
  collectKnownCategoryLabels,
  toCategoryKey,
  toDistinctCategoryLabels,
} from "@/app/dashboard/services/category-tree";
import { normalizeCategoryLabelKey } from "@/lib/utils";

/**
 * Build the display categories.
 * @param categories - The categories.
 * @param customCategoryLabels - The custom category labels.
 * @param orderedCategoryLabels - The ordered category labels.
 * @returns The display categories.
 */
export function buildDisplayCategories(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
  orderedCategoryLabels: string[],
): CategoryTreeNode[] {
  const categoryMap = new Map<string, CategoryTreeNode>(
    categories.map((node) => [normalizeCategoryLabelKey(node.label), node]),
  );

  for (const label of customCategoryLabels) {
    const key = normalizeCategoryLabelKey(label);
    if (!categoryMap.has(key)) {
      categoryMap.set(key, { children: [], key: toCategoryKey(label), label });
    }
  }

  const orderedLabels =
    orderedCategoryLabels.length > 0
      ? orderedCategoryLabels
      : [...categoryMap.values()].map((node) => node.label);

  return orderedLabels
    .map((label) => categoryMap.get(normalizeCategoryLabelKey(label)))
    .filter((node): node is CategoryTreeNode => node !== undefined);
}

/**
 * Process the compute next ordered category labels.
 * @param categories - The categories.
 * @param customCategoryLabels - The custom category labels.
 * @param currentLabels - The current labels.
 * @returns The compute next ordered category labels.
 */
export function computeNextOrderedCategoryLabels(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
  currentLabels: string[],
): string[] {
  const uniqueLabels = toDistinctCategoryLabels(
    collectKnownCategoryLabels(categories, customCategoryLabels),
  );

  const existingKeys = new Set(uniqueLabels.map(normalizeCategoryLabelKey));
  const preserved = currentLabels.filter((label) =>
    existingKeys.has(normalizeCategoryLabelKey(label)),
  );
  const preservedKeys = new Set(preserved.map(normalizeCategoryLabelKey));
  const appended = uniqueLabels.filter(
    (label) => !preservedKeys.has(normalizeCategoryLabelKey(label)),
  );

  return [...preserved, ...appended];
}
