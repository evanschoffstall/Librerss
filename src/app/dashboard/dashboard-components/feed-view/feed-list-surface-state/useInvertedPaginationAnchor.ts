"use client";

import { useMemo, useRef } from "react";

import {
  FEED_INVERTED_LOAD_MORE_THRESHOLD_PX,
  findInvertedExpansionHeaderAnchor,
  findInvertedExpansionLockAnchor,
  findTopVisibleInvertedPaginationAnchorArticleKey,
  getViewportOffsetTop,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

export interface InvertedPaginationAnchorState {
  anchorArticleKey: null | string;
  anchorViewportOffsetTop: number;
  initialScrollHeight: number;
  initialScrollTop: number;
  releaseAt: number;
}

interface PendingInvertedPaginationAnchorSnapshot {
  anchorArticleKey: null | string;
  anchorViewportOffsetTop: number;
  scrollHeight: number;
  scrollTop: number;
}

const INVERTED_PAGINATION_ANCHOR_SYNC_WINDOW_MS = 1_500;

interface CapturePendingInvertedPaginationAnchorSnapshotOptions {
  isInvertedScroll: boolean;
  lastInvertedAwayBoundarySnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  pendingInvertedPaginationAnchorSnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  scrollViewport: HTMLElement | null;
}

interface InvertedPaginationAnchorBoundaryCallbacksOptions {
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  invertedPaginationAnchorFrameRef: React.RefObject<null | number>;
  invertedPaginationAnchorRef: React.RefObject<InvertedPaginationAnchorState | null>;
  isInvertedScroll: boolean;
  lastInvertedAwayBoundarySnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  pendingInvertedPaginationAnchorSnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  scrollViewport: HTMLElement | null;
}

interface InvertedPaginationAnchorScrollCallbacksOptions {
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  invertedPaginationAnchorFrameRef: React.RefObject<null | number>;
  invertedPaginationAnchorRef: React.RefObject<InvertedPaginationAnchorState | null>;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  lastInvertedAwayBoundarySnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  lastInvertedScrollTopRef: React.RefObject<null | number>;
  pendingInvertedPaginationAnchorSnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  scrollViewport: HTMLElement | null;
}
interface InvertedPaginationAnchorSyncOptions {
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  invertedPaginationAnchorFrameRef: React.RefObject<null | number>;
  invertedPaginationAnchorRef: React.RefObject<InvertedPaginationAnchorState | null>;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  scrollViewport: HTMLElement | null;
}

interface PrimeInvertedPaginationAnchorOptions {
  invertedPaginationAnchorRef: React.RefObject<InvertedPaginationAnchorState | null>;
  isInvertedScroll: boolean;
  lastInvertedAwayBoundarySnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  lastInvertedScrollTopRef: React.RefObject<null | number>;
  pendingInvertedPaginationAnchorSnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  scrollViewport: HTMLElement | null;
  syncInvertedPaginationAnchor: () => number | undefined;
}
interface SelectedAnchorSnapshotOptions {
  lastInvertedAwayBoundarySnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  pendingInvertedPaginationAnchorSnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  scrollViewport: HTMLElement;
}

interface SyncPaginationAnchorOptions {
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  invertedPaginationAnchorFrameRef: React.RefObject<null | number>;
  invertedPaginationAnchorRef: React.RefObject<InvertedPaginationAnchorState | null>;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  scrollViewport: HTMLElement | null;
}

interface UseInvertedPaginationAnchorOptions {
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  scrollViewport: HTMLElement | null;
}

/**
 * Manage the inverted pagination anchor.
 * @param options - The options used to manage the inverted pagination anchor.
 * @returns The inverted pagination anchor state and callbacks.
 */
export function useInvertedPaginationAnchor(
  options: UseInvertedPaginationAnchorOptions,
) {
  const {
    hasRequestedServerLoadRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    scrollViewport,
  } = options;
  const {
    invertedPaginationAnchorFrameRef,
    invertedPaginationAnchorRef,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    pendingInvertedPaginationAnchorSnapshotRef,
  } = useInvertedPaginationAnchorRefs();

  const {
    capturePendingInvertedPaginationAnchorSnapshot,
    releaseInvertedPaginationAnchor,
  } = useInvertedPaginationAnchorBoundaryCallbacks({
    hasRequestedServerLoadRef,
    invertedPaginationAnchorFrameRef,
    invertedPaginationAnchorRef,
    isInvertedScroll,
    lastInvertedAwayBoundarySnapshotRef,
    pendingInvertedPaginationAnchorSnapshotRef,
    scrollViewport,
  });
  const { primeInvertedPaginationAnchor, syncInvertedPaginationAnchor } =
    useInvertedPaginationAnchorScrollCallbacks({
      hasRequestedServerLoadRef,
      invertedPaginationAnchorFrameRef,
      invertedPaginationAnchorRef,
      isInvertedLoadBoundaryArmedRef,
      isInvertedScroll,
      lastInvertedAwayBoundarySnapshotRef,
      lastInvertedScrollTopRef,
      pendingInvertedPaginationAnchorSnapshotRef,
      scrollViewport,
    });

  return {
    capturePendingInvertedPaginationAnchorSnapshot,
    invertedPaginationAnchorFrameRef,
    invertedPaginationAnchorRef,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    pendingInvertedPaginationAnchorSnapshotRef,
    primeInvertedPaginationAnchor,
    releaseInvertedPaginationAnchor,
    syncInvertedPaginationAnchor,
  };
}

/**
 * Create the capture pending inverted pagination anchor snapshot.
 * @param options - The options used to create the capture pending inverted pagination anchor snapshot.
 * @returns The capture pending inverted pagination anchor snapshot.
 */
function createCapturePendingInvertedPaginationAnchorSnapshot(
  options: CapturePendingInvertedPaginationAnchorSnapshotOptions,
) {
  return () => {
    if (!options.isInvertedScroll || !options.scrollViewport) {
      return;
    }

    const anchorArticleKey = findTopVisibleInvertedPaginationAnchorArticleKey();
    const nextSnapshot = {
      anchorArticleKey,
      anchorViewportOffsetTop: getViewportOffsetTop(
        resolvePaginationAnchorElement(anchorArticleKey),
        options.scrollViewport,
      ),
      scrollHeight: options.scrollViewport.scrollHeight,
      scrollTop: options.scrollViewport.scrollTop,
    };

    options.pendingInvertedPaginationAnchorSnapshotRef.current = nextSnapshot;

    if (
      options.scrollViewport.scrollTop > FEED_INVERTED_LOAD_MORE_THRESHOLD_PX
    ) {
      options.lastInvertedAwayBoundarySnapshotRef.current = nextSnapshot;
    }
  };
}

/**
 * Create the prime inverted pagination anchor.
 * @param options - The options used to create the prime inverted pagination anchor.
 * @returns The prime inverted pagination anchor.
 */
function createPrimeInvertedPaginationAnchor(
  options: PrimeInvertedPaginationAnchorOptions,
) {
  return () => {
    if (!options.isInvertedScroll || !options.scrollViewport) {
      return;
    }

    const selectedAnchorSnapshot = resolveSelectedAnchorSnapshot({
      lastInvertedAwayBoundarySnapshotRef:
        options.lastInvertedAwayBoundarySnapshotRef,
      pendingInvertedPaginationAnchorSnapshotRef:
        options.pendingInvertedPaginationAnchorSnapshotRef,
      scrollViewport: options.scrollViewport,
    });
    const anchorArticleKey = selectedAnchorSnapshot
      ? selectedAnchorSnapshot.anchorArticleKey
      : findTopVisibleInvertedPaginationAnchorArticleKey();

    options.invertedPaginationAnchorRef.current = {
      anchorArticleKey,
      anchorViewportOffsetTop: selectedAnchorSnapshot
        ? selectedAnchorSnapshot.anchorViewportOffsetTop
        : getViewportOffsetTop(
            resolvePaginationAnchorElement(anchorArticleKey),
            options.scrollViewport,
          ),
      initialScrollHeight: selectedAnchorSnapshot
        ? selectedAnchorSnapshot.scrollHeight
        : options.scrollViewport.scrollHeight,
      initialScrollTop: selectedAnchorSnapshot
        ? selectedAnchorSnapshot.scrollTop
        : options.scrollViewport.scrollTop <=
            FEED_INVERTED_LOAD_MORE_THRESHOLD_PX
          ? Math.max(
              options.scrollViewport.scrollTop,
              options.lastInvertedScrollTopRef.current ??
                options.scrollViewport.scrollTop,
            )
          : options.scrollViewport.scrollTop,
      releaseAt: performance.now() + INVERTED_PAGINATION_ANCHOR_SYNC_WINDOW_MS,
    };

    options.pendingInvertedPaginationAnchorSnapshotRef.current = null;
    const nextScrollTop = options.syncInvertedPaginationAnchor();

    if (typeof nextScrollTop === "number") {
      options.lastInvertedScrollTopRef.current = nextScrollTop;
    }
  };
}

/**
 * Create the release inverted pagination anchor.
 * @param invertedPaginationAnchorFrameRef - The ref that stores the inverted pagination anchor frame ref.
 * @param invertedPaginationAnchorRef - The ref that stores the inverted pagination anchor ref.
 * @returns The release inverted pagination anchor.
 */
function createReleaseInvertedPaginationAnchor(
  invertedPaginationAnchorFrameRef: React.RefObject<null | number>,
  invertedPaginationAnchorRef: React.RefObject<InvertedPaginationAnchorState | null>,
) {
  return () => {
    invertedPaginationAnchorRef.current = null;

    if (invertedPaginationAnchorFrameRef.current !== null) {
      window.cancelAnimationFrame(invertedPaginationAnchorFrameRef.current);
      invertedPaginationAnchorFrameRef.current = null;
    }
  };
}
/**
 * Create the sync inverted pagination anchor.
 * @param options - The options used to create the sync inverted pagination anchor.
 * @returns The sync inverted pagination anchor.
 */
function createSyncInvertedPaginationAnchor(
  options: SyncPaginationAnchorOptions,
) {
  const {
    hasRequestedServerLoadRef,
    invertedPaginationAnchorFrameRef,
    invertedPaginationAnchorRef,
    isInvertedLoadBoundaryArmedRef,
    scrollViewport,
  } = options;
  /**
   * Process the sync inverted pagination anchor.
   * @returns The sync inverted pagination anchor.
   */
  const syncInvertedPaginationAnchor = () => {
    const anchorState = invertedPaginationAnchorRef.current;

    if (!anchorState || !scrollViewport) {
      return;
    }

    const nextScrollTop = resolveNextPaginationScrollTop(
      anchorState,
      scrollViewport,
    );

    if (Math.abs(scrollViewport.scrollTop - nextScrollTop) > 0.5) {
      scrollViewport.scrollTop = nextScrollTop;
    }

    rearmInvertedLoadBoundary(
      hasRequestedServerLoadRef,
      isInvertedLoadBoundaryArmedRef,
      anchorState.initialScrollTop,
      nextScrollTop,
    );

    if (shouldReleasePaginationAnchor(anchorState.releaseAt)) {
      invertedPaginationAnchorRef.current = null;
      return;
    }

    scheduleInvertedPaginationAnchorSync(
      invertedPaginationAnchorFrameRef,
      syncInvertedPaginationAnchor,
    );

    return nextScrollTop;
  };

  return syncInvertedPaginationAnchor;
}

/**
 * Process the rearm inverted load boundary.
 * @param hasRequestedServerLoadRef - The ref that stores the has requested server load ref.
 * @param isInvertedLoadBoundaryArmedRef - The ref that stores the is inverted load boundary armed ref.
 * @param anchorInitialScrollTop - The anchor initial scroll top.
 * @param nextScrollTop - The next scroll top.
 */
function rearmInvertedLoadBoundary(
  hasRequestedServerLoadRef: React.RefObject<boolean>,
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>,
  anchorInitialScrollTop: number,
  nextScrollTop: number,
) {
  if (
    !hasRequestedServerLoadRef.current &&
    anchorInitialScrollTop > FEED_INVERTED_LOAD_MORE_THRESHOLD_PX &&
    nextScrollTop > FEED_INVERTED_LOAD_MORE_THRESHOLD_PX
  ) {
    isInvertedLoadBoundaryArmedRef.current = true;
  }
}

/**
 * Resolve the next pagination scroll top.
 * @param anchorState - The anchor state.
 * @param scrollViewport - The scroll viewport.
 * @returns The next pagination scroll top.
 */
function resolveNextPaginationScrollTop(
  anchorState: InvertedPaginationAnchorState,
  scrollViewport: HTMLElement,
) {
  const anchorElement = resolvePaginationAnchorElement(
    anchorState.anchorArticleKey,
  );

  if (anchorState.anchorArticleKey !== null && anchorElement === null) {
    return scrollViewport.scrollTop;
  }

  const anchoredScrollTop = anchorElement
    ? scrollViewport.scrollTop +
      getViewportOffsetTop(anchorElement, scrollViewport) -
      anchorState.anchorViewportOffsetTop
    : null;

  return Math.max(
    0,
    anchoredScrollTop ??
      anchorState.initialScrollTop +
        (scrollViewport.scrollHeight - anchorState.initialScrollHeight),
  );
}

/**
 * Resolve the pagination anchor element.
 * @param anchorArticleKey - The anchor article key.
 * @returns The pagination anchor element.
 */
function resolvePaginationAnchorElement(anchorArticleKey: null | string) {
  return (
    findInvertedExpansionLockAnchor(anchorArticleKey) ??
    findInvertedExpansionHeaderAnchor(anchorArticleKey)
  );
}
/**
 * Resolve the selected anchor snapshot.
 * @param options - The options used to resolve the selected anchor snapshot.
 * @returns The selected anchor snapshot.
 */
function resolveSelectedAnchorSnapshot(options: SelectedAnchorSnapshotOptions) {
  const pendingAnchorSnapshot =
    options.pendingInvertedPaginationAnchorSnapshotRef.current;
  const lastAwayBoundarySnapshot =
    options.lastInvertedAwayBoundarySnapshotRef.current;
  const shouldUseLastAwayBoundarySnapshot =
    lastAwayBoundarySnapshot !== null &&
    options.scrollViewport.scrollTop <= FEED_INVERTED_LOAD_MORE_THRESHOLD_PX;

  if (shouldUseLastAwayBoundarySnapshot) {
    return lastAwayBoundarySnapshot;
  }

  if (pendingAnchorSnapshot !== null) {
    return pendingAnchorSnapshot;
  }

  return null;
}

/**
 * Process the schedule inverted pagination anchor sync.
 * @param invertedPaginationAnchorFrameRef - The ref that stores the inverted pagination anchor frame ref.
 * @param syncInvertedPaginationAnchor - The callback that sync inverted pagination anchor.
 */
function scheduleInvertedPaginationAnchorSync(
  invertedPaginationAnchorFrameRef: React.RefObject<null | number>,
  syncInvertedPaginationAnchor: () => number | undefined,
) {
  if (invertedPaginationAnchorFrameRef.current !== null) {
    window.cancelAnimationFrame(invertedPaginationAnchorFrameRef.current);
  }

  invertedPaginationAnchorFrameRef.current = window.requestAnimationFrame(
    () => {
      invertedPaginationAnchorFrameRef.current = null;
      syncInvertedPaginationAnchor();
    },
  );
}

/**
 * Return whether should release pagination anchor.
 * @param releaseAt - The release at.
 * @returns Whether should release pagination anchor.
 */
function shouldReleasePaginationAnchor(releaseAt: number) {
  return performance.now() >= releaseAt;
}
/**
 * Manage the inverted pagination anchor boundary callbacks.
 * @param options - The options used to manage the inverted pagination anchor boundary callbacks.
 * @returns The inverted pagination anchor boundary callbacks state and callbacks.
 */
function useInvertedPaginationAnchorBoundaryCallbacks(
  options: InvertedPaginationAnchorBoundaryCallbacksOptions,
) {
  const releaseInvertedPaginationAnchor = useMemo(
    () =>
      createReleaseInvertedPaginationAnchor(
        options.invertedPaginationAnchorFrameRef,
        options.invertedPaginationAnchorRef,
      ),
    [
      options.invertedPaginationAnchorFrameRef,
      options.invertedPaginationAnchorRef,
    ],
  );

  const capturePendingInvertedPaginationAnchorSnapshot = useMemo(
    () =>
      createCapturePendingInvertedPaginationAnchorSnapshot({
        isInvertedScroll: options.isInvertedScroll,
        lastInvertedAwayBoundarySnapshotRef:
          options.lastInvertedAwayBoundarySnapshotRef,
        pendingInvertedPaginationAnchorSnapshotRef:
          options.pendingInvertedPaginationAnchorSnapshotRef,
        scrollViewport: options.scrollViewport,
      }),
    [
      options.isInvertedScroll,
      options.lastInvertedAwayBoundarySnapshotRef,
      options.pendingInvertedPaginationAnchorSnapshotRef,
      options.scrollViewport,
    ],
  );

  return {
    capturePendingInvertedPaginationAnchorSnapshot,
    releaseInvertedPaginationAnchor,
  };
}

/**
 * Manage the inverted pagination anchor refs.
 * @returns The inverted pagination anchor refs state and callbacks.
 */
function useInvertedPaginationAnchorRefs() {
  return {
    invertedPaginationAnchorFrameRef: useRef<null | number>(null),
    invertedPaginationAnchorRef: useRef<InvertedPaginationAnchorState | null>(
      null,
    ),
    lastInvertedAwayBoundarySnapshotRef:
      useRef<null | PendingInvertedPaginationAnchorSnapshot>(null),
    lastInvertedScrollTopRef: useRef<null | number>(null),
    pendingInvertedPaginationAnchorSnapshotRef:
      useRef<null | PendingInvertedPaginationAnchorSnapshot>(null),
  };
}
/**
 * Manage the inverted pagination anchor scroll callbacks.
 * @param options - The options used to manage the inverted pagination anchor scroll callbacks.
 * @returns The inverted pagination anchor scroll callbacks state and callbacks.
 */
function useInvertedPaginationAnchorScrollCallbacks(
  options: InvertedPaginationAnchorScrollCallbacksOptions,
) {
  const syncInvertedPaginationAnchor = useInvertedPaginationAnchorSync(options);
  const primeInvertedPaginationAnchor = useMemo(
    () =>
      createPrimeInvertedPaginationAnchor({
        invertedPaginationAnchorRef: options.invertedPaginationAnchorRef,
        isInvertedScroll: options.isInvertedScroll,
        lastInvertedAwayBoundarySnapshotRef:
          options.lastInvertedAwayBoundarySnapshotRef,
        lastInvertedScrollTopRef: options.lastInvertedScrollTopRef,
        pendingInvertedPaginationAnchorSnapshotRef:
          options.pendingInvertedPaginationAnchorSnapshotRef,
        scrollViewport: options.scrollViewport,
        syncInvertedPaginationAnchor,
      }),
    [
      options.invertedPaginationAnchorRef,
      options.isInvertedScroll,
      options.lastInvertedAwayBoundarySnapshotRef,
      options.lastInvertedScrollTopRef,
      options.pendingInvertedPaginationAnchorSnapshotRef,
      options.scrollViewport,
      syncInvertedPaginationAnchor,
    ],
  );

  return {
    primeInvertedPaginationAnchor,
    syncInvertedPaginationAnchor,
  };
}

/**
 * Manage the inverted pagination anchor sync.
 * @param options - The options used to manage the inverted pagination anchor sync.
 * @returns The inverted pagination anchor sync state and callbacks.
 */
function useInvertedPaginationAnchorSync(
  options: InvertedPaginationAnchorSyncOptions,
) {
  return useMemo(
    () =>
      createSyncInvertedPaginationAnchor({
        hasRequestedServerLoadRef: options.hasRequestedServerLoadRef,
        invertedPaginationAnchorFrameRef:
          options.invertedPaginationAnchorFrameRef,
        invertedPaginationAnchorRef: options.invertedPaginationAnchorRef,
        isInvertedLoadBoundaryArmedRef: options.isInvertedLoadBoundaryArmedRef,
        scrollViewport: options.scrollViewport,
      }),
    [
      options.hasRequestedServerLoadRef,
      options.invertedPaginationAnchorFrameRef,
      options.invertedPaginationAnchorRef,
      options.isInvertedLoadBoundaryArmedRef,
      options.scrollViewport,
    ],
  );
}
