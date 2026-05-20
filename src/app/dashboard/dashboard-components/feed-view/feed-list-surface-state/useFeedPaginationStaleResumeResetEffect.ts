import { useEffect, useRef } from "react";

import type { FeedPaginationStaleResumeResetEffectOptions } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/feedPaginationVisibilityEffectsTypes";

/** Hidden-page duration after which feed pagination state is no longer trusted. */
const FEED_PAGINATION_STALE_RESUME_RESET_MS = 30_000;

/**
 * Reset volatile feed-pagination ownership after a long browser suspension.
 *
 * Browser resume can replay stale observer, scroll, timeout, and animation-frame
 * callbacks in a burst. The dashboard-level stale resume hook cancels fetches,
 * while this feed-surface hook clears the local pagination refs that decide
 * whether a sentinel hit is fresh user intent. The scroll position is normalized
 * on the next frame so a restored bottom-pinned viewport does not immediately
 * retrigger pagination from the old pre-suspension boundary.
 * @param options - Pagination reset callback, scroll direction, and viewport.
 */
export function useFeedPaginationStaleResumeResetEffect(
  options: FeedPaginationStaleResumeResetEffectOptions,
) {
  const { isInvertedScroll, resetPaginationState, scrollViewport } = options;
  const scrollResetFrameRef = useRef<null | number>(null);
  const suspendedAtRef = useRef<null | number>(null);

  useEffect(() => {
    /** Cancels any deferred scroll normalization owned by the previous resume event. */
    const cancelScrollResetFrame = () => {
      if (scrollResetFrameRef.current === null) {
        return;
      }

      window.cancelAnimationFrame(scrollResetFrameRef.current);
      scrollResetFrameRef.current = null;
    };
    /** Records when the page became suspended and invalidates pending resume cleanup. */
    const markSuspended = () => {
      suspendedAtRef.current ??= Date.now();
      cancelScrollResetFrame();
    };
    /** Clears stale pagination ownership once the page returns from a long suspension. */
    const resetAfterStaleResume = () => {
      if (document.hidden) {
        markSuspended();
        return;
      }

      const suspendedAt = suspendedAtRef.current;
      suspendedAtRef.current = null;
      if (
        suspendedAt === null ||
        Date.now() - suspendedAt < FEED_PAGINATION_STALE_RESUME_RESET_MS
      ) {
        return;
      }

      resetPaginationState();
      cancelScrollResetFrame();
      scrollResetFrameRef.current = window.requestAnimationFrame(() => {
        scrollResetFrameRef.current = null;
        normalizeStaleResumeScrollPosition(scrollViewport, isInvertedScroll);
      });
    };

    document.addEventListener("visibilitychange", resetAfterStaleResume);
    document.addEventListener("freeze", markSuspended);
    document.addEventListener("resume", resetAfterStaleResume);
    window.addEventListener("pagehide", markSuspended);
    window.addEventListener("pageshow", resetAfterStaleResume);

    return () => {
      cancelScrollResetFrame();
      document.removeEventListener("visibilitychange", resetAfterStaleResume);
      document.removeEventListener("freeze", markSuspended);
      document.removeEventListener("resume", resetAfterStaleResume);
      window.removeEventListener("pagehide", markSuspended);
      window.removeEventListener("pageshow", resetAfterStaleResume);
    };
  }, [isInvertedScroll, resetPaginationState, scrollViewport]);
}

/**
 * Move a stale-resumed feed viewport away from the load boundary after reset.
 * @param scrollViewport - The current feed scroll viewport, if mounted.
 * @param isInvertedScroll - Whether the feed grows upward from an inverted list.
 */
function normalizeStaleResumeScrollPosition(
  scrollViewport: HTMLElement | null,
  isInvertedScroll: boolean,
) {
  if (!scrollViewport) {
    return;
  }

  scrollViewport.scrollTop = isInvertedScroll ? scrollViewport.scrollHeight : 0;
}
