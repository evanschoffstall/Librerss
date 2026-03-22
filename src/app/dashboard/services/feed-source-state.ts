import { type CategoryTreeNode } from "@/lib";

import { ALL_FEEDS_NODE_KEY } from "../constants";
import { findFeedNodeByKey, findFeedNodeByUrl, getAllFeedNodes, getFirstFeedNode } from "./category-tree";

type FeedRemovalResolution =
  | { categoryNode: CategoryTreeNode; type: "category" }
  | { feedUrl: string; nextSelectedCategory?: string; type: "feed" }
  | { type: "clear" }
  | { type: "none" };

export function normalizeFeedSourceInput(name: string, url: string) {
  return {
    name: name.trim(),
    url: url.trim(),
  };
}

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