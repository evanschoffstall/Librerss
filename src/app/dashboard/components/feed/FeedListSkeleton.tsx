"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { DASHBOARD_FEED_WIDTH_CLASS_NAME } from "../DashboardScaffold";

interface FeedArticleSkeletonDescriptor {
  bodyWidth: string;
  metaSourceWidth: string;
  titleWidths: [string, string];
}

const FEED_ARTICLE_SKELETONS: FeedArticleSkeletonDescriptor[] = [
  { bodyWidth: "w-full", metaSourceWidth: "w-16", titleWidths: ["w-[88%]", "w-[56%]"] },
  { bodyWidth: "w-[94%]", metaSourceWidth: "w-20", titleWidths: ["w-[92%]", "w-[68%]"] },
  { bodyWidth: "w-[90%]", metaSourceWidth: "w-14", titleWidths: ["w-[84%]", "w-[61%]"] },
  { bodyWidth: "w-[96%]", metaSourceWidth: "w-16", titleWidths: ["w-[90%]", "w-[58%]"] },
];
const DEFAULT_FEED_LIST_SKELETON_COUNT = FEED_ARTICLE_SKELETONS.length;
const MIN_FEED_LIST_SKELETON_COUNT = 1;

interface FeedListSkeletonProps {
  isInvertedScroll?: boolean;
}

interface FeedLoadMoreSkeletonRowsProps {
  count: number;
}

/**
 * Article-list loading surface that mirrors the collapsed article-card DOM.
 *
 * Each placeholder card copies the collapsed `ArticleCard` header/body anatomy
 * — meta row (date + dot + favicon + source + action buttons), two-line title,
 * and single-line preview — so the first hydrated frame does not shift wrapper
 * spacing, header rails, or preview rhythm when real articles replace them.
 */
export function FeedListSkeleton({
  isInvertedScroll = false,
}: FeedListSkeletonProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [usesMobileBottomUpFallback, setUsesMobileBottomUpFallback] = useState(true);
  const [skeletonCount, setSkeletonCount] = useState(
    DEFAULT_FEED_LIST_SKELETON_COUNT,
  );

  useEffect(() => {
    setUsesMobileBottomUpFallback(isInvertedScroll);
  }, [isInvertedScroll]);

  useLayoutEffect(() => {
    const listElement = listRef.current;

    if (!listElement) {
      return;
    }

    const viewportElement = listElement.closest<HTMLElement>(
      "[data-feed-scroll-viewport='true'], [data-radix-scroll-area-viewport]",
    );

    if (!viewportElement) {
      return;
    }

    let animationFrameId = 0;
    let resizeObserver: null | ResizeObserver = null;

    const measureSkeletonCount = () => {
      const firstSkeletonRow = listElement.querySelector<HTMLElement>(
        "[data-dashboard-feed-list-skeleton-item='true']",
      );

      if (!firstSkeletonRow) {
        return;
      }

      const viewportHeight = Math.floor(
        viewportElement.clientHeight || viewportElement.getBoundingClientRect().height,
      );
      const skeletonRowHeight = Math.ceil(
        firstSkeletonRow.getBoundingClientRect().height || firstSkeletonRow.offsetHeight,
      );

      if (viewportHeight <= 0 || skeletonRowHeight <= 0) {
        return;
      }

      const listStyles = getComputedStyle(listElement);
      const rawRowGap = Number.parseFloat(listStyles.rowGap || listStyles.gap || "0");
      const rowGap = Number.isFinite(rawRowGap) && rawRowGap > 0 ? rawRowGap : 0;
      const nextCount = Math.max(
        MIN_FEED_LIST_SKELETON_COUNT,
        Math.floor((viewportHeight + rowGap) / (skeletonRowHeight + rowGap)),
      );

      setSkeletonCount((currentCount) =>
        currentCount === nextCount ? currentCount : nextCount,
      );
    };

    const scheduleMeasurement = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        measureSkeletonCount();
      });
    };

    scheduleMeasurement();

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        scheduleMeasurement();
      });
      resizeObserver.observe(viewportElement);
      resizeObserver.observe(listElement);

      const firstSkeletonRow = listElement.querySelector<HTMLElement>(
        "[data-dashboard-feed-list-skeleton-item='true']",
      );

      if (firstSkeletonRow) {
        resizeObserver.observe(firstSkeletonRow);
      }
    }

    window.addEventListener("resize", scheduleMeasurement);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
    };
  }, [skeletonCount]);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col gap-1.5",
        DASHBOARD_FEED_WIDTH_CLASS_NAME,
        usesMobileBottomUpFallback ? "max-sm:justify-end" : null,
        isInvertedScroll ? "justify-end" : null,
      )}
      data-dashboard-feed-list-skeleton="true"
      data-dashboard-feed-list-skeleton-count={String(skeletonCount)}
      ref={listRef}
    >
      <FeedLoadMoreSkeletonRows count={skeletonCount} />
    </div>
  );
}

