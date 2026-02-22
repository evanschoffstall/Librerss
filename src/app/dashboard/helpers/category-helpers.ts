/**
 * Pure helpers for building and mutating the category tree.
 */

import {
  normalizeCategory,
  normalizeCategoryLabelKey,
  type CategoryTreeNode,
} from "@/lib";
import {
  PLACEHOLDER_CATEGORY,
  PLACEHOLDER_FEED_SOURCES,
} from "@/lib/core/placeholder";
import {
  ALL_FEEDS_LABEL,
  ALL_FEEDS_NODE_KEY,
  INITIAL_CATEGORIES,
} from "../constants";

// ─── Category key generation ──────────────────────────────────────────────────

export const toCategoryKey = (label: string) =>
  `cat-${
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default"
  }`;

/** Alias for normalized category-label comparison. */
export const normalizeLabel = normalizeCategoryLabelKey;

// ─── Tree traversal ───────────────────────────────────────────────────────────

export const flattenCategoryFeeds = (nodes: CategoryTreeNode[]) =>
  nodes.flatMap((category) => category.children ?? []);

// ─── Tree construction ────────────────────────────────────────────────────────

export const buildCategoriesFromSources = (
  sources: Array<{
    id: number;
    name: string;
    url: string;
    category?: string | null;
  }>,
): CategoryTreeNode[] => {
  const grouped = new Map<string, CategoryTreeNode[]>();

  for (const source of sources) {
    const categoryLabel = normalizeCategory(source.category);
    const current = grouped.get(categoryLabel) ?? [];

    current.push({
      key: `${toCategoryKey(categoryLabel)}-${source.id}`,
      label: source.name,
      data: { url: source.url, sourceId: source.id, category: categoryLabel },
    });

    grouped.set(categoryLabel, current);
  }

  return [...grouped.entries()].map(([label, children]) => ({
    key: toCategoryKey(label),
    label,
    children,
  }));
};

export const buildDefaultCategories = (
  usePlaceholderData: boolean,
): CategoryTreeNode[] => {
  if (!usePlaceholderData) {
    return INITIAL_CATEGORIES;
  }

  return [
    {
      key: toCategoryKey(PLACEHOLDER_CATEGORY),
      label: PLACEHOLDER_CATEGORY,
      children: PLACEHOLDER_FEED_SOURCES.map((source, index) => ({
        key: `${toCategoryKey(PLACEHOLDER_CATEGORY)}-dev-${index}`,
        label: source.name,
        data: { url: source.url, category: source.category },
      })),
    },
  ];
};

// ─── All-feeds sentinel ───────────────────────────────────────────────────────

export const SYSTEM_ALL_FEEDS_CATEGORY: CategoryTreeNode = {
  key: ALL_FEEDS_NODE_KEY,
  label: ALL_FEEDS_LABEL,
  data: { url: "" },
  children: [],
};

// ─── Tree mutation (pure) ─────────────────────────────────────────────────────

/**
 * Returns a new category array with a feed node moved between categories.
 * Pure function — safe to pass as a state updater.
 */
export function relocateFeedInCategories(
  currentCategories: CategoryTreeNode[],
  feedKey: string,
  targetCategoryLabel: string,
  targetIndex: number,
): CategoryTreeNode[] {
  const cloneCategories = (
    categories: CategoryTreeNode[],
  ): CategoryTreeNode[] =>
    categories.map((cat) => ({
      ...cat,
      children: [...(cat.children ?? [])],
    }));

  const sourceCategoryIndex = currentCategories.findIndex((cat) =>
    (cat.children ?? []).some((node) => node.key === feedKey),
  );

  if (sourceCategoryIndex < 0) return currentCategories;

  const nextCategories = cloneCategories(currentCategories);

  let destinationCategoryIndex = nextCategories.findIndex(
    (cat) => normalizeLabel(cat.label) === normalizeLabel(targetCategoryLabel),
  );

  if (destinationCategoryIndex < 0) {
    nextCategories.push({
      key: toCategoryKey(targetCategoryLabel),
      label: targetCategoryLabel,
      children: [],
    });
    destinationCategoryIndex = nextCategories.length - 1;
  }

  const sourceFeeds = nextCategories[sourceCategoryIndex].children ?? [];
  const sourceFeedIndex = sourceFeeds.findIndex((node) => node.key === feedKey);
  if (sourceFeedIndex < 0) return currentCategories;

  const [movedSource] = sourceFeeds.splice(sourceFeedIndex, 1);
  const destinationCategory = nextCategories[destinationCategoryIndex];
  const destinationFeeds = destinationCategory.children ?? [];
  destinationCategory.children = destinationFeeds;

  const safeTargetIndex = Math.max(
    0,
    Math.min(targetIndex, destinationFeeds.length),
  );
  const insertionIndex =
    sourceCategoryIndex === destinationCategoryIndex &&
    sourceFeedIndex < safeTargetIndex
      ? safeTargetIndex - 1
      : safeTargetIndex;

  destinationFeeds.splice(insertionIndex, 0, {
    ...movedSource,
    data: {
      ...(movedSource.data ?? { url: "" }),
      category: destinationCategory.label,
    },
  });

  return nextCategories;
}

// ─── Motion presets ───────────────────────────────────────────────────────────

export const panelMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};
