import type { Article } from "@/lib";

import { getArticleKey } from "./article-collection";

export const ARTICLE_FILTER_OPTIONS = [
  "all",
  "unread",
  "read",
  "starred",
] as const;

export type ArticleFilter = (typeof ARTICLE_FILTER_OPTIONS)[number];

export function filterArticlesByState(
  articles: Article[],
  articleFilter: ArticleFilter,
  expandedArticleKey: null | string,
  collapsingArticleKey: null | string,
): Article[] {
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
      collapsingArticleKey === articleKey
    );
  });
}
