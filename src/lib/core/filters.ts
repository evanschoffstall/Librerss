/** Shared article-filter values used across dashboard, API, and batch queries. */
export const ARTICLE_FILTERS = ["all", "unread", "read", "starred"] as const;

/** Canonical article visibility filter for dashboard and batch-feed requests. */
export type ArticleFilter = (typeof ARTICLE_FILTERS)[number];

/**
 * Return whether is article filter.
 * @param value - The value.
 * @returns Whether is article filter.
 */
export function isArticleFilter(value: unknown): value is ArticleFilter {
  return (
    typeof value === "string" &&
    ARTICLE_FILTERS.includes(value as ArticleFilter)
  );
}

/**
 * Canonical sort-order values for article lists. `"newest"` (descending by
 * publication date) is the default; `"oldest"` reverses the display order
 * within the already-loaded article window.
 */
export const ARTICLE_SORT_ORDERS = ["newest", "oldest"] as const;

/** Display order for the article feed: newest-first (default) or oldest-first. */
export type ArticleSortOrder = (typeof ARTICLE_SORT_ORDERS)[number];

/**
 * Return whether the given value is a valid {@link ArticleSortOrder}.
 * @param value - The value to check.
 * @returns `true` when `value` is a member of {@link ARTICLE_SORT_ORDERS}.
 */
export function isArticleSortOrder(value: unknown): value is ArticleSortOrder {
  return (
    typeof value === "string" &&
    ARTICLE_SORT_ORDERS.includes(value as ArticleSortOrder)
  );
}
