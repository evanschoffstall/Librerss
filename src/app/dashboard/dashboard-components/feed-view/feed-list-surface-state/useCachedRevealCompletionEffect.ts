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

    // Reveal just completed — standard scroll can re-arm immediately because
    // staying pinned at the bottom is allowed to trigger the next page.
    // Inverted scroll must wait for the reader to leave and re-reach the top
    // boundary, otherwise a commit-time scroll event can chain another page
    // from the same top-edge intent.
    if (!isInvertedScroll) {
      isStandardLoadBoundaryArmedRef.current = true;
    }

    // Standard scroll needs a deferred check after the DOM commits the reveal
    // because the reader can remain pinned at the bottom without generating a
    // new scroll event. Inverted pagination must not auto-chain another page
    // while the reader is still at the top boundary.
    if (isInvertedScroll) {
      return;
    }

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
