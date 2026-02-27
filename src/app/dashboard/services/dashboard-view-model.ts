import { type Article, type CategoryTreeNode } from "@/lib";
import { filterArticlesByState, type ArticleFilter } from "./article-filters";
import { buildDisplayCategories } from "./category-display";
import { findFeedNodeByKey } from "./category-feeds";
import { SYSTEM_ALL_FEEDS_CATEGORY } from "./category-tree";

type DashboardViewModelInput = {
  feed: Article[];
  articleFilter: ArticleFilter;
  expandedArticleKey: string | null;
  collapsingArticleKey: string | null;
  searchTerm: string;
  categories: CategoryTreeNode[];
  customCategoryLabels: string[];
  orderedCategoryLabels: string[];
  selectedCategory: string;
};

export function buildDashboardViewModel({
  feed,
  articleFilter,
  expandedArticleKey,
  collapsingArticleKey,
  searchTerm,
  categories,
  customCategoryLabels,
  orderedCategoryLabels,
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
    .filter((category) => (category.children?.length ?? 0) > 0);

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
    filteredFeed,
    displayCategories,
    sidebarCategories,
    selectedCategoryNode,
    selectedFeedUrl,
    selectedFeed,
    categoryOptions,
  };
}
