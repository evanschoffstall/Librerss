import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import {
  type Article,
  ARTICLE_FILTERS,
  ARTICLE_SORT_ORDERS,
  type ArticleFilter,
  type ArticleSortOrder,
} from "@/lib/core";

export const ARTICLE_FILTER_OPTIONS = ARTICLE_FILTERS;
export const ARTICLE_SORT_ORDER_OPTIONS = ARTICLE_SORT_ORDERS;
export type { ArticleFilter, ArticleSortOrder };

/**
 * Process the filter articles by state.
 * @param articles - The articles.
 * @param articleFilter - The article filter.
 * @param expandedArticleKey - The expanded article key.
 * @param collapsingArticleKeys - The collapsing article keys.
 * @returns The filter articles by state.
 */
export function filterArticlesByState(
  articles: Article[],
  articleFilter: ArticleFilter,
  expandedArticleKey: null | string,
  collapsingArticleKeys: string[],
): Article[] {
  const collapsingArticleKeySet = new Set(collapsingArticleKeys);

  return articles.filter((article) => {
    if (articleFilter === "all") {
      return true;
    }

    if (articleFilter === "read") {
      return Boolean(article.isRead);
    }

    if (articleFilter === "starred") {
      return Boolean(article.isStarred);
    }

    const articleKey = getArticleKey(article);
    return (
      !article.isRead ||
      expandedArticleKey === articleKey ||
      collapsingArticleKeySet.has(articleKey)
    );
  });
}

/**
 * Apply the user's preferred sort order to an article list. The canonical
 * internal feed is always newest-first (descending by publication date), so
 * `"newest"` is a no-op and `"oldest"` returns a reversed copy. Neither path
 * mutates the input array.
 * @param articles - The articles to reorder, expected to be in newest-first order.
 * @param sortOrder - The desired display order.
 * @returns The articles in the requested display order.
 */
export function sortArticlesByOrder(
  articles: Article[],
  sortOrder: ArticleSortOrder,
): Article[] {
  return sortOrder === "oldest" ? [...articles].reverse() : articles;
}
