import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import { type Article, ARTICLE_FILTERS, type ArticleFilter } from "@/lib/core";

export const ARTICLE_FILTER_OPTIONS = ARTICLE_FILTERS;
export type { ArticleFilter };

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
