import { useLayoutEffect, useRef } from "react";

export interface CachedRevealCompletionOptions {
  isCachedPageRevealing: boolean;
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: { current: boolean };
  maybeLoadNextPage: (_trigger: "scroll" | "sentinel") => void;
  paginationFrameRef: { current: null | number };
}

/**
 * Manage the cached reveal completion effect.
 * @param options - The options used to manage the cached reveal completion effect.
 */
export function useCachedRevealCompletionEffect(
  options: CachedRevealCompletionOptions,
) {
  const {
    isCachedPageRevealing,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    maybeLoadNextPage,
    paginationFrameRef,
  } = options;
  const previousRevealingRef = useRef(false);

  useLayoutEffect(() => {
    const wasRevealing = previousRevealingRef.current;
    previousRevealingRef.current = isCachedPageRevealing;

    if (!wasRevealing || isCachedPageRevealing) {
      return;
    }

    // Reveal just completed — re-arm the load boundary so the sentinel or
    // the next scroll event can trigger another page if needed.
    if (isInvertedScroll) {
      isInvertedLoadBoundaryArmedRef.current = true;
    } else {
      isStandardLoadBoundaryArmedRef.current = true;
    }

    // Schedule a deferred pagination check after the DOM has committed the
    // revealed articles. This covers the case where the user is still at
    // the load boundary and no further scroll events will arrive.
    paginationFrameRef.current ??= window.requestAnimationFrame(() => {
      paginationFrameRef.current = null;
      maybeLoadNextPage("sentinel");
    });
  }, [
    isCachedPageRevealing,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    maybeLoadNextPage,
    paginationFrameRef,
  ]);
}
