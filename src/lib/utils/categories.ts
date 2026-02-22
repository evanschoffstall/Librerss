/**
 * Category normalization utilities
 * Centralizes category handling logic
 */

export const DEFAULT_CATEGORY_LABEL = "My Feeds";

/**
 * Stable key used for case-insensitive category label comparisons.
 */
export function normalizeCategoryLabelKey(label?: string | null): string {
  return label?.trim().toLowerCase() ?? "";
}

/**
 * Compares category labels with consistent trimming/case-folding.
 */
export function isSameCategoryLabel(
  left?: string | null,
  right?: string | null,
): boolean {
  return normalizeCategoryLabelKey(left) === normalizeCategoryLabelKey(right);
}

const UNCATEGORIZED_VARIANTS = new Set([
  "uncategorized",
  "uncategorised",
  "uncategoried", // common typo found in RSS feeds / OPML exports
  "no category",
  "none",
  "",
]);

/**
 * Normalizes category labels consistently across the application
 * @param label - Raw category label
 * @returns Normalized category label
 */
export function normalizeCategory(label?: string | null): string {
  const trimmed = label?.trim();

  if (!trimmed) {
    return DEFAULT_CATEGORY_LABEL;
  }

  const lowercased = normalizeCategoryLabelKey(trimmed);

  if (UNCATEGORIZED_VARIANTS.has(lowercased)) {
    return DEFAULT_CATEGORY_LABEL;
  }

  return trimmed;
}
