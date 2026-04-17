import type { Article, CategoryTreeNode } from "@/lib/core";

import {
  type ArticleFilter,
  filterArticlesByState,
} from "@/app/dashboard/dashboard-services/article";
import { buildDisplayCategories } from "@/app/dashboard/dashboard-services/category";
import {
  findFeedNodeByKey,
  SYSTEM_ALL_FEEDS_CATEGORY,
} from "@/app/dashboard/dashboard-services/category-tree";

const articleContentSearchTextCache = new WeakMap<Article, string>();
const articleTitleSearchTextCache = new WeakMap<Article, string>();

interface DashboardViewModelInput {
  articleFilter: ArticleFilter;
  categories: CategoryTreeNode[];
  collapsingArticleKeys: string[];
  customCategoryLabels: string[];
  expandedArticleKey: null | string;
  feed: Article[];
  orderedCategoryLabels: string[];
  searchTerm: string;
  selectedCategory: string;
  useLocalSearch: boolean;
}

export function buildDashboardViewModel({
  articleFilter,
  categories,
  collapsingArticleKeys,
  customCategoryLabels,
  expandedArticleKey,
  feed,
  orderedCategoryLabels,
  searchTerm,
  selectedCategory,
  useLocalSearch,
}: DashboardViewModelInput) {
  const feedByState = filterArticlesByState(
    feed,
    articleFilter,
    expandedArticleKey,
    collapsingArticleKeys,
  );

  const filteredFeed = useLocalSearch
    ? filterArticlesBySearchTerm(feedByState, searchTerm)
    : feedByState;

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
  return {
    displayCategories,
    filteredFeed,
    selectedCategoryNode,
    selectedFeed,
    selectedFeedUrl,
    sidebarCategories,
  };
}

export function filterArticlesBySearchTerm(
  articles: Article[],
  searchTerm: string,
) {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  if (normalizedSearchTerm === "") {
    return articles;
  }

  return articles.filter((article) =>
    isArticleSearchMatch(article, normalizedSearchTerm),
  );
}

function getArticleContentSearchText(article: Article) {
  const cached = articleContentSearchTextCache.get(article);
  if (cached) {
    return cached;
  }

  const searchText = article.content.toLowerCase();
  articleContentSearchTextCache.set(article, searchText);
  return searchText;
}

function getArticleTitleSearchText(article: Article) {
  const cached = articleTitleSearchTextCache.get(article);
  if (cached) {
    return cached;
  }

  const searchText = article.title.toLowerCase();
  articleTitleSearchTextCache.set(article, searchText);
  return searchText;
}

function isArticleSearchMatch(article: Article, normalizedSearchTerm: string) {
  if (getArticleTitleSearchText(article).includes(normalizedSearchTerm)) {
    return true;
  }

  return getArticleContentSearchText(article).includes(normalizedSearchTerm);
}
