import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import { type Article, ARTICLE_FILTERS, type ArticleFilter } from "@/lib/core";

export const ARTICLE_FILTER_OPTIONS = ARTICLE_FILTERS;
export type { ArticleFilter };

/**
 * @param articles
 * @param articleFilter
 * @param expandedArticleKey
 * @param collapsingArticleKeys
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
