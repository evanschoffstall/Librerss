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
 * @param root0
 * @param root0.hasRequestedServerLoadRef
 * @param root0.isInvertedLoadBoundaryArmedRef
 * @param root0.isInvertedScroll
 * @param root0.scrollViewport
 */
export function useInvertedPaginationAnchor({
  hasRequestedServerLoadRef,
  isInvertedLoadBoundaryArmedRef,
  isInvertedScroll,
  scrollViewport,
}: UseInvertedPaginationAnchorOptions) {
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
 * @param options
 * @param options.isInvertedScroll
 * @param options.lastInvertedAwayBoundarySnapshotRef
 * @param options.pendingInvertedPaginationAnchorSnapshotRef
 * @param options.scrollViewport
 */
function createCapturePendingInvertedPaginationAnchorSnapshot(options: {
  isInvertedScroll: boolean;
  lastInvertedAwayBoundarySnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  pendingInvertedPaginationAnchorSnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  scrollViewport: HTMLElement | null;
}) {
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
 * @param options
 * @param options.invertedPaginationAnchorRef
 * @param options.isInvertedScroll
 * @param options.lastInvertedAwayBoundarySnapshotRef
 * @param options.lastInvertedScrollTopRef
 * @param options.pendingInvertedPaginationAnchorSnapshotRef
 * @param options.scrollViewport
 * @param options.syncInvertedPaginationAnchor
 */
function createPrimeInvertedPaginationAnchor(options: {
  invertedPaginationAnchorRef: React.RefObject<InvertedPaginationAnchorState | null>;
  isInvertedScroll: boolean;
  lastInvertedAwayBoundarySnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  lastInvertedScrollTopRef: React.RefObject<null | number>;
  pendingInvertedPaginationAnchorSnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  scrollViewport: HTMLElement | null;
  syncInvertedPaginationAnchor: () => number | undefined;
}) {
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
 * @param invertedPaginationAnchorFrameRef
 * @param invertedPaginationAnchorRef
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
 * @param root0
 * @param root0.hasRequestedServerLoadRef
 * @param root0.invertedPaginationAnchorFrameRef
 * @param root0.invertedPaginationAnchorRef
 * @param root0.isInvertedLoadBoundaryArmedRef
 * @param root0.scrollViewport
 */
function createSyncInvertedPaginationAnchor({
  hasRequestedServerLoadRef,
  invertedPaginationAnchorFrameRef,
  invertedPaginationAnchorRef,
  isInvertedLoadBoundaryArmedRef,
  scrollViewport,
}: SyncPaginationAnchorOptions) {
  /**
   *
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
 * @param hasRequestedServerLoadRef
 * @param isInvertedLoadBoundaryArmedRef
 * @param anchorInitialScrollTop
 * @param nextScrollTop
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
 * @param anchorState
 * @param scrollViewport
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
 * @param anchorArticleKey
 */
function resolvePaginationAnchorElement(anchorArticleKey: null | string) {
  return (
    findInvertedExpansionLockAnchor(anchorArticleKey) ??
    findInvertedExpansionHeaderAnchor(anchorArticleKey)
  );
}

/**
 * @param options
 * @param options.lastInvertedAwayBoundarySnapshotRef
 * @param options.pendingInvertedPaginationAnchorSnapshotRef
 * @param options.scrollViewport
 */
function resolveSelectedAnchorSnapshot(options: {
  lastInvertedAwayBoundarySnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  pendingInvertedPaginationAnchorSnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  scrollViewport: HTMLElement;
}) {
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
 * @param invertedPaginationAnchorFrameRef
 * @param syncInvertedPaginationAnchor
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
 * @param releaseAt
 */
function shouldReleasePaginationAnchor(releaseAt: number) {
  return performance.now() >= releaseAt;
}

/**
 * @param options
 * @param options.hasRequestedServerLoadRef
 * @param options.invertedPaginationAnchorFrameRef
 * @param options.invertedPaginationAnchorRef
 * @param options.isInvertedScroll
 * @param options.lastInvertedAwayBoundarySnapshotRef
 * @param options.pendingInvertedPaginationAnchorSnapshotRef
 * @param options.scrollViewport
 */
function useInvertedPaginationAnchorBoundaryCallbacks(options: {
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  invertedPaginationAnchorFrameRef: React.RefObject<null | number>;
  invertedPaginationAnchorRef: React.RefObject<InvertedPaginationAnchorState | null>;
  isInvertedScroll: boolean;
  lastInvertedAwayBoundarySnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  pendingInvertedPaginationAnchorSnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  scrollViewport: HTMLElement | null;
}) {
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
 *
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
 * @param options
 * @param options.hasRequestedServerLoadRef
 * @param options.invertedPaginationAnchorFrameRef
 * @param options.invertedPaginationAnchorRef
 * @param options.isInvertedLoadBoundaryArmedRef
 * @param options.isInvertedScroll
 * @param options.lastInvertedAwayBoundarySnapshotRef
 * @param options.lastInvertedScrollTopRef
 * @param options.pendingInvertedPaginationAnchorSnapshotRef
 * @param options.scrollViewport
 */
function useInvertedPaginationAnchorScrollCallbacks(options: {
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  invertedPaginationAnchorFrameRef: React.RefObject<null | number>;
  invertedPaginationAnchorRef: React.RefObject<InvertedPaginationAnchorState | null>;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  lastInvertedAwayBoundarySnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  lastInvertedScrollTopRef: React.RefObject<null | number>;
  pendingInvertedPaginationAnchorSnapshotRef: React.RefObject<null | PendingInvertedPaginationAnchorSnapshot>;
  scrollViewport: HTMLElement | null;
}) {
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
 * @param options
 * @param options.hasRequestedServerLoadRef
 * @param options.invertedPaginationAnchorFrameRef
 * @param options.invertedPaginationAnchorRef
 * @param options.isInvertedLoadBoundaryArmedRef
 * @param options.scrollViewport
 */
function useInvertedPaginationAnchorSync(options: {
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  invertedPaginationAnchorFrameRef: React.RefObject<null | number>;
  invertedPaginationAnchorRef: React.RefObject<InvertedPaginationAnchorState | null>;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  scrollViewport: HTMLElement | null;
}) {
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
