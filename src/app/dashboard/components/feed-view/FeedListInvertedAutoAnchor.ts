import { useLayoutEffect, useRef } from "react";

import {
  observeFeedViewportHeightOwners,
  syncViewportToBottomIfNeeded,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state";

/** Inputs used to keep an inverted feed viewport anchored to the bottom. */
interface UseFeedListInvertedAutoAnchorOptions {
  contentKey: string;
  feedDataLength: number;
  isInvertedScroll: boolean;
  loadMoreSkeletonCount: number;
  scrollViewport: HTMLElement | null;
  shouldAutoAnchorInvertedScroll: () => boolean;
  virtualizedListHeight: null | number;
}

/** Inputs used to sync a hydrated inverted viewport. */
interface UseHydrationBottomSyncOptions {
  feedDataLength: number;
  isInvertedScroll: boolean;
  scrollViewport: HTMLElement | null;
  shouldAutoAnchorInvertedScroll: () => boolean;
}

/** Inputs used to observe layout owners that can change inverted height. */
interface UseObservedBottomSyncOptions {
  contentKey: string;
  feedDataLength: number;
  isInvertedScroll: boolean;
  loadMoreSkeletonCount: number;
  scrollViewport: HTMLElement | null;
  shouldAutoAnchorInvertedScroll: () => boolean;
}

/**
 * Keep an auto-owned inverted viewport pinned to the feed bottom.
 * @param options - The inverted feed viewport inputs.
 */
export function useFeedListInvertedAutoAnchor(
  options: UseFeedListInvertedAutoAnchorOptions,
): void {
  const {
    contentKey,
    feedDataLength,
    isInvertedScroll,
    loadMoreSkeletonCount,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
    virtualizedListHeight,
  } = options;

  useVirtualizedBottomSync(
    isInvertedScroll,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
    virtualizedListHeight,
  );
  useHydrationBottomSync({
    feedDataLength,
    isInvertedScroll,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
  });
  useObservedBottomSync({
    contentKey,
    feedDataLength,
    isInvertedScroll,
    loadMoreSkeletonCount,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
  });
}

/**
 * Sync the viewport bottom during hydration handoff.
 * @param options - The hydration-time bottom sync inputs.
 */
function useHydrationBottomSync(options: UseHydrationBottomSyncOptions): void {
  const {
    feedDataLength,
    isInvertedScroll,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
  } = options;
  const hydrationAnchorFrameRef = useRef<null | number>(null);

  useLayoutEffect(() => {
    return () => {
      if (hydrationAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(hydrationAnchorFrameRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (
      !isInvertedScroll ||
      scrollViewport === null ||
      !shouldAutoAnchorInvertedScroll() ||
      feedDataLength === 0
    ) {
      if (hydrationAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(hydrationAnchorFrameRef.current);
        hydrationAnchorFrameRef.current = null;
      }

      return;
    }

    if (syncViewportToBottomIfNeeded(scrollViewport)) {
      return;
    }

    hydrationAnchorFrameRef.current = window.requestAnimationFrame(() => {
      hydrationAnchorFrameRef.current = null;
      syncViewportToBottomIfNeeded(scrollViewport);
    });

    return () => {
      if (hydrationAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(hydrationAnchorFrameRef.current);
        hydrationAnchorFrameRef.current = null;
      }
    };
  }, [
    feedDataLength,
    isInvertedScroll,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
  ]);
}

/**
 * Observe layout owners that can change the inverted viewport height.
 * @param options - The observed bottom-sync inputs.
 */
function useObservedBottomSync(options: UseObservedBottomSyncOptions): void {
  const {
    contentKey,
    feedDataLength,
    isInvertedScroll,
    loadMoreSkeletonCount,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
  } = options;

  useLayoutEffect(() => {
    if (
      !isInvertedScroll ||
      scrollViewport === null ||
      !shouldAutoAnchorInvertedScroll()
    ) {
      return undefined;
    }

    let anchorFrameId: null | number = null;

    /**
     * Sync the inverted viewport to the bottom edge while auto-anchoring is
     * still active for the current frame.
     */
    const syncAutoAnchoredViewport = () => {
      if (shouldAutoAnchorInvertedScroll()) {
        syncViewportToBottomIfNeeded(scrollViewport);
      }
    };

    /**
     * Schedule the next auto-anchor sync on the next animation frame so the
     * viewport follows layout changes without stacking duplicate callbacks.
     */
    const scheduleAutoAnchorSync = () => {
      if (anchorFrameId !== null) {
        window.cancelAnimationFrame(anchorFrameId);
      }

      anchorFrameId = window.requestAnimationFrame(() => {
        anchorFrameId = null;
        syncAutoAnchoredViewport();
      });
    };

    syncAutoAnchoredViewport();
    scheduleAutoAnchorSync();

    const disconnectHeightOwnerObserver = observeFeedViewportHeightOwners(
      scrollViewport,
      scheduleAutoAnchorSync,
    );

    return () => {
      disconnectHeightOwnerObserver();

      if (anchorFrameId !== null) {
        window.cancelAnimationFrame(anchorFrameId);
      }
    };
  }, [
    contentKey,
    feedDataLength,
    isInvertedScroll,
    loadMoreSkeletonCount,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
  ]);
}

/**
 * Sync the viewport bottom after virtualized height updates settle.
 * @param isInvertedScroll - Whether inverted scrolling is active.
 * @param scrollViewport - The current scroll viewport.
 * @param shouldAutoAnchorInvertedScroll - Whether the viewport is auto-anchored.
 * @param virtualizedListHeight - The measured virtualized list height.
 */
function useVirtualizedBottomSync(
  isInvertedScroll: boolean,
  scrollViewport: HTMLElement | null,
  shouldAutoAnchorInvertedScroll: () => boolean,
  virtualizedListHeight: null | number,
): void {
  useLayoutEffect(() => {
    if (
      !isInvertedScroll ||
      scrollViewport === null ||
      virtualizedListHeight === null ||
      !shouldAutoAnchorInvertedScroll()
    ) {
      return;
    }

    syncViewportToBottomIfNeeded(scrollViewport);
  }, [
    isInvertedScroll,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
    virtualizedListHeight,
  ]);
}