/**
 * Reuses the article-card skeleton anatomy for incremental page loads.
 *
 * The placeholder count is caller-controlled so load-more flows can reserve the
 * exact next page footprint and grow the scrollbar immediately.
 */
export function FeedLoadMoreSkeletonRows({
  count,
}: FeedLoadMoreSkeletonRowsProps) {
  return Array.from({ length: count }, (_value, index) => {
    const descriptor = FEED_ARTICLE_SKELETONS[index % FEED_ARTICLE_SKELETONS.length];

    return (
      <div data-dashboard-feed-list-skeleton-item="true" key={index}>
        <FeedArticleCardSkeleton descriptor={descriptor} />
      </div>
    );
  });
}

/**
 * Collapsed article-card shell with the same header/body anatomy.
 *
 * Heights are derived from the real card measurements:
 * - Meta row: 24px (text-xs/5 + size-6 action buttons)
 * - Title: 48px (line-clamp-2, line-height 24px)
 * - Body: 24px (line-clamp-1 preview, line-height 24px)
 * - Header padding: 12px top, 0 bottom
 * - Content padding: 8px top, 12px bottom
 */
function FeedArticleCardSkeleton({
  descriptor,
}: {
  descriptor: FeedArticleSkeletonDescriptor;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl"
      data-dashboard-article-skeleton="true"
    >
      <article
        aria-hidden="true"
        className="
          article-swipe-surface group relative overflow-visible rounded-xl
          border border-border
          dark:shadow-2xl dark:shadow-zinc-900/50
        "
      >
        {/* Header zone — matches ArticleCard collapsed: px-3 pt-3 */}
        <div className="relative rounded-t-xl bg-card/70 px-3 pt-3">
          <div className="space-y-2">
            {/* Meta row — 24px tall, matching text-xs/5 + size-6 buttons */}
            <div
              className="
                flex items-center gap-2 text-xs/5 tracking-normal
                text-muted-foreground/70 select-none
              "
            >
              {/* Date group: icon + text + dot */}
              <div className="
                flex shrink-0 items-center gap-2 whitespace-nowrap
              ">
                <Skeleton className="size-3 rounded-sm" />
                <Skeleton className="h-3 w-22 rounded-full" />
                <Skeleton className="size-1 shrink-0 rounded-full" />
              </div>
              {/* Source group: favicon + name */}
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className="size-3 rounded-sm" />
                <Skeleton
                  className={cn("h-3 rounded-full", descriptor.metaSourceWidth)}
                />
              </div>

              {/* Action buttons — 5 in dev (read, star, share, raw-html, open) */}
              <div
                className="
                  -mr-1 ml-auto flex shrink-0 items-center gap-1 opacity-100
                  transition-opacity duration-150
                "
              >
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
              </div>
            </div>

            {/* Title — two lines matching line-clamp-2 at 24px line-height */}
            <div className="space-y-4">
              <Skeleton
                className={cn("h-4 rounded-full", descriptor.titleWidths[0])}
              />
              <Skeleton
                className={cn("h-4 rounded-full", descriptor.titleWidths[1])}
              />
            </div>
          </div>
        </div>

        {/* Content zone — matches ArticleCard collapsed: px-3 pt-2 pb-3 */}
        <div className="relative rounded-b-xl bg-card/70 px-3 pt-2 pb-3">
          {/* Single preview line — 24px (line-clamp-1, lh 24px) */}
          <div className="py-1.5">
            <Skeleton
              className={cn("h-3 rounded-full", descriptor.bodyWidth)}
            />
          </div>
        </div>
      </article>
    </div>
  );
}
