import { hasMovedAwayFromBoundarySincePreviousScroll } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state";
import {
  finalizePaginationBoundaryRearm,
  type PaginationBoundaryRearmRefs,
  shouldAbortPaginationBoundaryRearm,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationBoundaryState";

export interface ViewportScrollBindingOptions extends ViewportScrollSharedOptions {
  hasPendingBoundaryRearmAfterCooldownRef: { current: boolean };
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  isStandardLoadBoundaryArmedRef: { current: boolean };
  lastInvertedScrollTopRef: { current: null | number };
  lastStandardScrollTopRef: { current: null | number };
  scrollViewport: HTMLElement | null;
}

interface ViewportScrollHandlerOptions extends ViewportScrollSharedOptions {
  rearmInvertedBoundaryFromScrollPosition: () => void;
  rearmStandardBoundaryFromScrollPosition: () => void;
  scrollViewport: HTMLElement;
}

interface ViewportScrollSharedOptions {
  capturePendingInvertedPaginationAnchorSnapshot: () => void;
  clearInitialNormalScrollLock: () => void;
  hasActiveInvertedExpansionScrollLock: () => boolean;
  hasUserScrolledRef: { current: boolean };
  invertedPaginationAnchorRef: { current: unknown };
  isInvertedScroll: boolean;
  maybeLoadNextPage: (_trigger: "scroll" | "sentinel") => void;
  normalScrollIntentSuppressionFrameRef: { current: null | number };
  onClaimInvertedScrollOwnership: () => void;
  onSyncInvertedExpansionScrollLock: () => void;
  pendingInvertedPaginationAnchorSnapshotRef: { current: unknown };
  preservePendingInvertedPaginationAnchorSnapshotRef: { current: boolean };
  releaseInvertedPaginationAnchor: () => void;
  shouldLockInitialNormalScroll: () => boolean;
  suppressImmediateNormalScrollIntent: () => void;
}
/**
 * Create the viewport boundary handlers.
 * @param options - The options used to create the viewport boundary handlers.
 * @returns The viewport boundary handlers.
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
 * Create the viewport scroll handler.
 * @param options - The options used to create the viewport scroll handler.
 * @returns The viewport scroll handler.
 */
export function createViewportScrollHandler(
  options: ViewportScrollHandlerOptions,
) {
  return () => {
    if (options.isInvertedScroll) {
      if (handleInvertedViewportScroll(options)) {
        return;
      }

      options.maybeLoadNextPage("scroll");
      return;
    }

    if (handleStandardViewportScroll(options)) {
      return;
    }

    options.maybeLoadNextPage("scroll");
  };
}

/**
 * Create the rearm inverted boundary handler.
 * @param options - The options used to create the rearm inverted boundary handler.
 * @returns The rearm inverted boundary handler.
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
 * Create the rearm standard boundary handler.
 * @param options - The options used to create the rearm standard boundary handler.
 * @returns The rearm standard boundary handler.
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

/**
 * Handle inverted scroll updates and report whether the caller should stop processing.
 * @param options - The active viewport scroll handler options.
 * @returns Whether inverted scroll processing fully handled the event.
 */
function handleInvertedViewportScroll(options: ViewportScrollHandlerOptions) {
  const maxScrollTop = Math.max(
    0,
    options.scrollViewport.scrollHeight - options.scrollViewport.clientHeight,
  );
  const hasActiveExpansionLock = options.hasActiveInvertedExpansionScrollLock();
  const hasActivePaginationAnchor =
    options.invertedPaginationAnchorRef.current !== null;

  if (hasActiveExpansionLock) {
    if (options.scrollViewport.scrollTop < maxScrollTop - 1) {
      options.releaseInvertedPaginationAnchor();
      options.onClaimInvertedScrollOwnership();
      options.hasUserScrolledRef.current = true;
      options.rearmInvertedBoundaryFromScrollPosition();
    } else {
      options.onSyncInvertedExpansionScrollLock();
    }

    return true;
  }

  if (options.preservePendingInvertedPaginationAnchorSnapshotRef.current) {
    options.preservePendingInvertedPaginationAnchorSnapshotRef.current = false;
  } else if (!hasActivePaginationAnchor) {
    options.capturePendingInvertedPaginationAnchorSnapshot();
  }

  if (
    !hasActivePaginationAnchor &&
    options.scrollViewport.scrollTop < maxScrollTop - 1
  ) {
    options.releaseInvertedPaginationAnchor();
    options.onClaimInvertedScrollOwnership();
    options.hasUserScrolledRef.current = true;
  }

  if (options.hasUserScrolledRef.current) {
    options.rearmInvertedBoundaryFromScrollPosition();
  }

  return false;
}

/**
 * Handle standard scroll updates and report whether the caller should stop processing.
 * @param options - The active viewport scroll handler options.
 * @returns Whether standard scroll processing fully handled the event.
 */
function handleStandardViewportScroll(options: ViewportScrollHandlerOptions) {
  const shouldLockInitialNormalScroll = options.shouldLockInitialNormalScroll();
  const didClearInitialNormalScrollLock =
    shouldLockInitialNormalScroll && options.scrollViewport.scrollTop !== 0;

  if (didClearInitialNormalScrollLock) {
    options.clearInitialNormalScrollLock();
    options.suppressImmediateNormalScrollIntent();
  } else if (
    shouldLockInitialNormalScroll &&
    options.scrollViewport.scrollTop === 0
  ) {
    return true;
  }

  if (
    options.normalScrollIntentSuppressionFrameRef.current !== null &&
    !didClearInitialNormalScrollLock
  ) {
    return true;
  }

  if (
    !didClearInitialNormalScrollLock &&
    options.scrollViewport.scrollTop > 0
  ) {
    options.hasUserScrolledRef.current = true;
  }

  if (options.hasUserScrolledRef.current) {
    options.rearmStandardBoundaryFromScrollPosition();
  }

  return false;
}
