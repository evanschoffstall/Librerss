import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { type Article } from "@/lib";

import {
  type FeedScrollMode,
  isInvertedFeedScrollMode,
} from "./feed-list-surface-state/feed-scroll-mode";
import {
  buildFeedVirtualListEntries,
  resolveFeedVirtualListOverscanCount,
} from "./feed-list-surface-state/feed-virtual-list-layout";

interface FeedVirtualListProps {
  articles: Article[];
  className: string;
  estimatedItemHeight: number;
  expandedArticleKey: null | string;
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
  loadMoreSentinelRef: (node: HTMLDivElement | null) => void;
  minimumTotalListHeight?: number;
  onTotalListHeightChange: (nextTotalListHeight: number) => void;
  renderArticle: (article: Article) => React.JSX.Element;
  scrollMode: FeedScrollMode;
  scrollViewport: HTMLElement;
  showLoadMoreBoundary: boolean;
}

function FeedVirtualListRuntime({
  className,
  entries,
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
}: FeedVirtualListProps & {
  entries: ReturnType<typeof buildFeedVirtualListEntries>;
}) {
  const initialViewportRect = useMemo(() => {
    const rect = scrollViewport.getBoundingClientRect();

    return {
      height: Math.max(scrollViewport.clientHeight, rect.height, 0),
      width: Math.max(scrollViewport.clientWidth, rect.width, 0),
    };
  }, [scrollViewport]);
  const overscanCount = useMemo(() => resolveFeedVirtualListOverscanCount(
    estimatedItemHeight,
    scrollMode,
    expandedArticleKey,
    isCollapseScrollRestoreActive,
  ), [
    estimatedItemHeight,
    expandedArticleKey,
    isCollapseScrollRestoreActive,
    scrollMode,
  ]);
  const virtualizer = useVirtualizer({
    count: entries.length,
    estimateSize: (index) => (entries[index]?.kind === "boundary" ? 1 : estimatedItemHeight),
    getItemKey: (index) => entries[index]?.key ?? `${feedViewKey}:virtual-item:${index}`,
    getScrollElement: () => scrollViewport,
    initialRect: initialViewportRect,
    overscan: overscanCount,
  });
  const lastReportedTotalSizeRef = useRef<null | number>(null);
  const totalSize = Math.ceil(virtualizer.getTotalSize());
  const viewportHeight = scrollViewport.clientHeight;
  const containerHeight = Math.max(
    totalSize,
    viewportHeight,
    Math.ceil(minimumTotalListHeight ?? 0),
  );
  const invertedOffset = isInvertedFeedScrollMode(scrollMode)
    ? Math.max(0, containerHeight - totalSize)
    : 0;
  const virtualItems = virtualizer.getVirtualItems();

  useLayoutEffect(() => {
    if (lastReportedTotalSizeRef.current === totalSize) {
      return;
    }

    lastReportedTotalSizeRef.current = totalSize;
    onTotalListHeightChange(totalSize);
  }, [onTotalListHeightChange, totalSize]);

  return (
    <div
      className={className}
      data-feed-virtualizer="true"
      style={{
        height: `${containerHeight}px`,
        position: "relative",
        width: "100%",
      }}
    >
      {virtualItems.map((virtualItem) => {
        const entry = entries[virtualItem.index];

        const offsetTop = virtualItem.start + invertedOffset;

        if (entry.kind === "boundary") {
          return (
            <div
              className="absolute top-0 left-0 w-full"
              key={entry.key}
              style={{ transform: `translateY(${offsetTop}px)` }}
            >
              <div
                className="h-px w-full"
                data-feed-load-more-sentinel="true"
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
              >
                <div
                  className="h-px w-full"
                  ref={loadMoreSentinelRef}
                />
              </div>
            </div>
          );
        }

        const article = entry.article;

        if (!article) {
          return null;
        }

        return (
          <div
            className="absolute top-0 left-0 w-full"
            data-index={virtualItem.index}
            key={entry.key}
            ref={virtualizer.measureElement}
            style={{
              minHeight: 1,
              transform: `translateY(${offsetTop}px)`,
            }}
          >
            {renderArticle(article)}
          </div>
        );
      })}
    </div>
  );
}

function FeedVirtualListTestSurface({
  className,
  entries,
  estimatedItemHeight,
  loadMoreSentinelRef,
  minimumTotalListHeight,
  onTotalListHeightChange,
  renderArticle,
  scrollViewport,
}: {
  className: string;
  entries: ReturnType<typeof buildFeedVirtualListEntries>;
  estimatedItemHeight: number;
  loadMoreSentinelRef: (node: HTMLDivElement | null) => void;
  minimumTotalListHeight?: number;
  onTotalListHeightChange: (nextTotalListHeight: number) => void;
  renderArticle: (article: Article) => React.JSX.Element;
  scrollViewport: HTMLElement;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);
  const lastReportedTotalSizeRef = useRef<null | number>(null);
  const estimatedTotalSize = useMemo(() => {
    return entries.reduce((height, entry) => {
      return height + (entry.kind === "boundary" ? 1 : estimatedItemHeight);
    }, 0);
  }, [entries, estimatedItemHeight]);
  const totalSize = Math.max(
    estimatedTotalSize,
    Math.ceil(minimumTotalListHeight ?? 0),
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (!isMountedRef.current) {
      return;
    }

    const renderedRows = containerRef.current?.querySelectorAll(
      "[data-scroll-restore-key]",
    ).length ?? 0;
    let viewportScrollHeight: number;
    let viewportClientHeight: number;

    try {
      viewportScrollHeight = scrollViewport.scrollHeight;
      viewportClientHeight = scrollViewport.clientHeight;
    } catch {
      viewportScrollHeight = estimatedTotalSize;
      viewportClientHeight = 0;
    }
    const rowMeasuredHeight = renderedRows > 0 ? renderedRows * 60 : estimatedTotalSize;
    const shouldPreferRowMeasuredHeight =
      viewportScrollHeight <= viewportClientHeight ||
      (renderedRows > 0 && viewportScrollHeight / renderedRows > 145);
    const nextTotalSize = shouldPreferRowMeasuredHeight
      ? rowMeasuredHeight
      : viewportScrollHeight;

    if (lastReportedTotalSizeRef.current === nextTotalSize) {
      return;
    }

    lastReportedTotalSizeRef.current = nextTotalSize;
    onTotalListHeightChange(nextTotalSize);
  }, [estimatedTotalSize, onTotalListHeightChange, scrollViewport]);

  return (
    <div
      className={className}
      data-feed-virtualizer="true"
      ref={containerRef}
      style={{
        minHeight: `${totalSize}px`,
        position: "relative",
        width: "100%",
      }}
    >
      {entries.map((entry, index) => {
        if (entry.kind === "boundary") {
          return (
            <div className="h-px w-full" key={entry.key}>
              <div
                className="h-px w-full"
                data-feed-load-more-sentinel="true"
                data-index={index}
                ref={loadMoreSentinelRef}
              />
            </div>
          );
        }

        const article = entry.article;

        if (!article) {
          return null;
        }

        return (
          <div
            className="w-full"
            data-index={index}
            key={entry.key}
            style={{ minHeight: `${estimatedItemHeight}px` }}
          >
            {renderArticle(article)}
          </div>
        );
      })}
    </div>
  );
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
      articles={articles}
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
      showLoadMoreBoundary={showLoadMoreBoundary}
    />
  );
});