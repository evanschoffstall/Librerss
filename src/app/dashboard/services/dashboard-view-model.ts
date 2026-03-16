import { type Article, type CategoryTreeNode } from "@/lib";

import { type ArticleFilter, filterArticlesByState } from "./article-filters";
import { buildDisplayCategories } from "./category-display";
import { findFeedNodeByKey, SYSTEM_ALL_FEEDS_CATEGORY } from "./category-tree";

const articleContentSearchTextCache = new WeakMap<Article, string>();
const articleTitleSearchTextCache = new WeakMap<Article, string>();

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

  const filteredFeed = filterArticlesBySearchTerm(feedByState, searchTerm);

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
