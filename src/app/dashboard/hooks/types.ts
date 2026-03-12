import type { Dispatch, SetStateAction } from "react";

import type { FeedSelectionFetchers } from "../services/selection";

import type { Article, CategoryTreeNode } from "@/lib";

export type FeedSourceActionState = FeedSelectionFetchers & {
  categories: CategoryTreeNode[];
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setCategories: Dispatch<SetStateAction<CategoryTreeNode[]>>;
  setFeed: Dispatch<SetStateAction<Article[]>>;
  setSelectedCategory: Dispatch<SetStateAction<string>>;
};
