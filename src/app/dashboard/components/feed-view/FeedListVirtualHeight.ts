import type { Dispatch, SetStateAction } from "react";

import { useCallback } from "react";

import type { InvertedPaginationAnchorState } from "@/app/dashboard/components/feed-view/feed-list-surface-state";

import { syncViewportToBottomIfNeeded } from "@/app/dashboard/components/feed-view/feed-list-surface-state";

/** Options used while applying a measured virtual-list height. */
interface HandleVirtualListHeightChangeOptions extends UseFeedVirtualListHeightChangeOptions {
  nextTotalListHeight: number;
}

/** Options used to maintain the inverted viewport height floor. */
interface UpdateInvertedHeightFloorOptions {
  invertedHeightFloorRef: { current: null | number };
  invertedPaginationAnchorRef: {
    current: InvertedPaginationAnchorState | null;
  };
  nextTotalListHeight: number;
  scrollViewport: HTMLElement;
  shouldAutoAnchorViewport: boolean;
}

/** Options used to build the FeedList virtual-height change callback. */
interface UseFeedVirtualListHeightChangeOptions {
  hasSearchTerm: boolean;
  invertedHeightFloorRef: { current: null | number };
  invertedPaginationAnchorRef: {
    current: InvertedPaginationAnchorState | null;
  };
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  isMountedRef: { current: boolean };
  isSearchFetching: boolean;
  maybeAutoFillViewport: (committedListHeight?: number) => void;
  scrollViewport: HTMLElement | null;
  setMeasuredTotalListHeight: Dispatch<SetStateAction<null | number>>;
  shouldAutoAnchorInvertedScroll: () => boolean;
  shouldLockInitialNormalScroll: () => boolean;
  syncInvertedExpansionScrollLock: () => void;
  syncInvertedPaginationAnchor: () => void;
}

/**
 * Synchronize scrollTop through scrollTo when available, with direct assignment as a fallback.
 * @param viewport - The scroll viewport to update.
 * @param top - The target scrollTop value.
 */
export function syncViewportScrollTop(viewport: HTMLElement, top: number) {
  if (typeof viewport.scrollTo === "function") {
    viewport.scrollTo({ behavior: "auto", top });
  }

  if (Math.abs(viewport.scrollTop - top) > 1) {
    viewport.scrollTop = top;
  }
}

/**
 * Build the virtual-list height callback used by FeedList.
 * @param options - Virtual-list state and callbacks from FeedList.
 * @returns A stable measured-height change callback.
 */
export function useFeedVirtualListHeightChange(
  options: UseFeedVirtualListHeightChangeOptions,
) {
  return useCallback(
    (nextTotalListHeight: number) => {
      handleVirtualListHeightChange({ ...options, nextTotalListHeight });
    },
    [options],
  );
}

/**
 * Apply a virtual-list height change to scroll state, measurement state, and auto-fill.
 * @param options - The measured height and FeedList state needed to reconcile it.
 */
function handleVirtualListHeightChange(
  options: HandleVirtualListHeightChangeOptions,
) {
  if (!options.isMountedRef.current) {
    return;
  }

  const shouldAutoAnchorViewport =
    options.isInvertedScroll && options.shouldAutoAnchorInvertedScroll();

  if (options.isInvertedScroll && options.scrollViewport) {
    updateInvertedHeightFloor({
      invertedHeightFloorRef: options.invertedHeightFloorRef,
      invertedPaginationAnchorRef: options.invertedPaginationAnchorRef,
      nextTotalListHeight: options.nextTotalListHeight,
      scrollViewport: options.scrollViewport,
      shouldAutoAnchorViewport,
    });
  }

  options.setMeasuredTotalListHeight((currentHeight) =>
    currentHeight === options.nextTotalListHeight
      ? currentHeight
      : options.nextTotalListHeight,
  );

  syncViewportAfterHeightChange(options, shouldAutoAnchorViewport);

  if (!(options.hasSearchTerm && options.isSearchFetching)) {
    options.maybeAutoFillViewport(
      Math.max(
        options.nextTotalListHeight,
        options.invertedHeightFloorRef.current ?? 0,
      ),
    );
  }
}

/**
 * Synchronize viewport position after a virtual-list height change.
 * @param options - The active height-change state.
 * @param shouldAutoAnchorViewport - Whether the inverted viewport should stay pinned to the bottom.
 */
function syncViewportAfterHeightChange(
  options: HandleVirtualListHeightChangeOptions,
  shouldAutoAnchorViewport: boolean,
) {
  if (options.isInvertedScroll) {
    options.syncInvertedExpansionScrollLock();
    options.syncInvertedPaginationAnchor();

    if (
      shouldAutoAnchorViewport &&
      options.invertedPaginationAnchorRef.current === null &&
      options.scrollViewport
    ) {
      syncViewportToBottomIfNeeded(options.scrollViewport);
    }
  } else if (
    options.scrollViewport &&
    !options.isCollapseScrollRestoreActive &&
    options.shouldLockInitialNormalScroll()
  ) {
    syncViewportScrollTop(options.scrollViewport, 0);
  }
}

/**
 * Update the inverted height floor used to prevent visual collapse during anchored changes.
 * @param options - The current measured height and inverted anchor refs.
 */
function updateInvertedHeightFloor(options: UpdateInvertedHeightFloorOptions) {
  const {
    invertedHeightFloorRef,
    invertedPaginationAnchorRef,
    nextTotalListHeight,
    scrollViewport,
    shouldAutoAnchorViewport,
  } = options;
  const activePaginationAnchor = invertedPaginationAnchorRef.current;

  if (
    activePaginationAnchor !== null &&
    activePaginationAnchor.anchorArticleKey === null
  ) {
    const nextAnchoredScrollTop = Math.max(
      0,
      activePaginationAnchor.initialScrollTop +
        (nextTotalListHeight - activePaginationAnchor.initialScrollHeight),
    );

    syncViewportScrollTop(scrollViewport, nextAnchoredScrollTop);
    activePaginationAnchor.initialScrollHeight = nextTotalListHeight;
    activePaginationAnchor.initialScrollTop = nextAnchoredScrollTop;
  }

  const minimumViewportFloor =
    scrollViewport.scrollTop + scrollViewport.clientHeight;

  if (invertedPaginationAnchorRef.current !== null) {
    invertedHeightFloorRef.current = Math.max(
      invertedHeightFloorRef.current ?? 0,
      nextTotalListHeight,
      minimumViewportFloor,
    );
  } else if (!shouldAutoAnchorViewport) {
    invertedHeightFloorRef.current = Math.max(
      nextTotalListHeight,
      minimumViewportFloor,
    );
  } else {
    invertedHeightFloorRef.current = null;
  }
}
