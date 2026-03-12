import { type ArticleFilter, filterArticlesByState } from "./article-filters";
import { buildDisplayCategories } from "./category-display";
import { findFeedNodeByKey, SYSTEM_ALL_FEEDS_CATEGORY } from "./category-tree";

import { type Article, type CategoryTreeNode } from "@/lib";

interface DashboardViewModelInput {
  articleFilter: ArticleFilter;
  categories: CategoryTreeNode[];
  collapsingArticleKey: null | string;
  customCategoryLabels: string[];
  expandedArticleKey: null | string;
  feed: Article[];
  orderedCategoryLabels: string[];
  searchTerm: string;
  selectedCategory: string;
}

export function buildDashboardViewModel({
  articleFilter,
  categories,
  collapsingArticleKey,
  customCategoryLabels,
  expandedArticleKey,
  feed,
  orderedCategoryLabels,
  searchTerm,
  selectedCategory,
}: DashboardViewModelInput) {
  const feedByState = filterArticlesByState(
    feed,
    articleFilter,
    expandedArticleKey,
    collapsingArticleKey,
  );

  const loweredSearchTerm = searchTerm.toLowerCase();
  const filteredFeed = feedByState.filter(
    (article) =>
      article.title.toLowerCase().includes(loweredSearchTerm) ||
      (article.content || "").toLowerCase().includes(loweredSearchTerm),
  );

  const selectedFeedNode = findFeedNodeByKey(categories, selectedCategory);

  const displayCategories = buildDisplayCategories(
    categories,
    customCategoryLabels,
    orderedCategoryLabels,
  );

  const sidebarDisplayCategories = displayCategories
    .map((category) => ({
      ...category,
      children: (category.children ?? []).filter(
        (feedNode) => feedNode.data?.enabled !== false,
      ),
    }))
    .filter((category) => category.children.length > 0);

  const sidebarCategories = [
    SYSTEM_ALL_FEEDS_CATEGORY,
    ...sidebarDisplayCategories,
  ];
  const selectedCategoryNode = sidebarCategories.find(
    (node) => node.key === selectedCategory,
  );

  const selectedFeedUrl =
    selectedFeedNode?.data?.enabled === false
      ? undefined
      : selectedFeedNode?.data?.url;
  const selectedFeed = selectedFeedNode?.label ?? selectedCategoryNode?.label;
  const categoryOptions = displayCategories.map((node) => node.label);

  return {
    categoryOptions,
    displayCategories,
    filteredFeed,
    selectedCategoryNode,
    selectedFeed,
    selectedFeedUrl,
    sidebarCategories,
  };
}
