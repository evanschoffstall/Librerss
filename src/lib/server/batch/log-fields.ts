import type { ArticleFilter } from "@/lib/core";

export function buildBatchRequestLogFields(options: {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
}) {
  return {
    articleFilter: options.articleFilter,
    articleLimit: options.articleLimit,
    forceRefresh: options.forceRefresh || options.forceResolveUpstream,
    ...(options.forceResolveUpstream ? { forceResolveUpstream: true } : {}),
  };
}
