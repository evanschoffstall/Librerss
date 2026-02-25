import type { CategoryTreeNode } from "@/lib";
import { flattenCategoryFeeds } from "./category-tree";

export function getAllFeedNodes(
  categories: CategoryTreeNode[],
): CategoryTreeNode[] {
  return flattenCategoryFeeds(categories);
}

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
