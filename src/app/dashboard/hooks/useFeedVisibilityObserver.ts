"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { startTransition, useEffect, useRef } from "react";

/**
 * Options for the feed visibility observer that powers incremental list growth.
 *
 * The hook watches a sentinel element near the end of the rendered article list.
 * When that sentinel approaches the viewport, more rows are revealed in fixed
 * page-size increments.
 */
interface UseFeedVisibilityObserverOptions {
  /** Number of additional items to reveal when the sentinel enters the preload zone. */
  pageSize: number;
  /** Scroll container that owns the Radix viewport used as the observer root. */
  scrollRootRef: RefObject<HTMLElement | null>;
  /** Sentinel element rendered after the currently visible feed items. */
  sentinelRef: RefObject<Element | null>;
  /** State setter that expands the visible slice while preserving concurrent rendering responsiveness. */
  setVisibleCount: Dispatch<SetStateAction<number>>;
  /** Total number of items currently available after filtering. */
  totalFeedItems: number;
}

/** Minimum preload distance used when the viewport is very short or not yet measurable. */
const MIN_PRELOAD_PX = 240;
/** Additional preload distance expressed as a fraction of the viewport height. */
const PRELOAD_VIEWPORT_RATIO = 0.75;

/**
 * Observes the feed list sentinel and incrementally expands the rendered window.
 *
 * This hook is tuned for large feed lists where rendering every article at once
 * would be wasteful. It keeps the observer attached to the latest sentinel even
 * as the list mutates, and it batches growth updates into a transition so scroll
 * interactions stay responsive.
 *
 * @param options Observer configuration and state bindings for the feed surface.
 */
export function useFeedVisibilityObserver({
  pageSize,
  scrollRootRef,
  sentinelRef,
  setVisibleCount,
  totalFeedItems,
}: UseFeedVisibilityObserverOptions) {
  // Keep a ref so the observer callback always sees the latest value without
  // needing to reconnect the observer whenever totalFeedItems changes.
  const totalRef = useRef(totalFeedItems);
  totalRef.current = totalFeedItems;

  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot) return;

    // Radix scroll areas render the actual scrolling element inside a nested
    // viewport. Using that inner node as the observer root keeps intersection
    // math aligned with what the user actually sees.
    const viewport =
      scrollRoot.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ) ?? null;
    const preloadDistance = Math.max(
      MIN_PRELOAD_PX,
      Math.round((viewport?.clientHeight ?? 0) * PRELOAD_VIEWPORT_RATIO),
    );
    let intersectionObserver: IntersectionObserver | null = null;
    let observedSentinel: Element | null = null;
    let scheduledFrame: null | number = null;

    /**
     * Schedules a single visible-count increment for the next animation frame.
     *
     * Multiple rapid intersection events can fire while layout is settling. The
     * frame gate keeps those events coalesced into one state update and uses a
     * transition so article rendering happens with lower priority than input.
     */
    const scheduleVisibleCountIncrease = () => {
      if (scheduledFrame !== null) return;
      const flushIncrease = () => {
        scheduledFrame = null;
        startTransition(() => {
          setVisibleCount((previousCount) =>
            Math.min(previousCount + pageSize, totalRef.current),
          );
        });
      };

      if (typeof requestAnimationFrame !== "function") {
        flushIncrease();
        return;
      }

      scheduledFrame = requestAnimationFrame(() => {
        flushIncrease();
      });
    };

    /**
     * Attaches an observer to the latest sentinel element when available.
     *
     * The sentinel node can be replaced as the visible window expands or as the
     * feed is re-rendered after filtering. Reconnecting only when the node
     * identity changes avoids unnecessary observer churn.
     *
     * @returns True when an observer is attached to the current sentinel.
     */
    const connectObserver = () => {
      const sentinel = sentinelRef.current;
      if (!sentinel) return false;
      if (observedSentinel === sentinel) return true;

      intersectionObserver?.disconnect();
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            scheduleVisibleCountIncrease();
          }
        },
        {
          root: viewport,
          rootMargin: `0px 0px ${preloadDistance}px 0px`,
          threshold: 0,
        },
      );
      intersectionObserver.observe(sentinel);
      observedSentinel = sentinel;
      return true;
    };

    // Feed list mutations can replace the sentinel without changing the hook's
    // dependencies. Watching the scroll tree lets the observer reconnect to the
    // new node immediately after React commits the updated list.
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            connectObserver();
          });

    mutationObserver?.observe(scrollRoot, {
      childList: true,
      subtree: true,
    });

    connectObserver();

    return () => {
      if (
        scheduledFrame !== null &&
        typeof cancelAnimationFrame === "function"
      ) {
        cancelAnimationFrame(scheduledFrame);
      }
      intersectionObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [pageSize, scrollRootRef, sentinelRef, setVisibleCount, totalFeedItems]);
}
