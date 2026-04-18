/**
 * Category normalization utilities
 * Centralizes category handling logic.
 */

import type { CategoryTreeNode } from "@/lib/types";

export const DEFAULT_CATEGORY_LABEL = "My Feeds";

/**
 * Compares category labels with consistent trimming/case-folding.
 * @param left
 * @param right
 */
export function isSameCategoryLabel(
  left?: null | string,
  right?: null | string,
): boolean {
  return normalizeCategoryLabelKey(left) === normalizeCategoryLabelKey(right);
}

/**
 * Stable key used for case-insensitive category label comparisons.
 * @param label
 */
export function normalizeCategoryLabelKey(label?: null | string): string {
  return label?.trim().toLowerCase() ?? "";
}

/**
 * Returns a non-empty category label, defaulting to the canonical label.
 * @param label
 */
export function toCategoryLabelOrDefault(label?: null | string): string {
  return toOptionalCategoryLabel(label) ?? DEFAULT_CATEGORY_LABEL;
}

/**
 * Trims category labels and returns null when empty/missing.
 * @param label
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
 * Normalizes category labels consistently across the application.
 * @param label - Raw category label.
 * @returns Normalized category label.
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
 * @param labels
 * @param target
 */
export const includesCategoryLabel = (
  labels: readonly string[],
  target: string,
): boolean => labels.some((label) => isSameCategoryLabel(label, target));

/**
 * @param labels
 * @param currentLabel
 * @param nextLabel
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
 * @param labels
 * @param target
 */
export const removeCategoryLabel = (
  labels: readonly string[],
  target: string,
): string[] => labels.filter((label) => !isSameCategoryLabel(label, target));

/**
 * @param categories
 * @param label
 */
export const findCategoryByLabel = (
  categories: readonly CategoryTreeNode[],
  label: string,
): CategoryTreeNode | undefined =>
  categories.find((category) => isSameCategoryLabel(category.label, label));
