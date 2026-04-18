import { useEffect } from "react";

import {
  createViewportBoundaryHandlers,
  createViewportScrollHandler,
  type ViewportScrollBindingOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/feedPaginationViewportScroll";
import {
  FEED_INVERTED_LOAD_MORE_THRESHOLD_PX,
  FEED_LOAD_MORE_THRESHOLD_PX,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

interface FeedPaginationCleanupEffectOptions {
  clearServerLoadCooldown: () => void;
  hasPendingBoundaryRearmAfterCooldownRef: { current: boolean };
  invertedPaginationAnchorFrameRef: { current: null | number };
  normalScrollIntentSuppressionFrameRef: { current: null | number };
  paginationFrameRef: { current: null | number };
}

interface FeedPaginationIntentBindingOptions {
  capturePendingInvertedPaginationAnchorSnapshot: () => void;
  clearInitialNormalScrollLock: () => void;
  hasActiveInvertedExpansionScrollLock: () => boolean;
  hasRequestedServerLoadRef: { current: boolean };
  hasUserScrolledRef: { current: boolean };
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  isInvertedScroll: boolean;
  maybeLoadNextPage: (_trigger: "scroll" | "sentinel") => void;
  onClaimInvertedScrollOwnership: () => void;
  onReleaseInvertedExpansionScrollLock: () => void;
  paginationFrameRef: { current: null | number };
  rearmPaginationBoundaryFromUserIntent: () => void;
  releaseInvertedPaginationAnchor: () => void;
  scrollViewport: HTMLElement | null;
}

interface FeedPaginationScrollPositionPrimingOptions {
  isInvertedScroll: boolean;
  lastInvertedScrollTopRef: { current: null | number };
  lastStandardScrollTopRef: { current: null | number };
  scrollViewport: HTMLElement | null;
}
interface FeedPaginationSentinelLoadOptions {
  clearInitialNormalScrollLock: () => void;
  hasUserScrolledRef: { current: boolean };
  isInvertedScroll: boolean;
  maybeLoadNextPage: (_trigger: "scroll" | "sentinel") => void;
  normalScrollIntentSuppressionFrameRef: { current: null | number };
  paginationFrameRef: { current: null | number };
  shouldLockInitialNormalScroll: () => boolean;
  suppressImmediateNormalScrollIntent: () => void;
}

interface FeedPaginationSentinelObserverOptions extends FeedPaginationSentinelLoadOptions {
  scrollViewport: HTMLElement | null;
  shouldObserveLoadMoreBoundary: boolean;
}

/**
 * Manage the feed pagination cleanup effect.
 * @param options - The options used to manage the feed pagination cleanup effect.
 */
export function useFeedPaginationCleanupEffect(
  options: FeedPaginationCleanupEffectOptions,
) {
  const {
    clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef,
    invertedPaginationAnchorFrameRef,
    normalScrollIntentSuppressionFrameRef,
    paginationFrameRef,
  } = options;
  useEffect(() => {
    const anchorFrameId = invertedPaginationAnchorFrameRef.current;
    const paginationFrameId = paginationFrameRef.current;
    const normalScrollIntentSuppressionFrameId =
      normalScrollIntentSuppressionFrameRef.current;

    return () => {
      clearServerLoadCooldown();
      hasPendingBoundaryRearmAfterCooldownRef.current = false;

      if (anchorFrameId !== null) {
        window.cancelAnimationFrame(anchorFrameId);
      }

      if (paginationFrameId !== null) {
        window.cancelAnimationFrame(paginationFrameId);
      }

      if (normalScrollIntentSuppressionFrameId !== null) {
        window.cancelAnimationFrame(normalScrollIntentSuppressionFrameId);
      }
    };
  }, [
    clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef,
    invertedPaginationAnchorFrameRef,
    normalScrollIntentSuppressionFrameRef,
    paginationFrameRef,
  ]);
}
/**
 * Manage the feed pagination intent bindings.
 * @param options - The options used to manage the feed pagination intent bindings.
 */
export function useFeedPaginationIntentBindings(
  options: FeedPaginationIntentBindingOptions,
) {
  useEffect(() => {
    if (!options.scrollViewport) {
      return;
    }
    const handleScrollIntent = createScrollIntentHandler({
      capturePendingInvertedPaginationAnchorSnapshot:
        options.capturePendingInvertedPaginationAnchorSnapshot,
      clearInitialNormalScrollLock: options.clearInitialNormalScrollLock,
      hasActiveInvertedExpansionScrollLock:
        options.hasActiveInvertedExpansionScrollLock,
      hasRequestedServerLoadRef: options.hasRequestedServerLoadRef,
      hasUserScrolledRef: options.hasUserScrolledRef,
      isInvertedLoadBoundaryArmedRef: options.isInvertedLoadBoundaryArmedRef,
      isInvertedScroll: options.isInvertedScroll,
      maybeLoadNextPage: options.maybeLoadNextPage,
      onClaimInvertedScrollOwnership: options.onClaimInvertedScrollOwnership,
      onReleaseInvertedExpansionScrollLock:
        options.onReleaseInvertedExpansionScrollLock,
      paginationFrameRef: options.paginationFrameRef,
      rearmPaginationBoundaryFromUserIntent:
        options.rearmPaginationBoundaryFromUserIntent,
      releaseInvertedPaginationAnchor: options.releaseInvertedPaginationAnchor,
      scrollViewport: options.scrollViewport,
    });
    options.scrollViewport.addEventListener("touchmove", handleScrollIntent, {
      passive: true,
    });
    options.scrollViewport.addEventListener("wheel", handleScrollIntent, {
      passive: true,
    });

    return () => {
      options.scrollViewport?.removeEventListener(
        "touchmove",
        handleScrollIntent,
      );
      options.scrollViewport?.removeEventListener("wheel", handleScrollIntent);
    };
  }, [
    options.capturePendingInvertedPaginationAnchorSnapshot,
    options.clearInitialNormalScrollLock,
    options.hasActiveInvertedExpansionScrollLock,
    options.hasRequestedServerLoadRef,
    options.hasUserScrolledRef,
    options.isInvertedLoadBoundaryArmedRef,
    options.isInvertedScroll,
    options.maybeLoadNextPage,
    options.onClaimInvertedScrollOwnership,
    options.onReleaseInvertedExpansionScrollLock,
    options.paginationFrameRef,
    options.rearmPaginationBoundaryFromUserIntent,
    options.releaseInvertedPaginationAnchor,
    options.scrollViewport,
  ]);
}

/**
 * Manage the feed pagination scroll position priming.
 * @param options - The options used to manage the feed pagination scroll position priming.
 */
export function useFeedPaginationScrollPositionPriming(
  options: FeedPaginationScrollPositionPrimingOptions,
) {
  useEffect(() => {
    if (!options.scrollViewport) {
      return;
    }

    options.lastStandardScrollTopRef.current = options.isInvertedScroll
      ? null
      : options.scrollViewport.scrollTop;
    options.lastInvertedScrollTopRef.current = options.isInvertedScroll
      ? options.scrollViewport.scrollTop
      : null;
  }, [
    options.isInvertedScroll,
    options.lastInvertedScrollTopRef,
    options.lastStandardScrollTopRef,
    options.scrollViewport,
  ]);
}

/**
 * Manage the feed pagination sentinel observer.
 * @param options - The options used to manage the feed pagination sentinel observer.
 */
export function useFeedPaginationSentinelObserver(
  options: FeedPaginationSentinelObserverOptions,
) {
  const {
    clearInitialNormalScrollLock,
    hasUserScrolledRef,
    isInvertedScroll,
    maybeLoadNextPage,
    normalScrollIntentSuppressionFrameRef,
    paginationFrameRef,
    scrollViewport,
    shouldLockInitialNormalScroll,
    shouldObserveLoadMoreBoundary,
    suppressImmediateNormalScrollIntent,
  } = options;
  useEffect(() => {
    if (!scrollViewport || typeof IntersectionObserver !== "function") {
      return;
    }

    if (!shouldObserveLoadMoreBoundary) {
      return;
    }
    const currentScrollViewport: HTMLElement = scrollViewport;

    const sentinel = currentScrollViewport.querySelector<HTMLDivElement>(
      "[data-feed-load-more-sentinel='true']",
    );
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        handleSentinelIntersection({
          clearInitialNormalScrollLock,
          entries,
          hasUserScrolledRef,
          isInvertedScroll,
          maybeLoadNextPage,
          normalScrollIntentSuppressionFrameRef,
          paginationFrameRef,
          scrollViewport: currentScrollViewport,
          shouldLockInitialNormalScroll,
          suppressImmediateNormalScrollIntent,
        });
      },
      {
        root: currentScrollViewport,
        rootMargin: isInvertedScroll
          ? `${FEED_INVERTED_LOAD_MORE_THRESHOLD_PX}px 0px 0px 0px`
          : `0px 0px ${FEED_LOAD_MORE_THRESHOLD_PX}px 0px`,
        threshold: 0,
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [
    clearInitialNormalScrollLock,
    hasUserScrolledRef,
    isInvertedScroll,
    maybeLoadNextPage,
    normalScrollIntentSuppressionFrameRef,
    paginationFrameRef,
    scrollViewport,
    shouldLockInitialNormalScroll,
    shouldObserveLoadMoreBoundary,
    suppressImmediateNormalScrollIntent,
  ]);
}

/**
 * Manage the feed pagination viewport scroll binding.
 * @param options - The options used to manage the feed pagination viewport scroll binding.
 */
export function useFeedPaginationViewportScrollBinding(
  options: ViewportScrollBindingOptions,
) {
  useEffect(() => {
    const scrollViewport = options.scrollViewport;
    if (!scrollViewport) {
      return;
    }

    const {
      rearmInvertedBoundaryFromScrollPosition,
      rearmStandardBoundaryFromScrollPosition,
    } = createViewportBoundaryHandlers({
      hasPendingBoundaryRearmAfterCooldownRef:
        options.hasPendingBoundaryRearmAfterCooldownRef,
      hasPendingServerRevealRef: options.hasPendingServerRevealRef,
      hasRequestedServerLoadRef: options.hasRequestedServerLoadRef,
      invertedPaginationAnchorRef: options.invertedPaginationAnchorRef,
      isInvertedLoadBoundaryArmedRef: options.isInvertedLoadBoundaryArmedRef,
      isInvertedScroll: options.isInvertedScroll,
      isStandardLoadBoundaryArmedRef: options.isStandardLoadBoundaryArmedRef,
      lastInvertedScrollTopRef: options.lastInvertedScrollTopRef,
      lastStandardScrollTopRef: options.lastStandardScrollTopRef,
      scrollViewport,
    });
    const handleViewportScroll = createViewportScrollHandler({
      capturePendingInvertedPaginationAnchorSnapshot:
        options.capturePendingInvertedPaginationAnchorSnapshot,
      clearInitialNormalScrollLock: options.clearInitialNormalScrollLock,
      hasActiveInvertedExpansionScrollLock:
        options.hasActiveInvertedExpansionScrollLock,
      hasUserScrolledRef: options.hasUserScrolledRef,
      isInvertedScroll: options.isInvertedScroll,
      maybeLoadNextPage: options.maybeLoadNextPage,
      normalScrollIntentSuppressionFrameRef:
        options.normalScrollIntentSuppressionFrameRef,
      onClaimInvertedScrollOwnership: options.onClaimInvertedScrollOwnership,
      onSyncInvertedExpansionScrollLock:
        options.onSyncInvertedExpansionScrollLock,
      rearmInvertedBoundaryFromScrollPosition,
      rearmStandardBoundaryFromScrollPosition,
      releaseInvertedPaginationAnchor: options.releaseInvertedPaginationAnchor,
      scrollViewport,
      shouldLockInitialNormalScroll: options.shouldLockInitialNormalScroll,
      suppressImmediateNormalScrollIntent:
        options.suppressImmediateNormalScrollIntent,
    });

    scrollViewport.addEventListener("scroll", handleViewportScroll, {
      passive: true,
    });

    return () => {
      scrollViewport.removeEventListener("scroll", handleViewportScroll);
    };
  }, [
    options.capturePendingInvertedPaginationAnchorSnapshot,
    options.clearInitialNormalScrollLock,
    options.hasActiveInvertedExpansionScrollLock,
    options.hasPendingBoundaryRearmAfterCooldownRef,
    options.hasPendingServerRevealRef,
    options.hasRequestedServerLoadRef,
    options.hasUserScrolledRef,
    options.invertedPaginationAnchorRef,
    options.isInvertedLoadBoundaryArmedRef,
    options.isInvertedScroll,
    options.isStandardLoadBoundaryArmedRef,
    options.lastInvertedScrollTopRef,
    options.lastStandardScrollTopRef,
    options.maybeLoadNextPage,
    options.normalScrollIntentSuppressionFrameRef,
    options.onClaimInvertedScrollOwnership,
    options.onSyncInvertedExpansionScrollLock,
    options.releaseInvertedPaginationAnchor,
    options.scrollViewport,
    options.shouldLockInitialNormalScroll,
    options.suppressImmediateNormalScrollIntent,
  ]);
}

/**
 * Create the scroll intent handler.
 * @param options - The options used to create the scroll intent handler.
 * @returns The scroll intent handler.
 */
function createScrollIntentHandler(
  options: FeedPaginationIntentBindingOptions & { scrollViewport: HTMLElement },
) {
  return () => {
    if (options.hasActiveInvertedExpansionScrollLock()) {
      options.onReleaseInvertedExpansionScrollLock();
    }

    if (options.isInvertedScroll) {
      options.capturePendingInvertedPaginationAnchorSnapshot();
      options.releaseInvertedPaginationAnchor();
      options.onClaimInvertedScrollOwnership();
    } else {
      options.clearInitialNormalScrollLock();
    }

    options.hasUserScrolledRef.current = true;

    options.rearmPaginationBoundaryFromUserIntent();

    if (options.paginationFrameRef.current !== null) {
      return;
    }

    options.paginationFrameRef.current = window.requestAnimationFrame(() => {
      options.paginationFrameRef.current = null;
      options.maybeLoadNextPage("scroll");
    });
  };
}

/**
 * Process the handle sentinel intersection.
 * @param options - The options used to process the handle sentinel intersection.
 */
function handleSentinelIntersection(
  options: FeedPaginationSentinelLoadOptions & {
    entries: IntersectionObserverEntry[];
    scrollViewport: HTMLElement;
  },
) {
  if (!options.entries[0]?.isIntersecting) {
    return;
  }

  if (shouldSuppressInitialSentinelLoad(options)) {
    return;
  }

  if (
    !options.isInvertedScroll &&
    options.normalScrollIntentSuppressionFrameRef.current !== null
  ) {
    return;
  }

  if (!options.hasUserScrolledRef.current) {
    return;
  }

  if (options.scrollViewport.scrollTop > 0 && !options.isInvertedScroll) {
    options.hasUserScrolledRef.current = true;
  }

  if (options.paginationFrameRef.current !== null) {
    return;
  }

  options.paginationFrameRef.current = window.requestAnimationFrame(() => {
    options.paginationFrameRef.current = null;
    options.maybeLoadNextPage("sentinel");
  });
}

/**
 * Return whether should suppress initial sentinel load.
 * @param options - The options used to return whether should suppress initial sentinel load.
 * @returns Whether should suppress initial sentinel load.
 */
function shouldSuppressInitialSentinelLoad(
  options: Pick<
    Parameters<typeof handleSentinelIntersection>[0],
    | "clearInitialNormalScrollLock"
    | "isInvertedScroll"
    | "scrollViewport"
    | "shouldLockInitialNormalScroll"
    | "suppressImmediateNormalScrollIntent"
  >,
) {
  if (!options.shouldLockInitialNormalScroll() || options.isInvertedScroll) {
    return false;
  }

  if (options.scrollViewport.scrollTop === 0) {
    return true;
  }

  options.clearInitialNormalScrollLock();
  options.suppressImmediateNormalScrollIntent();
  return true;
}
