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
  expandedArticleKey: string | null,
  collapsingArticleKey: string | null,
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

// ─── Generic article filtering/sorting (merged from article-query.ts) ────────

type FilterableArticle = {
  isRead?: boolean;
  isStarred?: boolean;
  publishedAt?: Date | string | number;
};

export function filterArticles<T extends FilterableArticle>(
  articles: T[],
  options: {
    unreadOnly?: boolean;
    starredOnly?: boolean;
  },
): T[] {
  return articles.filter((article) => {
    if (options.unreadOnly && article.isRead) {
      return false;
    }
    if (options.starredOnly && !article.isStarred) {
      return false;
    }
    return true;
  });
}

export function sortArticles<T extends FilterableArticle>(
  articles: T[],
  options: {
    by: "date";
    order: "asc" | "desc";
  },
): T[] {
  const multiplier = options.order === "asc" ? 1 : -1;

  return [...articles].sort((a, b) => {
    const left = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const right = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return (left - right) * multiplier;
  });
}
