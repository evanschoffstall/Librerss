import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useMemo, useRef } from "react";

import type { buildFeedVirtualListEntries } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import type { FeedVirtualListSharedProps } from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualListContracts";
import type { Article } from "@/lib/core";

import {
  isInvertedFeedScrollMode,
  resolveFeedVirtualListOverscanCount,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import {
  FeedVirtualListArticleRow,
  FeedVirtualListBoundaryRow,
} from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualListRows";

interface FeedVirtualizerOptions {
  entries: FeedVirtualListRuntimeProps["entries"];
  estimatedItemHeight: number;
  expandedArticleKey: null | string;
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
  scrollMode: FeedVirtualListRuntimeProps["scrollMode"];
  scrollViewport: FeedVirtualListRuntimeProps["scrollViewport"];
}

interface FeedVirtualListLayoutOptions {
  entries: FeedVirtualListRuntimeProps["entries"];
  minimumTotalListHeight: FeedVirtualListRuntimeProps["minimumTotalListHeight"];
  scrollMode: FeedVirtualListRuntimeProps["scrollMode"];
  scrollViewport: FeedVirtualListRuntimeProps["scrollViewport"];
  virtualizer: Virtualizer<HTMLElement, Element>;
}
interface FeedVirtualListRuntimeProps extends FeedVirtualListSharedProps {
  entries: ReturnType<typeof buildFeedVirtualListEntries>;
  expandedArticleKey: null | string;
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
}

interface VirtualEntryOptions {
  entries: FeedVirtualListRuntimeProps["entries"];
  key: string;
  loadMoreSentinelRef: FeedVirtualListRuntimeProps["loadMoreSentinelRef"];
  offsetTop: number;
  renderArticle: (article: Article) => React.JSX.Element;
  virtualItem: ReturnType<
    ReturnType<typeof useVirtualizer>["getVirtualItems"]
  >[number];
  virtualizer: Virtualizer<HTMLElement, Element>;
}

/**
 * Render the feed virtual list runtime component.
 * @param props - The component props.
 * @returns The rendered feed virtual list runtime component.
 */
export function FeedVirtualListRuntime(props: FeedVirtualListRuntimeProps) {
  const { onTotalListHeightChange } = props;
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
    onTotalListHeightChange(totalSize);
  }, [onTotalListHeightChange, totalSize]);

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
 * Render the virtual entry.
 * @param options - The options used to render the virtual entry.
 * @returns The virtual entry.
 */
function renderVirtualEntry(options: VirtualEntryOptions) {
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
 * Resolve the boundary offset top.
 * @param entries - The entries.
 * @param totalSize - The total size.
 * @param invertedOffset - The inverted offset value.
 * @returns The boundary offset top.
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
 * Resolve the feed virtual list layout.
 * @param options - The options used to resolve the feed virtual list layout.
 * @returns The feed virtual list layout.
 */
function resolveFeedVirtualListLayout(options: FeedVirtualListLayoutOptions) {
  const {
    entries,
    minimumTotalListHeight,
    scrollMode,
    scrollViewport,
    virtualizer,
  } = options;
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
 * Resolve the virtualizer rect.
 * @param scrollViewport - The scroll viewport.
 * @returns The virtualizer rect.
 */
function resolveVirtualizerRect(scrollViewport: HTMLElement) {
  const rect = scrollViewport.getBoundingClientRect();
  return {
    height: Math.max(scrollViewport.clientHeight, rect.height, 0),
    width: Math.max(scrollViewport.clientWidth, rect.width, 0),
  };
}

/**
 * Manage the feed virtualizer.
 * @param options - The options used to manage the feed virtualizer.
 * @returns The feed virtualizer state and callbacks.
 */
function useFeedVirtualizer(options: FeedVirtualizerOptions) {
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
     * Process the estimate size.
     * @param index - The index.
     * @returns The estimate size.
     */
    estimateSize: (index) =>
      options.entries[index]?.kind === "boundary"
        ? 1
        : options.estimatedItemHeight,
    /**
     * Return the item key.
     * @param index - The index.
     * @returns The item key.
     */
    getItemKey: (index) =>
      options.entries[index]?.key ??
      `${options.feedViewKey}:virtual-item:${index}`,
    /**
     * Return the scroll element.
     * @returns The scroll element.
     */
    getScrollElement: () => options.scrollViewport,
    initialRect: resolveVirtualizerRect(options.scrollViewport),
    overscan,
  });
}
