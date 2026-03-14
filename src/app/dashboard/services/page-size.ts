/** Allowed article-list page sizes exposed in dashboard settings. */
export const ARTICLE_PAGE_SIZE_OPTIONS = [10, 20] as const;

/** Default article-list page size used when no valid preference is persisted. */
export const DEFAULT_ARTICLE_PAGE_SIZE = ARTICLE_PAGE_SIZE_OPTIONS[0];

/**
 * Normalizes persisted article page sizes to the supported settings values.
 *
 * Legacy values such as 25 or 50 can remain in local storage after settings
 * options change, so callers use this helper to coerce stale values back to
 * the supported default before rendering or persisting them again.
 *
 * @param value - Persisted or requested page size.
 * @returns A supported page size.
 */
export function normalizeArticlePageSize(value: number): number {
  return ARTICLE_PAGE_SIZE_OPTIONS.includes(
    value as (typeof ARTICLE_PAGE_SIZE_OPTIONS)[number],
  )
    ? value
    : DEFAULT_ARTICLE_PAGE_SIZE;
}
