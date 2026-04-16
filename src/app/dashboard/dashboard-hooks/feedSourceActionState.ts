import type { Dispatch, SetStateAction } from "react";

import type { Article, CategoryTreeNode } from "@/lib/core";

import { FeedSelectionFetchers } from "@/app/dashboard/dashboard-services/selection";

export type FeedSourceActionState = FeedSelectionFetchers & {
  categories: CategoryTreeNode[];
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setCategories: Dispatch<SetStateAction<CategoryTreeNode[]>>;
  setFeed: Dispatch<SetStateAction<Article[]>>;
  setSelectedCategory: Dispatch<SetStateAction<string>>;
};
