import {
  buildCategoriesFromSources,
  buildDefaultCategories,
} from "@/app/dashboard/dashboard-services/category-tree";
import { FeedService } from "@/lib/api";
import { CategoryTreeNode, FeedSource } from "@/lib/core";

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
