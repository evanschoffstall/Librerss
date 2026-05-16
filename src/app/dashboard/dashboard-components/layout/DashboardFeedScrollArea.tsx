"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Describes the measured layout inputs used to position the feed scrollbar.
 */
export interface FeedScrollbarMeasurement {
  clientHeight: number;
  hasTransientPaginationSkeletons: boolean;
  scrollHeight: number;
  scrollTop: number;
  virtualizedListHeight: null | number;
}

/**
 * Describes the resolved overlay scrollbar geometry for the dashboard feed.
 */
export interface FeedScrollbarMetrics {
  isVisible: boolean;
  thumbHeight: number;
  thumbOffsetTop: number;
}

/**
 * Describes the props for the dashboard feed scroll area component.
 */
interface DashboardFeedScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  viewportClassName?: string;
}

const MIN_FEED_SCROLLBAR_THUMB_HEIGHT_PX = 32;
const HIDDEN_FEED_SCROLLBAR_METRICS: FeedScrollbarMetrics = {
  isVisible: false,
  thumbHeight: 0,
  thumbOffsetTop: 0,
};

/**
 * Resolve custom scrollbar geometry from committed feed layout measurements.
 *
 * Load-more skeleton rows deliberately live outside the virtualized tree so the
 * user sees them immediately during pagination. While those temporary rows are
 * visible, the browser's live scrollHeight includes placeholder height that the
 * committed virtualized total has not adopted yet. The overlay thumb therefore
 * follows the virtualized total during that transient state, which keeps the
 * handle pinned to the user's actual position instead of jumping between the
 * placeholder range and the eventual article range.
 * @param measurement - The current viewport and virtualized-list measurements.
 * @returns The stable overlay scrollbar metrics for the feed viewport.
 */
export function resolveFeedScrollbarMetrics(
  measurement: FeedScrollbarMeasurement,
): FeedScrollbarMetrics {
  const effectiveScrollHeight = Math.max(
    measurement.clientHeight,
    measurement.hasTransientPaginationSkeletons &&
      measurement.virtualizedListHeight !== null
      ? measurement.virtualizedListHeight
      : measurement.scrollHeight,
    measurement.virtualizedListHeight ?? 0,
  );
  const maxScrollTop = effectiveScrollHeight - measurement.clientHeight;

  if (!Number.isFinite(maxScrollTop) || maxScrollTop <= 0) {
    return HIDDEN_FEED_SCROLLBAR_METRICS;
  }

  const rawThumbHeight =
    (measurement.clientHeight / effectiveScrollHeight) *
    measurement.clientHeight;
  const thumbHeight = Math.round(
    Math.min(
      measurement.clientHeight,
      Math.max(MIN_FEED_SCROLLBAR_THUMB_HEIGHT_PX, rawThumbHeight),
    ),
  );
  const availableTrackHeight = measurement.clientHeight - thumbHeight;
  const boundedScrollTop = Math.max(
    0,
    Math.min(measurement.scrollTop, maxScrollTop),
  );
  const thumbOffsetTop = Math.round(
    maxScrollTop <= 0
      ? 0
      : (boundedScrollTop / maxScrollTop) * availableTrackHeight,
  );

  return {
    isVisible: true,
    thumbHeight,
    thumbOffsetTop,
  };
}

/**
 * Return whether has initial feed skeleton.
 * @param viewportElement - The viewport element.
 * @returns Whether has initial feed skeleton.
 */
function hasInitialFeedSkeleton(viewportElement: HTMLElement) {
  return (
    viewportElement.querySelector(
      '[data-dashboard-feed-list-skeleton="true"]',
    ) !== null
  );
}

/**
 * Return whether load-more skeletons are temporarily inflating the feed surface.
 * @param viewportElement - The viewport whose feed surface owns pagination state.
 * @returns Whether pagination skeletons are currently visible outside the virtualized list.
 */
function hasTransientPaginationSkeletons(viewportElement: HTMLElement) {
  const feedSurface = viewportElement.querySelector<HTMLElement>(
    "[data-feed-surface-mode]",
  );

  return feedSurface?.dataset.feedLoadMoreSkeletonsVisible === "true";
}

/**
 * Process the read feed total list height.
 * @param viewportElement - The viewport element.
 * @returns The read feed total list height.
 */
function readFeedTotalListHeight(viewportElement: HTMLElement) {
  const feedSurface = viewportElement.querySelector<HTMLElement>(
    "[data-feed-total-list-height]",
  );
  const rawHeight = feedSurface?.dataset.feedTotalListHeight;

  if (!rawHeight) {
    return null;
  }

  const parsedHeight = Number.parseFloat(rawHeight);

  return Number.isFinite(parsedHeight) && parsedHeight > 0
    ? parsedHeight
    : null;
}

/**
 * Feed-local scroll viewport with a virtualizer-driven shadcn-style scrollbar.
 *
 * Articles scroll through a plain viewport so the feed virtualizer owns row layout.
 * The visible rail and thumb are a lightweight overlay whose size comes from
 * the virtualizer's total-list-height signal and whose position tracks the real
 * viewport scroll offset.
 */
