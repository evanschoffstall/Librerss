import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import type { buildFeedVirtualListEntries } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import type { Article } from "@/lib/core";

import {
  FeedVirtualListArticleRow,
  FeedVirtualListBoundaryRow,
} from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualListRows";

/**
 * Defines the feed virtual list entry type.
 */
type FeedVirtualListEntry = ReturnType<
  typeof buildFeedVirtualListEntries
>[number];

/**
 * Describes the props for the feed virtual list test surface component.
 */
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

/**
 * Describes the options for measured test surface.
 */
type MeasuredTestSurfaceOptions = Parameters<typeof reportMeasuredTotalSize>[0];

/**
 * Describes the options for report measured total size.
 */
interface ReportMeasuredTotalSizeOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  estimatedItemHeight: number;
  estimatedTotalSize: number;
  isMountedRef: RefObject<boolean>;
  lastReportedTotalSizeRef: RefObject<null | number>;
  onTotalListHeightChange: (nextTotalListHeight: number) => void;
  scrollViewport: HTMLElement;
}

/**
 * Render the feed virtual list test surface component.
 * @param props - The component props.
 * @returns The rendered feed virtual list test surface component.
 */
export function FeedVirtualListTestSurface(
  props: FeedVirtualListTestSurfaceProps,
) {
  const {
    className,
    entries,
    estimatedItemHeight,
    loadMoreSentinelRef,
    minimumTotalListHeight,
    onTotalListHeightChange,
    renderArticle,
    scrollViewport,
  } = props;
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
 * Process the measure test surface total size.
 * @param container - The container.
 * @param estimatedItemHeight - The estimated item height value.
 * @param estimatedTotalSize - The estimated total size.
 * @param scrollViewport - The scroll viewport.
 * @returns The measure test surface total size.
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
 * Process the report measured total size.
 * @param options - The options used to process the report measured total size.
 */
function reportMeasuredTotalSize(options: ReportMeasuredTotalSizeOptions) {
  const {
    containerRef,
    estimatedItemHeight,
    estimatedTotalSize,
    isMountedRef,
    lastReportedTotalSizeRef,
    onTotalListHeightChange,
    scrollViewport,
  } = options;
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
 * Manage the measured test surface total size.
 * @param options - The options used to manage the measured test surface total size.
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
