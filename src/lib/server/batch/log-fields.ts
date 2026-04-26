import type { ArticleFilter, ArticleSortOrder } from "@/lib/core";

/**
 * Describes the options for batch request log fields.
 */
interface BatchRequestLogFieldsOptions {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  articleSortOrder: ArticleSortOrder;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
}

/**
 * Build the batch request log fields.
 * @param options - The options used to build the batch request log fields.
 * @returns The batch request log fields.
 */
export function buildBatchRequestLogFields(
  options: BatchRequestLogFieldsOptions,
) {
  return {
    articleFilter: options.articleFilter,
    articleLimit: options.articleLimit,
    articleSortOrder: options.articleSortOrder,
    forceRefresh: options.forceRefresh || options.forceResolveUpstream,
    ...(options.forceResolveUpstream ? { forceResolveUpstream: true } : {}),
  };
}
