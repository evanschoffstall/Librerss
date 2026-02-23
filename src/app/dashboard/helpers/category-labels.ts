import { normalizeCategoryLabelKey, type CategoryTreeNode } from "@/lib";

export const sameCategoryLabel = (left: string, right: string): boolean =>
  normalizeCategoryLabelKey(left) === normalizeCategoryLabelKey(right);

export const includesCategoryLabel = (
  labels: readonly string[],
  target: string,
): boolean => labels.some((label) => sameCategoryLabel(label, target));

export const replaceCategoryLabel = (
  labels: readonly string[],
  currentLabel: string,
  nextLabel: string,
): string[] =>
  labels.map((label) =>
    sameCategoryLabel(label, currentLabel) ? nextLabel : label,
  );

export const removeCategoryLabel = (
  labels: readonly string[],
  target: string,
): string[] => labels.filter((label) => !sameCategoryLabel(label, target));

export const findCategoryByLabel = (
  categories: readonly CategoryTreeNode[],
  label: string,
): CategoryTreeNode | undefined =>
  categories.find((category) => sameCategoryLabel(category.label, label));
