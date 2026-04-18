import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useMemo, useRef } from "react";

import type { FeedVirtualListSharedProps } from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualListContracts";
import type { Article } from "@/lib/core";

import {
  buildFeedVirtualListEntries,
  isInvertedFeedScrollMode,
  resolveFeedVirtualListOverscanCount,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import {
  FeedVirtualListArticleRow,
  FeedVirtualListBoundaryRow,
} from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualListRows";

interface FeedVirtualListRuntimeProps extends FeedVirtualListSharedProps {
  entries: ReturnType<typeof buildFeedVirtualListEntries>;
  expandedArticleKey: null | string;
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
}

/**
 * Virtualized feed runtime mounted in real browser environments.
 * @param props
 */
export function FeedVirtualListRuntime(props: FeedVirtualListRuntimeProps) {
  const virtualizer = useFeedVirtualizer({
    entries: props.entries,
    estimatedItemHeight: props.estimatedItemHeight,
    expandedArticleKey: props.expandedArticleKey,
    feedViewKey: props.feedViewKey,
    isCollapseScrollRestoreActive: props.isCollapseScrollRestoreActive,
    scrollMode: props.scrollMode,
    scrollViewport: props.scrollViewport,
  });
  const lastReportedTotalSizeRef = useRef<null | number>(null);
  const {
    boundaryEntry,
    boundaryOffsetTop,
    containerHeight,
    invertedOffset,
    totalSize,
  } = resolveFeedVirtualListLayout({
    entries: props.entries,
    minimumTotalListHeight: props.minimumTotalListHeight,
    scrollMode: props.scrollMode,
    scrollViewport: props.scrollViewport,
    virtualizer,
  });
  const hasRenderedBoundary = virtualizer
    .getVirtualItems()
    .some(
      (virtualItem) => props.entries[virtualItem.index]?.kind === "boundary",
    );

  useLayoutEffect(() => {
    if (lastReportedTotalSizeRef.current === totalSize) {
      return;
    }

    lastReportedTotalSizeRef.current = totalSize;
    props.onTotalListHeightChange(totalSize);
  }, [props.onTotalListHeightChange, totalSize]);

  return (
    <div
      className={props.className}
      data-feed-virtualizer="true"
      style={{
        height: `${containerHeight}px`,
        position: "relative",
        width: "100%",
      }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const entry = props.entries[virtualItem.index];

        return renderVirtualEntry({
          entries: props.entries,
          key: entry.key,
          loadMoreSentinelRef: props.loadMoreSentinelRef,
          offsetTop: virtualItem.start + invertedOffset,
          renderArticle: props.renderArticle,
          virtualItem,
          virtualizer,
        });
      })}
      {boundaryEntry !== undefined &&
      !hasRenderedBoundary &&
      boundaryOffsetTop !== null ? (
        <FeedVirtualListBoundaryRow
          index={props.entries.findIndex((entry) => entry.kind === "boundary")}
          itemKey={boundaryEntry.key}
          key={boundaryEntry.key}
          loadMoreSentinelRef={props.loadMoreSentinelRef}
          offsetTop={boundaryOffsetTop}
        />
      ) : null}
    </div>
  );
}

/**
 * @param options
 * @param options.entries
 * @param options.key
 * @param options.loadMoreSentinelRef
 * @param options.offsetTop
 * @param options.renderArticle
 * @param options.virtualItem
 * @param options.virtualizer
 */
function renderVirtualEntry(options: {
  entries: FeedVirtualListRuntimeProps["entries"];
  key: string;
  loadMoreSentinelRef: FeedVirtualListRuntimeProps["loadMoreSentinelRef"];
  offsetTop: number;
  renderArticle: (article: Article) => React.JSX.Element;
  virtualItem: ReturnType<
    ReturnType<typeof useVirtualizer>["getVirtualItems"]
  >[number];
  virtualizer: Virtualizer<HTMLElement, Element>;
}) {
  const entry = options.entries[options.virtualItem.index];

  if (entry.kind === "boundary") {
    return (
      <FeedVirtualListBoundaryRow
        index={options.virtualItem.index}
        itemKey={entry.key}
        key={options.key}
        loadMoreSentinelRef={options.loadMoreSentinelRef}
        measureElement={options.virtualizer.measureElement}
        offsetTop={options.offsetTop}
      />
    );
  }

  return entry.article ? (
    <FeedVirtualListArticleRow
      article={entry.article}
      index={options.virtualItem.index}
      itemKey={entry.key}
      key={options.key}
      measureElement={options.virtualizer.measureElement}
      offsetTop={options.offsetTop}
      renderArticle={options.renderArticle}
    />
  ) : null;
}

