"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Describes the props for the dashboard feed scroll area component.
 */
interface DashboardFeedScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  viewportClassName?: string;
}

/**
 * Describes the feed scrollbar metrics.
 */
interface FeedScrollbarMetrics {
  isVisible: boolean;
  thumbHeight: number;
  thumbOffsetTop: number;
}

const MIN_FEED_SCROLLBAR_THUMB_HEIGHT_PX = 32;

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
        setScrollbarMetrics({
          isVisible: false,
          thumbHeight: 0,
          thumbOffsetTop: 0,
        });
        return;
      }

      if (hasInitialFeedSkeleton(viewportElement)) {
        setScrollbarMetrics({
          isVisible: false,
          thumbHeight: 0,
          thumbOffsetTop: 0,
        });
        return;
      }

      const { clientHeight, scrollHeight, scrollTop } = viewportElement;
      const virtualizedListHeight = readFeedTotalListHeight(viewportElement);
      const effectiveScrollHeight = Math.max(
        clientHeight,
        scrollHeight,
        virtualizedListHeight ?? 0,
      );
      const maxScrollTop = effectiveScrollHeight - clientHeight;

      if (!Number.isFinite(maxScrollTop) || maxScrollTop <= 0) {
        setScrollbarMetrics({
          isVisible: false,
          thumbHeight: 0,
          thumbOffsetTop: 0,
        });
        return;
      }

      const rawThumbHeight =
        (clientHeight / effectiveScrollHeight) * clientHeight;
      const thumbHeight = Math.round(
        Math.min(
          clientHeight,
          Math.max(MIN_FEED_SCROLLBAR_THUMB_HEIGHT_PX, rawThumbHeight),
        ),
      );
      const availableTrackHeight = clientHeight - thumbHeight;
      const boundedScrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));
      const thumbOffsetTop = Math.round(
        maxScrollTop <= 0
          ? 0
          : (boundedScrollTop / maxScrollTop) * availableTrackHeight,
      );

      setScrollbarMetrics((currentMetrics) => {
        if (
          currentMetrics.isVisible &&
          currentMetrics.thumbHeight === thumbHeight &&
          currentMetrics.thumbOffsetTop === thumbOffsetTop
        ) {
          return currentMetrics;
        }

        return {
          isVisible: true,
          thumbHeight,
          thumbOffsetTop,
        };
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
