/**
 * Category normalization utilities
 * Centralizes category handling logic.
 */

import type { CategoryTreeNode } from "@/lib/types";

export const DEFAULT_CATEGORY_LABEL = "My Feeds";

/**
 * Return whether is same category label.
 * @param left - The left.
 * @param right - The right.
 * @returns Whether is same category label.
 */
export function isSameCategoryLabel(
  left?: null | string,
  right?: null | string,
): boolean {
  return normalizeCategoryLabelKey(left) === normalizeCategoryLabelKey(right);
}

/**
 * Normalize the category label key.
 * @param label - The label.
 * @returns The category label key.
 */
export function normalizeCategoryLabelKey(label?: null | string): string {
  return label?.trim().toLowerCase() ?? "";
}

/**
 * Process the to category label or default.
 * @param label - The label.
 * @returns The to category label or default.
 */
export function toCategoryLabelOrDefault(label?: null | string): string {
  return toOptionalCategoryLabel(label) ?? DEFAULT_CATEGORY_LABEL;
}

/**
 * Process the to optional category label.
 * @param label - The label.
 * @returns The to optional category label.
 */
function toOptionalCategoryLabel(label?: null | string): null | string {
  const trimmed = label?.trim();
  if (trimmed === undefined || trimmed === "") {
    return null;
  }

  return trimmed;
}

const UNCATEGORIZED_VARIANTS = new Set([
  "",
  "no category",
  "none",
  "uncategoried", // common typo found in RSS feeds / OPML exports
  "uncategorised",
  "uncategorized",
]);

/**
 * Normalize the category.
 * @param label - The label.
 * @returns The category.
 */
export function normalizeCategory(label?: null | string): string {
  const trimmed = toOptionalCategoryLabel(label);

  if (!trimmed) {
    return DEFAULT_CATEGORY_LABEL;
  }

  const lowercased = normalizeCategoryLabelKey(trimmed);

  if (UNCATEGORIZED_VARIANTS.has(lowercased)) {
    return DEFAULT_CATEGORY_LABEL;
  }

  return trimmed;
}

// ── Array helper methods for category operations ────────────────────────────

/**
 * Process the includes category label.
 * @param labels - The labels.
 * @param target - The target.
 * @returns Whether includes category label.
 */
export const includesCategoryLabel = (
  labels: readonly string[],
  target: string,
): boolean => labels.some((label) => isSameCategoryLabel(label, target));

/**
 * Process the replace category label.
 * @param labels - The labels.
 * @param currentLabel - The current label.
 * @param nextLabel - The next label.
 * @returns The replace category label.
 */
export const replaceCategoryLabel = (
  labels: readonly string[],
  currentLabel: string,
  nextLabel: string,
): string[] =>
  labels.map((label) =>
    isSameCategoryLabel(label, currentLabel) ? nextLabel : label,
  );

/**
 * Process the remove category label.
 * @param labels - The labels.
 * @param target - The target.
 * @returns The remove category label.
 */
export const removeCategoryLabel = (
  labels: readonly string[],
  target: string,
): string[] => labels.filter((label) => !isSameCategoryLabel(label, target));

/**
 * Process the find category by label.
 * @param categories - The categories.
 * @param label - The label.
 * @returns The find category by label.
 */
export const findCategoryByLabel = (
  categories: readonly CategoryTreeNode[],
  label: string,
): CategoryTreeNode | undefined =>
  categories.find((category) => isSameCategoryLabel(category.label, label));
