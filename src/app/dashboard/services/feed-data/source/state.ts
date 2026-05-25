import type { CategoryTreeNode } from "@/lib/core";

import {
  findFeedNodeByKey,
  findFeedNodeByUrl,
  getAllFeedNodes,
  getFirstFeedNode,
} from "@/app/dashboard/services/category-tree";
import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/services/dashboard-constants";

/**
 * Defines the feed removal resolution type.
 */
type FeedRemovalResolution =
  | { categoryNode: CategoryTreeNode; type: "category" }
  | { feedUrl: string; nextSelectedCategory?: string; type: "feed" }
  | { type: "clear" }
  | { type: "none" };

/**
 * Normalize the feed source input.
 * @param name - The name.
 * @param url - The url.
 * @returns The feed source input.
 */
export function normalizeFeedSourceInput(name: string, url: string) {
  return {
    name: name.trim(),
    url: url.trim(),
  };
}

/**
 * Resolve the post enabled toggle selection.
 * @param nextCategories - The next categories.
 * @param selectedCategory - The selected category.
 * @param sourceUrl - The source url.
 * @param enabled - The enabled.
 * @param key - The key.
 * @returns The post enabled toggle selection.
 */
export function resolvePostEnabledToggleSelection(
  nextCategories: CategoryTreeNode[],
  selectedCategory: string,
  sourceUrl: string | undefined,
  enabled: boolean,
  key: string,
):
  | { feedUrl: string; type: "feed" }
  | { nextSelectedCategory: string; type: "all-feeds" }
  | { type: "none" } {
  if (!enabled && selectedCategory === key) {
    return { nextSelectedCategory: ALL_FEEDS_NODE_KEY, type: "all-feeds" };
  }

  if (enabled && sourceUrl) {
    const latestNode = findFeedNodeByUrl(nextCategories, sourceUrl);
    if (latestNode?.data?.url) {
      return { feedUrl: latestNode.data.url, type: "feed" };
    }
  }

  return { type: "none" };
}

/**
 * Resolve the post removal selection.
 * @param nextCategories - The next categories.
 * @param selectedCategory - The selected category.
 * @param removedFeedKey - The removed feed key.
 * @returns The post removal selection.
 */
export function resolvePostRemovalSelection(
  nextCategories: CategoryTreeNode[],
  selectedCategory: string,
  removedFeedKey: string,
): FeedRemovalResolution {
  const nextAvailable = getAllFeedNodes(nextCategories);
  const selectedFeedNode = findFeedNodeByKey(nextCategories, selectedCategory);
  const selectedCategoryNode = nextCategories.find(
    (node) => node.key === selectedCategory,
  );

  if (nextAvailable.length === 0) {
    return { type: "clear" };
  }

  if (selectedCategory === removedFeedKey) {
    const fallback = nextAvailable[0];
    if (!fallback.data?.url) {
      return { type: "none" };
    }

    return {
      feedUrl: fallback.data.url,
      nextSelectedCategory: fallback.key,
      type: "feed",
    };
  }

  if (selectedFeedNode?.data?.url) {
    return { feedUrl: selectedFeedNode.data.url, type: "feed" };
  }

  if (selectedCategoryNode) {
    return { categoryNode: selectedCategoryNode, type: "category" };
  }

  const fallback = getFirstFeedNode(nextCategories);
  if (!fallback?.data?.url) {
    return { type: "none" };
  }

  return {
    feedUrl: fallback.data.url,
    nextSelectedCategory: fallback.key,
    type: "feed",
  };
}
