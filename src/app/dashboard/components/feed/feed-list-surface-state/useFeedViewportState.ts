import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { type FeedViewportResolutionState } from "./types";

interface UseFeedViewportStateOptions {
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  refreshEpoch: number;
}

/**
 * Owns viewport discovery plus the normal-mode top-lock used during feed swaps.
 *
 * The feed surface renders inside the owning scroll viewport, which is resolved
 * after mount. This hook keeps that lookup and the normal-mode initial scroll
 * reset isolated from the higher-level feed state coordinator.
 */
export function useFeedViewportState({
  feedViewKey,
  isCollapseScrollRestoreActive,
  isInvertedScroll,
  refreshEpoch,
}: UseFeedViewportStateOptions) {
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(null);
  const [viewportResolutionState, setViewportResolutionState] =
    useState<FeedViewportResolutionState>("pending");
  const hasResolvedInitialViewportRef = useRef(false);
  const previousFeedViewKeyRef = useRef(feedViewKey);
  const previousRefreshEpochRef = useRef(refreshEpoch);
  const previousIsInvertedRef = useRef(isInvertedScroll);
  const shouldLockNormalInitialScrollRef = useRef(false);

  /** Resolves the hosting feed viewport after the surface node mounts. */
  const handleViewportHostRef = useCallback((node: HTMLDivElement | null) => {
    queueMicrotask(() => {
      const resolvedViewport =
        node?.closest<HTMLElement>(
          "[data-feed-scroll-viewport], [data-radix-scroll-area-viewport]",
        ) ?? null;
      setScrollViewport(resolvedViewport);
      setViewportResolutionState(resolvedViewport ? "ready" : "missing");
    });
  }, []);

  useLayoutEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const isInitialViewportResolution = !hasResolvedInitialViewportRef.current;
    const didFeedViewChange = previousFeedViewKeyRef.current !== feedViewKey;
    const didRefreshEpochChange = previousRefreshEpochRef.current !== refreshEpoch;
    const didInvertedChange = previousIsInvertedRef.current !== isInvertedScroll;
    hasResolvedInitialViewportRef.current = true;
    previousFeedViewKeyRef.current = feedViewKey;
    previousRefreshEpochRef.current = refreshEpoch;
    previousIsInvertedRef.current = isInvertedScroll;
    const isViewportReplacementDuringRestore =
      !didFeedViewChange &&
      !didRefreshEpochChange &&
      !didInvertedChange &&
      isCollapseScrollRestoreActive;
    const shouldResetInitialViewportScroll =
      isInitialViewportResolution && !isCollapseScrollRestoreActive;

    if (isInvertedScroll) {
      shouldLockNormalInitialScrollRef.current = false;
      return;
    }

    if (
      isViewportReplacementDuringRestore ||
      (
        scrollViewport.scrollTop === 0 &&
        !shouldResetInitialViewportScroll &&
        !didFeedViewChange &&
        !didRefreshEpochChange &&
        !didInvertedChange
      )
    ) {
      shouldLockNormalInitialScrollRef.current = false;
      return;
    }

    if (
      !didFeedViewChange &&
      !didRefreshEpochChange &&
      !didInvertedChange &&
      !shouldResetInitialViewportScroll
    ) {
      shouldLockNormalInitialScrollRef.current = false;
      return;
    }

    shouldLockNormalInitialScrollRef.current = true;
    scrollViewport.scrollTop = 0;
  }, [
    feedViewKey,
    isCollapseScrollRestoreActive,
    isInvertedScroll,
    refreshEpoch,
    scrollViewport,
  ]);

  /** Reports whether normal mode should still keep the viewport pinned to the top. */
  const shouldLockInitialNormalScroll = useCallback(() => {
    return shouldLockNormalInitialScrollRef.current && !isInvertedScroll;
  }, [isInvertedScroll]);

  /** Clears the transient normal-mode top-lock after direct reader interaction. */
  const clearInitialNormalScrollLock = useCallback(() => {
    shouldLockNormalInitialScrollRef.current = false;
  }, []);

  return {
    clearInitialNormalScrollLock,
    handleViewportHostRef,
    scrollViewport,
    shouldLockInitialNormalScroll,
    viewportResolutionState,
  };
}