/**
 * @param entries
 * @param totalSize
 * @param invertedOffset
 */
function resolveBoundaryOffsetTop(
  entries: FeedVirtualListRuntimeProps["entries"],
  totalSize: number,
  invertedOffset: number,
) {
  const boundaryIndex = entries.findIndex((entry) => entry.kind === "boundary");

  if (boundaryIndex < 0) {
    return null;
  }

  return boundaryIndex === 0 ? invertedOffset : totalSize - 1 + invertedOffset;
}

/**
 * @param root0
 * @param root0.entries
 * @param root0.minimumTotalListHeight
 * @param root0.scrollMode
 * @param root0.scrollViewport
 * @param root0.virtualizer
 */
function resolveFeedVirtualListLayout({
  entries,
  minimumTotalListHeight,
  scrollMode,
  scrollViewport,
  virtualizer,
}: {
  entries: FeedVirtualListRuntimeProps["entries"];
  minimumTotalListHeight: FeedVirtualListRuntimeProps["minimumTotalListHeight"];
  scrollMode: FeedVirtualListRuntimeProps["scrollMode"];
  scrollViewport: FeedVirtualListRuntimeProps["scrollViewport"];
  virtualizer: Virtualizer<HTMLElement, Element>;
}) {
  const totalSize = Math.ceil(virtualizer.getTotalSize());
  const containerHeight = Math.max(
    totalSize,
    scrollViewport.clientHeight,
    Math.ceil(minimumTotalListHeight ?? 0),
  );
  const invertedOffset = isInvertedFeedScrollMode(scrollMode)
    ? Math.max(0, containerHeight - totalSize)
    : 0;
  const boundaryEntry = entries.find((entry) => entry.kind === "boundary");

  return {
    boundaryEntry,
    boundaryOffsetTop:
      boundaryEntry === undefined
        ? null
        : resolveBoundaryOffsetTop(entries, totalSize, invertedOffset),
    containerHeight,
    invertedOffset,
    totalSize,
  };
}

/**
 * @param scrollViewport
 */
function resolveVirtualizerRect(scrollViewport: HTMLElement) {
  const rect = scrollViewport.getBoundingClientRect();
  return {
    height: Math.max(scrollViewport.clientHeight, rect.height, 0),
    width: Math.max(scrollViewport.clientWidth, rect.width, 0),
  };
}

/**
 * @param options
 * @param options.entries
 * @param options.estimatedItemHeight
 * @param options.expandedArticleKey
 * @param options.feedViewKey
 * @param options.isCollapseScrollRestoreActive
 * @param options.scrollMode
 * @param options.scrollViewport
 */
function useFeedVirtualizer(options: {
  entries: FeedVirtualListRuntimeProps["entries"];
  estimatedItemHeight: number;
  expandedArticleKey: null | string;
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
  scrollMode: FeedVirtualListRuntimeProps["scrollMode"];
  scrollViewport: FeedVirtualListRuntimeProps["scrollViewport"];
}) {
  const overscan = useMemo(
    () =>
      resolveFeedVirtualListOverscanCount(
        options.estimatedItemHeight,
        options.scrollMode,
        options.expandedArticleKey,
        options.isCollapseScrollRestoreActive,
      ),
    [
      options.estimatedItemHeight,
      options.expandedArticleKey,
      options.isCollapseScrollRestoreActive,
      options.scrollMode,
    ],
  );

  return useVirtualizer({
    count: options.entries.length,
    /**
     * @param index
     */
    estimateSize: (index) =>
      options.entries[index]?.kind === "boundary"
        ? 1
        : options.estimatedItemHeight,
    /**
     * @param index
     */
    getItemKey: (index) =>
      options.entries[index]?.key ??
      `${options.feedViewKey}:virtual-item:${index}`,
    /**
     *
     */
    getScrollElement: () => options.scrollViewport,
    initialRect: resolveVirtualizerRect(options.scrollViewport),
    overscan,
  });
}
