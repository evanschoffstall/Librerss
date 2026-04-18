import type { CategoryTreeNode } from "@/lib/core";

import {
  ALL_FEEDS_LABEL,
  ALL_FEEDS_NODE_KEY,
  INITIAL_CATEGORIES,
} from "@/app/dashboard/dashboard-services/dashboard-constants";
import { PLACEHOLDER_CATEGORY, PLACEHOLDER_FEED_SOURCES } from "@/lib/core";
import {
  includesCategoryLabel,
  normalizeCategory,
  normalizeCategoryLabelKey,
} from "@/lib/utils";

/**
 * @param label
 */
export const toCategoryKey = (label: string) =>
  `cat-${
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default"
  }`;

/**
 * @param nodes
 */
const flattenCategoryFeeds = (nodes: CategoryTreeNode[]) =>
  nodes.flatMap((category) => category.children ?? []);

/**
 * @param sources
 */
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

/**
 * @param usePlaceholderData
 */
export const buildDefaultCategories = (
  usePlaceholderData: boolean,
): CategoryTreeNode[] => {
  if (!usePlaceholderData) {
    return INITIAL_CATEGORIES;
  }

  return [
    {
      children: PLACEHOLDER_FEED_SOURCES.map((source, index) => ({
        data: {
          category: source.category,
          enabled: source.enabled !== false,
          extractionDisabled: source.extractionDisabled === true,
          proxyEnabled: source.proxyEnabled === true,
          sourceId: source.id,
          url: source.url,
        },
        key: `${toCategoryKey(PLACEHOLDER_CATEGORY)}-dev-${index}`,
        label: source.name,
      })),
      key: toCategoryKey(PLACEHOLDER_CATEGORY),
      label: PLACEHOLDER_CATEGORY,
    },
  ];
};

export const SYSTEM_ALL_FEEDS_CATEGORY: CategoryTreeNode = {
  children: [],
  data: { url: "" },
  key: ALL_FEEDS_NODE_KEY,
  label: ALL_FEEDS_LABEL,
};

/**
 * @param categories
 * @param customCategoryLabels
 */
export function collectKnownCategoryLabels(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
): string[] {
  return [...categories.map((node) => node.label), ...customCategoryLabels];
}

/**
 * @param categories
 * @param key
 */
export function findFeedNodeByKey(
  categories: CategoryTreeNode[],
  key: string,
): CategoryTreeNode | undefined {
  return getAllFeedNodes(categories).find((node) => node.key === key);
}

/**
 * @param categories
 * @param url
 */
export function findFeedNodeByUrl(
  categories: CategoryTreeNode[],
  url: string,
): CategoryTreeNode | undefined {
  return getAllFeedNodes(categories).find((node) => node.data?.url === url);
}

/**
 * @param categories
 */
export function getAllFeedNodes(
  categories: CategoryTreeNode[],
): CategoryTreeNode[] {
  return flattenCategoryFeeds(categories);
}

/**
 * @param categories
 * @param selectedKey
 */
export function getFeedUrlBySelectedKey(
  categories: CategoryTreeNode[],
  selectedKey: string,
): string | undefined {
  return findFeedNodeByKey(categories, selectedKey)?.data?.url;
}

/**
 * @param categories
 */
export function getFirstFeedNode(
  categories: CategoryTreeNode[],
): CategoryTreeNode | undefined {
  return getAllFeedNodes(categories)[0];
}

/**
 * @param categories
 * @param label
 */
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
 * @param currentCategories
 * @param feedKey
 * @param targetCategoryLabel
 * @param targetIndex
 */
export function relocateFeedInCategories(
  currentCategories: CategoryTreeNode[],
  feedKey: string,
  targetCategoryLabel: string,
  targetIndex: number,
): CategoryTreeNode[] {
  const nextCategories = currentCategories.map((category) => ({
    ...category,
    children: [...(category.children ?? [])],
  }));
  const sourceCategoryIndex = currentCategories.findIndex((cat) =>
    (cat.children ?? []).some((node) => node.key === feedKey),
  );

  if (sourceCategoryIndex < 0) return currentCategories;
  const destinationCategoryIndex = findOrCreateDestinationCategoryIndex(
    nextCategories,
    targetCategoryLabel,
  );

  const sourceFeeds = nextCategories[sourceCategoryIndex].children;
  const sourceFeedIndex = sourceFeeds.findIndex((node) => node.key === feedKey);
  if (sourceFeedIndex < 0) return currentCategories;

  const [movedSource] = sourceFeeds.splice(sourceFeedIndex, 1);
  insertRelocatedFeed({
    destinationCategoryIndex,
    movedSource,
    nextCategories,
    sourceCategoryIndex,
    sourceFeedIndex,
    targetIndex,
  });

  return nextCategories;
}

/**
 * @param labels
 */
export function toDistinctCategoryLabels(labels: readonly string[]): string[] {
  const distinctLabels = new Map<string, string>();

  for (const label of labels) {
    const normalizedLabel = normalizeCategory(label);
    const normalizedKey = normalizeCategoryLabelKey(normalizedLabel);
    if (!distinctLabels.has(normalizedKey)) {
      distinctLabels.set(normalizedKey, normalizedLabel);
    }
  }

  return [...distinctLabels.values()];
}

/**
 * @param categories
 * @param targetCategoryLabel
 */
function findOrCreateDestinationCategoryIndex(
  categories: CategoryTreeNode[],
  targetCategoryLabel: string,
) {
  const existingIndex = categories.findIndex(
    (category) =>
      normalizeCategoryLabelKey(category.label) ===
      normalizeCategoryLabelKey(targetCategoryLabel),
  );

  if (existingIndex >= 0) {
    return existingIndex;
  }

  categories.push({
    children: [],
    key: toCategoryKey(targetCategoryLabel),
    label: targetCategoryLabel,
  });

  return categories.length - 1;
}

/**
 * @param root0
 * @param root0.destinationCategoryIndex
 * @param root0.movedSource
 * @param root0.nextCategories
 * @param root0.sourceCategoryIndex
 * @param root0.sourceFeedIndex
 * @param root0.targetIndex
 */
function insertRelocatedFeed({
  destinationCategoryIndex,
  movedSource,
  nextCategories,
  sourceCategoryIndex,
  sourceFeedIndex,
  targetIndex,
}: {
  destinationCategoryIndex: number;
  movedSource: CategoryTreeNode;
  nextCategories: CategoryTreeNode[];
  sourceCategoryIndex: number;
  sourceFeedIndex: number;
  targetIndex: number;
}) {
  const destinationCategory = nextCategories[destinationCategoryIndex];
  const destinationFeeds = destinationCategory.children ?? [];
  destinationCategory.children = destinationFeeds;
  const relocatedFeed: CategoryTreeNode = {
    ...movedSource,
    data: movedSource.data
      ? {
          ...movedSource.data,
          category: destinationCategory.label,
        }
      : movedSource.data,
  };

  const adjustedTargetIndex =
    sourceCategoryIndex === destinationCategoryIndex &&
    sourceFeedIndex < targetIndex
      ? targetIndex - 1
      : targetIndex;
  const insertionIndex = Math.max(
    0,
    Math.min(adjustedTargetIndex, destinationFeeds.length),
  );

  destinationFeeds.splice(insertionIndex, 0, relocatedFeed);
}
