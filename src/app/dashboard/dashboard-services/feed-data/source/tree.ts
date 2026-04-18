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
  /**
   * Loads raw feed sources from the API service.
   * @returns The current list of persisted feed sources.
   */
  getFeedSources: () => FeedService.getFeedSources(),
};

/**
 * Process the load feed source tree.
 * @param usePlaceholderData - The placeholder data.
 * @param dependencies - The dependencies.
 * @returns The load feed source tree.
 */
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
