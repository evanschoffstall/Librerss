import {
  buildCategoriesFromSources,
  buildDefaultCategories,
} from "./category-tree";

import type { CategoryTreeNode } from "@/lib";
import { FeedService } from "@/lib";
import type { FeedSource } from "@/lib/core/types";

interface FeedSourceTreeDependencies {
  buildCategoriesFromSources: (sources: FeedSource[]) => CategoryTreeNode[];
  buildDefaultCategories: (usePlaceholderData: boolean) => CategoryTreeNode[];
  getFeedSources: () => Promise<FeedSource[]>;
}

const defaultDependencies: FeedSourceTreeDependencies = {
  buildCategoriesFromSources,
  buildDefaultCategories,
  getFeedSources: () => FeedService.getFeedSources(),
};

export async function loadFeedSourceTree(
  usePlaceholderData: boolean,
  dependencies: FeedSourceTreeDependencies = defaultDependencies,
): Promise<CategoryTreeNode[]> {
  if (usePlaceholderData) {
    return dependencies.buildDefaultCategories(true);
  }

  try {
    const sources = await dependencies.getFeedSources();
    if (sources.length === 0) {
      return dependencies.buildDefaultCategories(false);
    }

    return dependencies.buildCategoriesFromSources(sources);
  } catch {
    return dependencies.buildDefaultCategories(false);
  }
}
