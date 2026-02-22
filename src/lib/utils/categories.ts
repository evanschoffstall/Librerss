/**
 * Category normalization utilities
 * Centralizes category handling logic
 */

export const DEFAULT_CATEGORY_LABEL = "My Feeds";

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

  const lowercased = trimmed.toLowerCase();

  if (UNCATEGORIZED_VARIANTS.has(lowercased)) {
    return DEFAULT_CATEGORY_LABEL;
  }

  return trimmed;
}

/**
 * Checks if a category label represents the default/uncategorized category
 * @param label - Category label to check
 * @returns true if label represents uncategorized
 */
export function isDefaultCategory(label?: string | null): boolean {
  const normalized = normalizeCategory(label);
  return normalized === DEFAULT_CATEGORY_LABEL;
}