export const DashboardFeedScrollArea = React.forwardRef<
  HTMLDivElement,
  DashboardFeedScrollAreaProps
>(
  /**
   * Render the dashboard feed scroll area component.
   * @param props - The component props.
   * @param ref - The ref.
   * @returns The rendered dashboard feed scroll area component.
   */
  function DashboardFeedScrollArea(props, ref) {
    const { children, className, viewportClassName, ...scrollAreaProps } =
      props;
    const [viewportElement, setViewportElement] =
      React.useState<HTMLDivElement | null>(null);
    const [scrollbarMetrics, setScrollbarMetrics] =
      React.useState<FeedScrollbarMetrics>({
        isVisible: false,
        thumbHeight: 0,
        thumbOffsetTop: 0,
      });

    const handleViewportRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        setViewportElement(node);
      },
      [],
    );

    const updateScrollbarMetrics = React.useCallback(() => {
      if (!viewportElement) {
        setScrollbarMetrics(HIDDEN_FEED_SCROLLBAR_METRICS);
        return;
      }

      if (hasInitialFeedSkeleton(viewportElement)) {
        setScrollbarMetrics(HIDDEN_FEED_SCROLLBAR_METRICS);
        return;
      }

      const { clientHeight, scrollHeight, scrollTop } = viewportElement;
      const virtualizedListHeight = readFeedTotalListHeight(viewportElement);
      const nextMetrics = resolveFeedScrollbarMetrics({
        clientHeight,
        hasTransientPaginationSkeletons:
          hasTransientPaginationSkeletons(viewportElement),
        scrollHeight,
        scrollTop,
        virtualizedListHeight,
      });

      setScrollbarMetrics((currentMetrics) => {
        if (
          currentMetrics.isVisible === nextMetrics.isVisible &&
          currentMetrics.thumbHeight === nextMetrics.thumbHeight &&
          currentMetrics.thumbOffsetTop === nextMetrics.thumbOffsetTop
        ) {
          return currentMetrics;
        }

        return nextMetrics;
      });
    }, [viewportElement]);

    React.useEffect(() => {
      if (!viewportElement) {
        return;
      }

      let animationFrameId = 0;
      let resizeObserver: MutationObserver | null | ResizeObserver = null;
      let mutationObserver: MutationObserver | null = null;
      /**
       * Process the schedule metrics update.
       */
      const scheduleMetricsUpdate = () => {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
          updateScrollbarMetrics();
        });
      };

      if (typeof ResizeObserver === "function") {
        resizeObserver = new ResizeObserver(() => {
          scheduleMetricsUpdate();
        });
        resizeObserver.observe(viewportElement);
        if (viewportElement.firstElementChild instanceof HTMLElement) {
          resizeObserver.observe(viewportElement.firstElementChild);
        }
      }

      if (typeof MutationObserver === "function") {
        mutationObserver = new MutationObserver(() => {
          scheduleMetricsUpdate();
        });
        mutationObserver.observe(viewportElement, {
          attributes: true,
          childList: true,
          subtree: true,
        });
      }

      viewportElement.addEventListener("scroll", scheduleMetricsUpdate, {
        passive: true,
      });

      scheduleMetricsUpdate();

      return () => {
        cancelAnimationFrame(animationFrameId);
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        viewportElement.removeEventListener("scroll", scheduleMetricsUpdate);
      };
    }, [updateScrollbarMetrics, viewportElement]);

    return (
      <div
        className={cn("relative overflow-hidden", className)}
        ref={ref}
        {...scrollAreaProps}
      >
        <div
          className={cn(
            `
            size-full overflow-x-hidden overflow-y-auto rounded-[inherit]
            [scrollbar-gutter:stable] [scrollbar-width:none]
            [&::-webkit-scrollbar]:hidden
          `,
            viewportClassName,
          )}
          data-dashboard-feed-scrollbar="true"
          data-dashboard-feed-scrollbar-overflow={
            scrollbarMetrics.isVisible ? "true" : "false"
          }
          data-feed-scroll-viewport="true"
          data-radix-scroll-area-viewport=""
          ref={handleViewportRef}
        >
          {children}
        </div>
        <div
          aria-hidden="true"
          className={cn(
            `
            pointer-events-none absolute inset-y-0 right-0 w-2.5 border-l
            border-l-transparent p-px transition-opacity
          `,
            scrollbarMetrics.isVisible ? "opacity-100" : "opacity-0",
          )}
        >
          {scrollbarMetrics.isVisible ? (
            <div
              className="w-full rounded-full bg-border"
              data-dashboard-feed-scrollbar-thumb="true"
              style={{
                height: `${scrollbarMetrics.thumbHeight}px`,
                transform: `translateY(${scrollbarMetrics.thumbOffsetTop}px)`,
              }}
            />
          ) : null}
        </div>
      </div>
    );
  },
);
