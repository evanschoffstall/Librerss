import { memo, useMemo } from "react";

import type { FeedVirtualListSharedProps } from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualListContracts";
import type { Article } from "@/lib/core";

import { buildFeedVirtualListEntries } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import { FeedVirtualListTestSurface } from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualListTestSurface";
import { FeedVirtualListRuntime } from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualListViewport";

export interface FeedVirtualListProps extends FeedVirtualListSharedProps {
  articles: Article[];
  expandedArticleKey: null | string;
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
  showLoadMoreBoundary: boolean;
}

/**
 * Feed-owned TanStack Virtual surface.
 *
 * The shared dashboard viewport remains the scroll owner while this component
 * owns row measurement, total-height reporting, and the virtualized load-more
 * boundary that pagination observes.
 */
export const FeedVirtualList = memo(function FeedVirtualList({
  articles,
  className,
  estimatedItemHeight,
  expandedArticleKey,
  feedViewKey,
  isCollapseScrollRestoreActive,
  loadMoreSentinelRef,
  minimumTotalListHeight,
  onTotalListHeightChange,
  renderArticle,
  scrollMode,
  scrollViewport,
  showLoadMoreBoundary,
}: FeedVirtualListProps) {
  const isTestEnvironment =
    process.env.NODE_ENV === "test" ||
    (typeof window !== "undefined" && "happyDOM" in window);
  const entries = useMemo(
    () =>
      buildFeedVirtualListEntries(
        articles,
        feedViewKey,
        scrollMode,
        showLoadMoreBoundary,
      ),
    [articles, feedViewKey, scrollMode, showLoadMoreBoundary],
  );

  if (isTestEnvironment) {
    return (
      <FeedVirtualListTestSurface
        className={className}
        entries={entries}
        estimatedItemHeight={estimatedItemHeight}
        loadMoreSentinelRef={loadMoreSentinelRef}
        minimumTotalListHeight={minimumTotalListHeight}
        onTotalListHeightChange={onTotalListHeightChange}
        renderArticle={renderArticle}
        scrollViewport={scrollViewport}
      />
    );
  }

  return (
    <FeedVirtualListRuntime
      className={className}
      entries={entries}
      estimatedItemHeight={estimatedItemHeight}
      expandedArticleKey={expandedArticleKey}
      feedViewKey={feedViewKey}
      isCollapseScrollRestoreActive={isCollapseScrollRestoreActive}
      loadMoreSentinelRef={loadMoreSentinelRef}
      minimumTotalListHeight={minimumTotalListHeight}
      onTotalListHeightChange={onTotalListHeightChange}
      renderArticle={renderArticle}
      scrollMode={scrollMode}
      scrollViewport={scrollViewport}
    />
  );
});
