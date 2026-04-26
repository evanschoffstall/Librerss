import type { Article, CategoryTreeNode } from "@/lib/core";

import {
  type ArticleFilter,
  type ArticleSortOrder,
  filterArticlesByState,
  sortArticlesByOrder,
} from "@/app/dashboard/dashboard-services/article";
import { buildDisplayCategories } from "@/app/dashboard/dashboard-services/category";
import {
  findFeedNodeByKey,
  SYSTEM_ALL_FEEDS_CATEGORY,
} from "@/app/dashboard/dashboard-services/category-tree";

const articleContentSearchTextCache = new WeakMap<Article, string>();
const articleTitleSearchTextCache = new WeakMap<Article, string>();

/**
 * Describes the dashboard view model input.
 */
interface DashboardViewModelInput {
  articleFilter: ArticleFilter;
  articleSortOrder: ArticleSortOrder;
  categories: CategoryTreeNode[];
  collapsingArticleKeys: string[];
  customCategoryLabels: string[];
  expandedArticleKey: null | string;
  feed: Article[];
  orderedCategoryLabels: string[];
  searchTerm: string;
  selectedCategory: string;
  useLocalSearch: boolean;
  usePlaceholderData: boolean;
}

/**
 * Build the dashboard view model.
 * @param options - The options used to build the dashboard view model.
 * @returns The dashboard view model.
 */
export function buildDashboardViewModel(options: DashboardViewModelInput) {
  const {
    articleFilter,
    articleSortOrder,
    categories,
    collapsingArticleKeys,
    customCategoryLabels,
    expandedArticleKey,
    feed,
    orderedCategoryLabels,
    searchTerm,
    selectedCategory,
    useLocalSearch,
    usePlaceholderData,
  } = options;
  const feedByState = filterArticlesByState(
    feed,
    articleFilter,
    expandedArticleKey,
    collapsingArticleKeys,
  );

  const searchedFeed = useLocalSearch
    ? filterArticlesBySearchTerm(feedByState, searchTerm)
    : feedByState;
  // Production data keeps sort ownership on the server-side article-window
  // query so the React Query cache and visible order remain authoritative.
  // Placeholder mode skips that refetch path, so the view model must apply the
  // user's display preference locally to keep explore-mode behavior aligned
  // with the toolbar toggle.
  const filteredFeed = usePlaceholderData
    ? sortArticlesByOrder(searchedFeed, articleSortOrder)
    : searchedFeed;

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

/**
 * Process the filter articles by search term.
 * @param articles - The articles.
 * @param searchTerm - The search term.
 * @returns The filter articles by search term.
 */
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

/**
 * Return the article content search text.
 * @param article - The article.
 * @returns The article content search text.
 */
function getArticleContentSearchText(article: Article) {
  const cached = articleContentSearchTextCache.get(article);
  if (cached) {
    return cached;
  }

  const searchText = article.content.toLowerCase();
  articleContentSearchTextCache.set(article, searchText);
  return searchText;
}

/**
 * Return the article title search text.
 * @param article - The article.
 * @returns The article title search text.
 */
function getArticleTitleSearchText(article: Article) {
  const cached = articleTitleSearchTextCache.get(article);
  if (cached) {
    return cached;
  }

  const searchText = article.title.toLowerCase();
  articleTitleSearchTextCache.set(article, searchText);
  return searchText;
}

/**
 * Return whether is article search match.
 * @param article - The article.
 * @param normalizedSearchTerm - The d search term.
 * @returns Whether is article search match.
 */
function isArticleSearchMatch(article: Article, normalizedSearchTerm: string) {
  if (getArticleTitleSearchText(article).includes(normalizedSearchTerm)) {
    return true;
  }

  return getArticleContentSearchText(article).includes(normalizedSearchTerm);
}
