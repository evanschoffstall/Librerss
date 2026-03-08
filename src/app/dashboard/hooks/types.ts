import type { Article, CategoryTreeNode } from "@/lib";
import type { Dispatch, SetStateAction } from "react";
import type { FeedSelectionFetchers } from "../services/selection";

export type FeedSourceActionState = FeedSelectionFetchers & {
  categories: CategoryTreeNode[];
  selectedCategory: string;
  setCategories: Dispatch<SetStateAction<CategoryTreeNode[]>>;
  setSelectedCategory: Dispatch<SetStateAction<string>>;
  setFeed: Dispatch<SetStateAction<Article[]>>;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
};
