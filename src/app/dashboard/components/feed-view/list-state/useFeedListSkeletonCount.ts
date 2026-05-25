"use client";

import { useLayoutEffect } from "react";

import { resolveFeedListSkeletonCount } from "@/app/dashboard/components/feed-config";

/**
 * Describes the options for use feed list skeleton count.
 */
interface UseFeedListSkeletonCountOptions {
  listRef: React.RefObject<HTMLDivElement | null>;
  setSkeletonCount: React.Dispatch<React.SetStateAction<number>>;
}

const FEED_LIST_SKELETON_SELECTOR =
  "[data-dashboard-feed-list-skeleton-item='true']";

/**
 * Manage the feed list skeleton count.
 * @param options - The options used to manage the feed list skeleton count.
 */
export function useFeedListSkeletonCount(
  options: UseFeedListSkeletonCountOptions,
) {
  const { listRef, setSkeletonCount } = options;
  useLayoutEffect(() => {
    if (!listRef.current) {
      return;
    }
    let animationFrameId = 0;
    let resizeObserver: null | ResizeObserver = null;
    let retryFramesRemaining = 10;
    /**
     * Process the measure skeleton count.
     * @returns Whether measure skeleton count.
     */
    const measureSkeletonCount = () =>
      updateFeedListSkeletonCount(listRef, setSkeletonCount);

    /**
     * Process the schedule measurement.
     */
    const scheduleMeasurement = () => {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        if (measureSkeletonCount()) {
          retryFramesRemaining = 10;
          return;
        }

        if (retryFramesRemaining > 0) {
          retryFramesRemaining -= 1;
          scheduleMeasurement();
        }
      });
    };

    const { listElement, viewportElement } =
      resolveFeedListSkeletonElements(listRef);

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        scheduleMeasurement();
      });

      if (viewportElement) {
        resizeObserver.observe(viewportElement);
      }

      if (listElement) {
        resizeObserver.observe(listElement);

        const firstSkeletonRow = listElement.querySelector<HTMLElement>(
          FEED_LIST_SKELETON_SELECTOR,
        );
        if (firstSkeletonRow) {
          resizeObserver.observe(firstSkeletonRow);
        }
      }
    }

    if (!measureSkeletonCount()) {
      scheduleMeasurement();
    }
    window.addEventListener("resize", scheduleMeasurement);
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasurement);
    };
  }, [listRef, setSkeletonCount]);
}

/**
 * Resolve the feed list skeleton elements.
 * @param listRef - The ref that stores the list ref.
 * @returns The feed list skeleton elements.
 */
function resolveFeedListSkeletonElements(
  listRef: React.RefObject<HTMLDivElement | null>,
) {
  const listElement = listRef.current;
  const viewportElement = listElement?.closest<HTMLElement>(
    "[data-feed-scroll-viewport='true'], [data-radix-scroll-area-viewport]",
  );

  return { listElement, viewportElement };
}

/**
 * Resolve the feed list skeleton row gap.
 * @param listElement - The list element.
 * @returns The feed list skeleton row gap.
 */
function resolveFeedListSkeletonRowGap(listElement: HTMLDivElement) {
  const listStyles = getComputedStyle(listElement);
  const rawRowGap = Number.parseFloat(
    listStyles.rowGap || listStyles.gap || "0",
  );

  return Number.isFinite(rawRowGap) && rawRowGap > 0 ? rawRowGap : 0;
}

/**
 * Update the feed list skeleton count.
 * @param listRef - The ref that stores the list ref.
 * @param setSkeletonCount - The set skeleton count value.
 * @returns Whether feed list skeleton count.
 */
function updateFeedListSkeletonCount(
  listRef: React.RefObject<HTMLDivElement | null>,
  setSkeletonCount: React.Dispatch<React.SetStateAction<number>>,
) {
  const { listElement, viewportElement } =
    resolveFeedListSkeletonElements(listRef);

  if (!listElement || !viewportElement) {
    return false;
  }

  const firstSkeletonRow = listElement.querySelector<HTMLElement>(
    FEED_LIST_SKELETON_SELECTOR,
  );
  if (!firstSkeletonRow) {
    return false;
  }

  const viewportHeight = Math.floor(
    viewportElement.clientHeight ||
      viewportElement.getBoundingClientRect().height,
  );
  const skeletonRowHeight = Math.ceil(
    firstSkeletonRow.getBoundingClientRect().height ||
      firstSkeletonRow.offsetHeight,
  );
  if (viewportHeight <= 0 || skeletonRowHeight <= 0) {
    return false;
  }

  const nextCount = resolveFeedListSkeletonCount({
    rowGap: resolveFeedListSkeletonRowGap(listElement),
    skeletonRowHeight,
    viewportHeight,
  });
  setSkeletonCount((currentCount) =>
    currentCount === nextCount ? currentCount : nextCount,
  );
  return true;
}
