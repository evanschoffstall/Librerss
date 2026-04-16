/** Shared article-filter values used across dashboard, API, and batch queries. */
export const ARTICLE_FILTERS = ["all", "unread", "read", "starred"] as const;

/** Canonical article visibility filter for dashboard and batch-feed requests. */
export type ArticleFilter = (typeof ARTICLE_FILTERS)[number];

/** Runtime guard for validating external article-filter input. */
export function isArticleFilter(value: unknown): value is ArticleFilter {
  return (
    typeof value === "string" &&
    ARTICLE_FILTERS.includes(value as ArticleFilter)
  );
}
