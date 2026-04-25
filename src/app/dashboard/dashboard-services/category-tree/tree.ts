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
 * Process the to category key.
 * @param label - The label.
 * @returns The to category key.
 */
export const toCategoryKey = (label: string) =>
  `cat-${
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default"
  }`;

/**
 * Process the flatten category feeds.
 * @param nodes - The nodes.
 * @returns The flatten category feeds.
 */
const flattenCategoryFeeds = (nodes: CategoryTreeNode[]) =>
  nodes.flatMap((category) => category.children ?? []);

/**
 * Build the categories from sources.
 * @param sources - The sources.
 * @returns The categories from sources.
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
 * Build the default categories.
 * @param usePlaceholderData - The placeholder data.
 * @returns The default categories.
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

interface InsertRelocatedFeedOptions {
  destinationCategoryIndex: number;
  movedSource: CategoryTreeNode;
  nextCategories: CategoryTreeNode[];
  sourceCategoryIndex: number;
  sourceFeedIndex: number;
  targetIndex: number;
}

/**
 * Process the collect known category labels.
 * @param categories - The categories.
 * @param customCategoryLabels - The custom category labels.
 * @returns The collect known category labels.
 */
export function collectKnownCategoryLabels(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
): string[] {
  return [...categories.map((node) => node.label), ...customCategoryLabels];
}

/**
 * Process the find feed node by key.
 * @param categories - The categories.
 * @param key - The key.
 * @returns The find feed node by key.
 */
export function findFeedNodeByKey(
  categories: CategoryTreeNode[],
  key: string,
): CategoryTreeNode | undefined {
  return getAllFeedNodes(categories).find((node) => node.key === key);
}

/**
 * Process the find feed node by url.
 * @param categories - The categories.
 * @param url - The url.
 * @returns The find feed node by url.
 */
export function findFeedNodeByUrl(
  categories: CategoryTreeNode[],
  url: string,
): CategoryTreeNode | undefined {
  return getAllFeedNodes(categories).find((node) => node.data?.url === url);
}

/**
 * Return the all feed nodes.
 * @param categories - The categories.
 * @returns The all feed nodes.
 */
export function getAllFeedNodes(
  categories: CategoryTreeNode[],
): CategoryTreeNode[] {
  return flattenCategoryFeeds(categories);
}

/**
 * Return the feed url by selected key.
 * @param categories - The categories.
 * @param selectedKey - The selected key.
 * @returns The feed url by selected key.
 */
export function getFeedUrlBySelectedKey(
  categories: CategoryTreeNode[],
  selectedKey: string,
): string | undefined {
  return findFeedNodeByKey(categories, selectedKey)?.data?.url;
}

/**
 * Return the first feed node.
 * @param categories - The categories.
 * @returns The first feed node.
 */
export function getFirstFeedNode(
  categories: CategoryTreeNode[],
): CategoryTreeNode | undefined {
  return getAllFeedNodes(categories)[0];
}

/**
 * Return whether has category label in tree.
 * @param categories - The categories.
 * @param label - The label.
 * @returns Whether has category label in tree.
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
 * Process the relocate feed in categories.
 * @param currentCategories - The current categories.
 * @param feedKey - The feed key.
 * @param targetCategoryLabel - The target category label.
 * @param targetIndex - The target index value.
 * @returns The relocate feed in categories.
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
 * Process the to distinct category labels.
 * @param labels - The labels.
 * @returns The to distinct category labels.
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
 * Process the find or create destination category index.
 * @param categories - The categories.
 * @param targetCategoryLabel - The target category label.
 * @returns The find or create destination category index.
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
 * Process the insert relocated feed.
 * @param options - The options used to process the insert relocated feed.
 */
function insertRelocatedFeed(options: InsertRelocatedFeedOptions) {
  const {
    destinationCategoryIndex,
    movedSource,
    nextCategories,
    sourceCategoryIndex,
    sourceFeedIndex,
    targetIndex,
  } = options;
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
