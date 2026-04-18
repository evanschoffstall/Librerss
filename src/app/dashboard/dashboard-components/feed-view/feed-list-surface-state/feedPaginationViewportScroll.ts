import { hasMovedAwayFromBoundarySincePreviousScroll } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state";
import {
  finalizePaginationBoundaryRearm,
  type PaginationBoundaryRearmRefs,
  shouldAbortPaginationBoundaryRearm,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationBoundaryState";

export interface ViewportScrollBindingOptions {
  capturePendingInvertedPaginationAnchorSnapshot: () => void;
  clearInitialNormalScrollLock: () => void;
  hasActiveInvertedExpansionScrollLock: () => boolean;
  hasPendingBoundaryRearmAfterCooldownRef: { current: boolean };
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  hasUserScrolledRef: { current: boolean };
  invertedPaginationAnchorRef: { current: unknown };
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: { current: boolean };
  lastInvertedScrollTopRef: { current: null | number };
  lastStandardScrollTopRef: { current: null | number };
  maybeLoadNextPage: (_trigger: "scroll" | "sentinel") => void;
  normalScrollIntentSuppressionFrameRef: { current: null | number };
  onClaimInvertedScrollOwnership: () => void;
  onSyncInvertedExpansionScrollLock: () => void;
  releaseInvertedPaginationAnchor: () => void;
  scrollViewport: HTMLElement | null;
  shouldLockInitialNormalScroll: () => boolean;
  suppressImmediateNormalScrollIntent: () => void;
}

/**
 * @param options
 */
export function createViewportBoundaryHandlers(
  options: PaginationBoundaryRearmRefs & {
    isInvertedLoadBoundaryArmedRef: { current: boolean };
    isInvertedScroll: boolean;
    isStandardLoadBoundaryArmedRef: { current: boolean };
    lastInvertedScrollTopRef: { current: null | number };
    lastStandardScrollTopRef: { current: null | number };
    scrollViewport: HTMLElement;
  },
) {
  return {
    rearmInvertedBoundaryFromScrollPosition: createRearmInvertedBoundaryHandler(
      {
        hasPendingBoundaryRearmAfterCooldownRef:
          options.hasPendingBoundaryRearmAfterCooldownRef,
        hasPendingServerRevealRef: options.hasPendingServerRevealRef,
        hasRequestedServerLoadRef: options.hasRequestedServerLoadRef,
        invertedPaginationAnchorRef: options.invertedPaginationAnchorRef,
        isInvertedLoadBoundaryArmedRef: options.isInvertedLoadBoundaryArmedRef,
        isInvertedScroll: options.isInvertedScroll,
        lastInvertedScrollTopRef: options.lastInvertedScrollTopRef,
        scrollViewport: options.scrollViewport,
      },
    ),
    rearmStandardBoundaryFromScrollPosition: createRearmStandardBoundaryHandler(
      {
        hasPendingBoundaryRearmAfterCooldownRef:
          options.hasPendingBoundaryRearmAfterCooldownRef,
        hasPendingServerRevealRef: options.hasPendingServerRevealRef,
        hasRequestedServerLoadRef: options.hasRequestedServerLoadRef,
        invertedPaginationAnchorRef: options.invertedPaginationAnchorRef,
        isInvertedScroll: options.isInvertedScroll,
        isStandardLoadBoundaryArmedRef: options.isStandardLoadBoundaryArmedRef,
        lastStandardScrollTopRef: options.lastStandardScrollTopRef,
        scrollViewport: options.scrollViewport,
      },
    ),
  };
}

/**
 * @param options
 * @param options.capturePendingInvertedPaginationAnchorSnapshot
 * @param options.clearInitialNormalScrollLock
 * @param options.hasActiveInvertedExpansionScrollLock
 * @param options.hasUserScrolledRef
 * @param options.hasUserScrolledRef.current
 * @param options.isInvertedScroll
 * @param options.maybeLoadNextPage
 * @param options.normalScrollIntentSuppressionFrameRef
 * @param options.normalScrollIntentSuppressionFrameRef.current
 * @param options.onClaimInvertedScrollOwnership
 * @param options.onSyncInvertedExpansionScrollLock
 * @param options.rearmInvertedBoundaryFromScrollPosition
 * @param options.rearmStandardBoundaryFromScrollPosition
 * @param options.releaseInvertedPaginationAnchor
 * @param options.scrollViewport
 * @param options.shouldLockInitialNormalScroll
 * @param options.suppressImmediateNormalScrollIntent
 */
export function createViewportScrollHandler(options: {
  capturePendingInvertedPaginationAnchorSnapshot: () => void;
  clearInitialNormalScrollLock: () => void;
  hasActiveInvertedExpansionScrollLock: () => boolean;
  hasUserScrolledRef: { current: boolean };
  isInvertedScroll: boolean;
  maybeLoadNextPage: (_trigger: "scroll" | "sentinel") => void;
  normalScrollIntentSuppressionFrameRef: { current: null | number };
  onClaimInvertedScrollOwnership: () => void;
  onSyncInvertedExpansionScrollLock: () => void;
  rearmInvertedBoundaryFromScrollPosition: () => void;
  rearmStandardBoundaryFromScrollPosition: () => void;
  releaseInvertedPaginationAnchor: () => void;
  scrollViewport: HTMLElement;
  shouldLockInitialNormalScroll: () => boolean;
  suppressImmediateNormalScrollIntent: () => void;
}) {
  return () => {
    if (options.isInvertedScroll) {
      const maxScrollTop = Math.max(
        0,
        options.scrollViewport.scrollHeight -
          options.scrollViewport.clientHeight,
      );

      if (options.hasActiveInvertedExpansionScrollLock()) {
        if (options.scrollViewport.scrollTop < maxScrollTop - 1) {
          options.releaseInvertedPaginationAnchor();
          options.onClaimInvertedScrollOwnership();
          options.hasUserScrolledRef.current = true;
        } else {
          options.onSyncInvertedExpansionScrollLock();
          return;
        }
      }

      options.capturePendingInvertedPaginationAnchorSnapshot();

      if (options.scrollViewport.scrollTop < maxScrollTop - 1) {
        options.releaseInvertedPaginationAnchor();
        options.onClaimInvertedScrollOwnership();
        options.hasUserScrolledRef.current = true;
      }

      if (options.hasUserScrolledRef.current) {
        options.rearmInvertedBoundaryFromScrollPosition();
      }
    }

    if (options.shouldLockInitialNormalScroll() && !options.isInvertedScroll) {
      if (options.scrollViewport.scrollTop === 0) {
        return;
      }

      options.clearInitialNormalScrollLock();
      options.suppressImmediateNormalScrollIntent();
      return;
    }

    if (
      !options.isInvertedScroll &&
      options.normalScrollIntentSuppressionFrameRef.current !== null
    ) {
      return;
    }

    if (options.scrollViewport.scrollTop > 0 && !options.isInvertedScroll) {
      options.hasUserScrolledRef.current = true;
    }

    if (!options.isInvertedScroll && options.hasUserScrolledRef.current) {
      options.rearmStandardBoundaryFromScrollPosition();
    }

    options.maybeLoadNextPage("scroll");
  };
}

/**
 * @param options
 */
function createRearmInvertedBoundaryHandler(
  options: PaginationBoundaryRearmRefs & {
    isInvertedLoadBoundaryArmedRef: { current: boolean };
    isInvertedScroll: boolean;
    lastInvertedScrollTopRef: { current: null | number };
    scrollViewport: HTMLElement;
  },
) {
  return () => {
    const currentScrollTop = options.scrollViewport.scrollTop;

    if (
      !options.isInvertedScroll ||
      shouldAbortPaginationBoundaryRearm(
        options.scrollViewport,
        options.hasPendingServerRevealRef,
        options.invertedPaginationAnchorRef,
      )
    ) {
      options.lastInvertedScrollTopRef.current = currentScrollTop;
      return;
    }

    const hasMovedAwayFromBoundary =
      hasMovedAwayFromBoundarySincePreviousScroll({
        isInvertedScroll: true,
        previousScrollTop: options.lastInvertedScrollTopRef.current,
        scrollViewport: options.scrollViewport,
      });

    options.lastInvertedScrollTopRef.current = currentScrollTop;

    if (!hasMovedAwayFromBoundary) {
      return;
    }

    finalizePaginationBoundaryRearm({
      armedBoundaryRef: options.isInvertedLoadBoundaryArmedRef,
      hasPendingBoundaryRearmAfterCooldownRef:
        options.hasPendingBoundaryRearmAfterCooldownRef,
      hasRequestedServerLoadRef: options.hasRequestedServerLoadRef,
    });
  };
}

/**
 * @param options
 */
function createRearmStandardBoundaryHandler(
  options: PaginationBoundaryRearmRefs & {
    isInvertedScroll: boolean;
    isStandardLoadBoundaryArmedRef: { current: boolean };
    lastStandardScrollTopRef: { current: null | number };
    scrollViewport: HTMLElement;
  },
) {
  return () => {
    if (
      options.isInvertedScroll ||
      shouldAbortPaginationBoundaryRearm(
        options.scrollViewport,
        options.hasPendingServerRevealRef,
        options.invertedPaginationAnchorRef,
      )
    ) {
      return;
    }

    const currentScrollTop = options.scrollViewport.scrollTop;
    const hasMovedAwayFromBoundary =
      hasMovedAwayFromBoundarySincePreviousScroll({
        isInvertedScroll: false,
        previousScrollTop: options.lastStandardScrollTopRef.current,
        scrollViewport: options.scrollViewport,
      });

    options.lastStandardScrollTopRef.current = currentScrollTop;

    if (!hasMovedAwayFromBoundary) {
      return;
    }

    finalizePaginationBoundaryRearm({
      armedBoundaryRef: options.isStandardLoadBoundaryArmedRef,
      hasPendingBoundaryRearmAfterCooldownRef:
        options.hasPendingBoundaryRearmAfterCooldownRef,
      hasRequestedServerLoadRef: options.hasRequestedServerLoadRef,
    });
  };
}
