/**
 * Pure helpers for building and mutating the category tree.
 * Also covers feed-node lookup and category-label utilities.
 */

import {
  type CategoryTreeNode,
  includesCategoryLabel,
  normalizeCategory,
  normalizeCategoryLabelKey,
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
// ─── Tree traversal ───────────────────────────────────────────────────────────

const flattenCategoryFeeds = (nodes: CategoryTreeNode[]) =>
  nodes.flatMap((category) => category.children ?? []);

// ─── Tree construction ────────────────────────────────────────────────────────

export const buildCategoriesFromSources = (
  sources: {
    category?: null | string;
    enabled?: boolean;
    extractionDisabled?: boolean;
    id: number;
    name: string;
    proxyEnabled?: boolean;
    url: string;
  }[],
): CategoryTreeNode[] => {
  const grouped = new Map<string, CategoryTreeNode[]>();

  for (const source of sources) {
    const categoryLabel = normalizeCategory(source.category);
    const current = grouped.get(categoryLabel) ?? [];

    current.push({
      data: {
        category: categoryLabel,
        enabled: source.enabled !== false,
        extractionDisabled: source.extractionDisabled === true,
        proxyEnabled: source.proxyEnabled === true,
        sourceId: source.id,
        url: source.url,
      },
      key: `${toCategoryKey(categoryLabel)}-${source.id}`,
      label: source.name,
    });

    grouped.set(categoryLabel, current);
  }

  return [...grouped.entries()].map(([label, children]) => ({
    children,
    key: toCategoryKey(label),
    label,
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
      children: PLACEHOLDER_FEED_SOURCES.map((source, index) => ({
        data: { category: source.category, url: source.url },
        key: `${toCategoryKey(PLACEHOLDER_CATEGORY)}-dev-${index}`,
        label: source.name,
      })),
      key: toCategoryKey(PLACEHOLDER_CATEGORY),
      label: PLACEHOLDER_CATEGORY,
    },
  ];
};

// ─── All-feeds sentinel ───────────────────────────────────────────────────────

export const SYSTEM_ALL_FEEDS_CATEGORY: CategoryTreeNode = {
  children: [],
  data: { url: "" },
  key: ALL_FEEDS_NODE_KEY,
  label: ALL_FEEDS_LABEL,
};

// ─── Tree mutation (pure) ─────────────────────────────────────────────────────

export function collectKnownCategoryLabels(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
): string[] {
  return [...categories.map((node) => node.label), ...customCategoryLabels];
}

// ─── Feed-node lookup (merged from category-feeds.ts) ────────────────────────

export function findFeedNodeByKey(
  categories: CategoryTreeNode[],
  key: string,
): CategoryTreeNode | undefined {
  return getAllFeedNodes(categories).find((node) => node.key === key);
}

export function findFeedNodeByUrl(
  categories: CategoryTreeNode[],
  url: string,
): CategoryTreeNode | undefined {
  return getAllFeedNodes(categories).find((node) => node.data?.url === url);
}

export function getAllFeedNodes(
  categories: CategoryTreeNode[],
): CategoryTreeNode[] {
  return flattenCategoryFeeds(categories);
}

export function getFeedUrlBySelectedKey(
  categories: CategoryTreeNode[],
  selectedKey: string,
): string | undefined {
  return findFeedNodeByKey(categories, selectedKey)?.data?.url;
}

export function getFirstFeedNode(
  categories: CategoryTreeNode[],
): CategoryTreeNode | undefined {
  return getAllFeedNodes(categories)[0];
}

// ─── Category-label utilities (merged from category-labels.ts) ───────────────

export function hasCategoryLabelInTree(
  categories: CategoryTreeNode[],
  label: string,
): boolean {
  return includesCategoryLabel(
    categories.map((category) => category.label),
    label,
  );
}

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
    (cat) =>
      normalizeCategoryLabelKey(cat.label) ===
      normalizeCategoryLabelKey(targetCategoryLabel),
  );

  if (destinationCategoryIndex < 0) {
    nextCategories.push({
      children: [],
      key: toCategoryKey(targetCategoryLabel),
      label: targetCategoryLabel,
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

  const adjusted =
    sourceCategoryIndex === destinationCategoryIndex &&
    sourceFeedIndex < targetIndex
      ? targetIndex - 1
      : targetIndex;
  const insertionIndex = Math.max(
    0,
    Math.min(adjusted, destinationFeeds.length),
  );

  destinationFeeds.splice(insertionIndex, 0, {
    ...movedSource,
    data: {
      ...(movedSource.data ?? { url: "" }),
      category: destinationCategory.label,
    },
  });

  return nextCategories;
}

export function toDistinctCategoryLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const uniqueLabels: string[] = [];

  for (const label of labels) {
    const key = normalizeCategoryLabelKey(label);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueLabels.push(label);
  }

  return uniqueLabels;
}
