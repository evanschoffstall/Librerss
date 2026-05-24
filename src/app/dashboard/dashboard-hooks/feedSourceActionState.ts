import type { Dispatch, SetStateAction } from "react";

import type { FeedSelectionFetchers } from "@/app/dashboard/dashboard-services/selection";
import type { Article, CategoryTreeNode } from "@/lib/core";

/**
 * Describes the feed source action state.
 */
export type FeedSourceActionState = FeedSelectionFetchers & {
  categories: CategoryTreeNode[];
  loadFeedSources: (
    options?: LoadFeedSourcesOptions,
  ) => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setCategories: Dispatch<SetStateAction<CategoryTreeNode[]>>;
  setFeed: Dispatch<SetStateAction<Article[]>>;
  setSelectedCategory: Dispatch<SetStateAction<string>>;
};

/**
 * Describes the options available when reloading the feed source tree.
 */
interface LoadFeedSourcesOptions {
  forceFresh?: boolean;
}
