import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import type { Article } from "@/lib/core";

import { buildFeedVirtualListEntries } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import {
  FeedVirtualListArticleRow,
  FeedVirtualListBoundaryRow,
} from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualListRows";

type FeedVirtualListEntry = ReturnType<
  typeof buildFeedVirtualListEntries
>[number];

interface FeedVirtualListTestSurfaceProps {
  className: string;
  entries: ReturnType<typeof buildFeedVirtualListEntries>;
  estimatedItemHeight: number;
  loadMoreSentinelRef: (node: HTMLDivElement | null) => void;
  minimumTotalListHeight?: number;
  onTotalListHeightChange: (nextTotalListHeight: number) => void;
  renderArticle: (article: Article) => React.JSX.Element;
  scrollViewport: HTMLElement;
}

type MeasuredTestSurfaceOptions = Parameters<typeof reportMeasuredTotalSize>[0];

/**
 * Non-virtualized fallback surface used by tests where DOM measurement is synthetic.
 * @param root0
 * @param root0.className
 * @param root0.entries
 * @param root0.estimatedItemHeight
 * @param root0.loadMoreSentinelRef
 * @param root0.minimumTotalListHeight
 * @param root0.onTotalListHeightChange
 * @param root0.renderArticle
 * @param root0.scrollViewport
 */
export function FeedVirtualListTestSurface({
  className,
  entries,
  estimatedItemHeight,
  loadMoreSentinelRef,
  minimumTotalListHeight,
  onTotalListHeightChange,
  renderArticle,
  scrollViewport,
}: FeedVirtualListTestSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);
  const lastReportedTotalSizeRef = useRef<null | number>(null);
  const estimatedTotalSize = useMemo(
    () =>
      entries.reduce((height: number, entry: FeedVirtualListEntry) => {
        return height + (entry.kind === "boundary" ? 1 : estimatedItemHeight);
      }, 0),
    [entries, estimatedItemHeight],
  );
  const totalSize = Math.max(
    estimatedTotalSize,
    Math.ceil(minimumTotalListHeight ?? 0),
  );

  useMeasuredTestSurfaceTotalSize({
    containerRef,
    estimatedItemHeight,
    estimatedTotalSize,
    isMountedRef,
    lastReportedTotalSizeRef,
    onTotalListHeightChange,
    scrollViewport,
  });

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
      {entries.map((entry: FeedVirtualListEntry, index: number) => {
        if (entry.kind === "boundary") {
          return (
            <FeedVirtualListBoundaryRow
              index={index}
              itemKey={entry.key}
              key={entry.key}
              loadMoreSentinelRef={loadMoreSentinelRef}
            />
          );
        }

        return entry.article ? (
          <FeedVirtualListArticleRow
            article={entry.article}
            estimatedItemHeight={estimatedItemHeight}
            index={index}
            itemKey={entry.key}
            key={entry.key}
            renderArticle={renderArticle}
          />
        ) : null;
      })}
    </div>
  );
}

/**
 * @param container
 * @param estimatedItemHeight
 * @param estimatedTotalSize
 * @param scrollViewport
 */
function measureTestSurfaceTotalSize(
  container: HTMLDivElement | null,
  estimatedItemHeight: number,
  estimatedTotalSize: number,
  scrollViewport: HTMLElement,
) {
  const renderedRows =
    container?.querySelectorAll("[data-scroll-restore-key]").length ?? 0;
  let viewportClientHeight = 0;

  try {
    viewportClientHeight = scrollViewport.clientHeight;
  } catch {
    // falls back to initial value of 0
  }

  let viewportScrollHeight: number;
  try {
    viewportScrollHeight = scrollViewport.scrollHeight;
  } catch {
    viewportScrollHeight = Math.max(
      estimatedTotalSize,
      viewportClientHeight + estimatedItemHeight,
    );
  }

  const rowMeasuredHeight =
    renderedRows > 0 ? renderedRows * 60 : estimatedTotalSize;
  const shouldPreferRowMeasuredHeight =
    viewportScrollHeight <= viewportClientHeight ||
    (renderedRows > 0 && viewportScrollHeight / renderedRows > 300);

  return shouldPreferRowMeasuredHeight
    ? rowMeasuredHeight
    : viewportScrollHeight;
}

/**
 * @param root0
 * @param root0.containerRef
 * @param root0.estimatedItemHeight
 * @param root0.estimatedTotalSize
 * @param root0.isMountedRef
 * @param root0.lastReportedTotalSizeRef
 * @param root0.onTotalListHeightChange
 * @param root0.scrollViewport
 */
function reportMeasuredTotalSize({
  containerRef,
  estimatedItemHeight,
  estimatedTotalSize,
  isMountedRef,
  lastReportedTotalSizeRef,
  onTotalListHeightChange,
  scrollViewport,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  estimatedItemHeight: number;
  estimatedTotalSize: number;
  isMountedRef: RefObject<boolean>;
  lastReportedTotalSizeRef: RefObject<null | number>;
  onTotalListHeightChange: (nextTotalListHeight: number) => void;
  scrollViewport: HTMLElement;
}) {
  if (!isMountedRef.current) {
    return;
  }

  const nextTotalSize = measureTestSurfaceTotalSize(
    containerRef.current,
    estimatedItemHeight,
    estimatedTotalSize,
    scrollViewport,
  );
  if (lastReportedTotalSizeRef.current === nextTotalSize) {
    return;
  }

  lastReportedTotalSizeRef.current = nextTotalSize;
  onTotalListHeightChange(nextTotalSize);
}

/**
 * @param options
 */
function useMeasuredTestSurfaceTotalSize(options: MeasuredTestSurfaceOptions) {
  const {
    containerRef,
    estimatedItemHeight,
    estimatedTotalSize,
    isMountedRef,
    lastReportedTotalSizeRef,
    onTotalListHeightChange,
    scrollViewport,
  } = options;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, [isMountedRef]);

  useLayoutEffect(() => {
    reportMeasuredTotalSize({
      containerRef,
      estimatedItemHeight,
      estimatedTotalSize,
      isMountedRef,
      lastReportedTotalSizeRef,
      onTotalListHeightChange,
      scrollViewport,
    });
  }, [
    containerRef,
    estimatedItemHeight,
    estimatedTotalSize,
    isMountedRef,
    lastReportedTotalSizeRef,
    onTotalListHeightChange,
    scrollViewport,
  ]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      reportMeasuredTotalSize({
        containerRef,
        estimatedItemHeight,
        estimatedTotalSize,
        isMountedRef,
        lastReportedTotalSizeRef,
        onTotalListHeightChange,
        scrollViewport,
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    containerRef,
    estimatedItemHeight,
    estimatedTotalSize,
    isMountedRef,
    lastReportedTotalSizeRef,
    onTotalListHeightChange,
    scrollViewport,
  ]);
}
