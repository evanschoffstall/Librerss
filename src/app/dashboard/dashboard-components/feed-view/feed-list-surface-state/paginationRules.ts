import {
  FEED_INVERTED_LOAD_MORE_THRESHOLD_PX,
  FEED_MIN_AUTOFILL_OVERFLOW_PX,
  FEED_MIN_SCROLLABLE_OVERFLOW_PX,
  FEED_STANDARD_LOAD_MORE_TRIGGER_RATIO,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

export interface HasMovedAwayFromBoundarySincePreviousScrollOptions {
  isInvertedScroll: boolean;
  previousScrollTop: null | number;
  scrollViewport: HTMLElement;
}

export interface PaginationBoundaryState {
  hasMovedAwayFromBoundary: boolean;
  hasReachedBoundary: boolean;
}

export interface ResolveInvertedPaginationAnchorScrollTopOptions {
  anchorViewportOffsetTop: number;
  currentAnchorOffsetTop: number;
  currentScrollTop: number;
}

export interface ResolveNextVisibleCountOptions {
  articlesPerPage: number;
  currentVisibleCount: number;
  filteredFeedLength: number;
}

export interface ResolvePaginationBoundaryStateOptions {
  isInvertedScroll: boolean;
  scrollViewport: HTMLElement;
}

export interface ShouldAutoFillViewportOptions {
  clientHeight: number;
  committedListHeight: number;
  currentVisibleCount: number;
  filteredFeedLength: number;
  hasUserScrolled: boolean;
  isInitialLoading: boolean;
}

/**
 * Return whether has moved away from boundary since previous scroll.
 * @param options - The options used to return whether has moved away from boundary since previous scroll.
 * @returns Whether has moved away from boundary since previous scroll.
 */
export function hasMovedAwayFromBoundarySincePreviousScroll(
  options: HasMovedAwayFromBoundarySincePreviousScrollOptions,
) {
  const { isInvertedScroll, previousScrollTop, scrollViewport } = options;
  const currentBoundaryState = resolvePaginationBoundaryState({
    isInvertedScroll,
    scrollViewport,
  });

  if (currentBoundaryState.hasMovedAwayFromBoundary) {
    return true;
  }

  if (
    typeof previousScrollTop !== "number" ||
    !Number.isFinite(previousScrollTop)
  ) {
    return false;
  }

  return resolvePaginationBoundaryState({
    isInvertedScroll,
    scrollViewport: {
      clientHeight: scrollViewport.clientHeight,
      scrollHeight: scrollViewport.scrollHeight,
      scrollTop: previousScrollTop,
    } as HTMLElement,
  }).hasMovedAwayFromBoundary;
}

/**
 * When the user is away from the inverted top boundary, record the current
 * scroll position so that `maybeLoadInvertedNextPage` can distinguish a genuine
 * return-from-away gesture from a repeated pinned-at-boundary touch.
 *
 * The ref is only advanced when `hasMovedAwayFromBoundary` is true, which
 * preserves `null` while the user is pinned at the boundary — this keeps the
 * server-load gate in `maybeLoadInvertedNextPage` closed until the user
 * demonstrates real away intent.
 *
 * @param scrollViewport - The scroll container element.
 * @param lastInvertedScrollTopRef - Mutable ref tracking the last away-scroll
 *   position; skipped when absent (optional on the calling options object).
 */
export function maybeAdvanceInvertedScrollTopHistory(
  scrollViewport: HTMLElement,
  lastInvertedScrollTopRef: undefined | { current: null | number },
) {
  if (!lastInvertedScrollTopRef) {
    return;
  }

  const { hasMovedAwayFromBoundary } = resolvePaginationBoundaryState({
    isInvertedScroll: true,
    scrollViewport,
  });

  if (hasMovedAwayFromBoundary) {
    lastInvertedScrollTopRef.current = scrollViewport.scrollTop;
  }
}

/**
 * Resolve the inverted pagination anchor scroll top.
 * @param options - The options used to resolve the inverted pagination anchor scroll top.
 * @returns The inverted pagination anchor scroll top.
 */
export function resolveInvertedPaginationAnchorScrollTop(
  options: ResolveInvertedPaginationAnchorScrollTopOptions,
) {
  const { anchorViewportOffsetTop, currentAnchorOffsetTop, currentScrollTop } =
    options;
  return Math.max(
    0,
    currentScrollTop + (currentAnchorOffsetTop - anchorViewportOffsetTop),
  );
}

/**
 * Resolve the next visible count.
 * @param options - The options used to resolve the next visible count.
 * @returns The next visible count.
 */
export function resolveNextVisibleCount(
  options: ResolveNextVisibleCountOptions,
) {
  const { articlesPerPage, currentVisibleCount, filteredFeedLength } = options;
  if (currentVisibleCount >= filteredFeedLength) {
    return currentVisibleCount;
  }

  return Math.min(currentVisibleCount + articlesPerPage, filteredFeedLength);
}

/**
 * Resolve the pagination boundary state.
 * @param options - The options used to resolve the pagination boundary state.
 * @returns The pagination boundary state.
 */
export function resolvePaginationBoundaryState(
  options: ResolvePaginationBoundaryStateOptions,
): PaginationBoundaryState {
  const { isInvertedScroll, scrollViewport } = options;
  return isInvertedScroll
    ? resolveInvertedBoundaryState(scrollViewport)
    : resolveStandardBoundaryState(scrollViewport);
}

/**
 * Return whether should auto fill viewport.
 * @param options - The options used to return whether should auto fill viewport.
 * @returns Whether should auto fill viewport.
 */
export function shouldAutoFillViewport(options: ShouldAutoFillViewportOptions) {
  const {
    clientHeight,
    committedListHeight,
    currentVisibleCount,
    filteredFeedLength,
    hasUserScrolled,
    isInitialLoading,
  } = options;
  if (
    isInitialLoading ||
    !Number.isFinite(clientHeight) ||
    clientHeight <= 0 ||
    hasUserScrolled ||
    currentVisibleCount >= filteredFeedLength
  ) {
    return false;
  }

  const scrollableOverflowPx = committedListHeight - clientHeight;

  return (
    Number.isFinite(scrollableOverflowPx) &&
    scrollableOverflowPx <= FEED_MIN_AUTOFILL_OVERFLOW_PX
  );
}

/**
 * Process the read standard remaining distance.
 * @param scrollViewport - The scroll viewport.
 * @returns The read standard remaining distance.
 */
function readStandardRemainingDistance(scrollViewport: HTMLElement) {
  return (
    scrollViewport.scrollHeight -
    (scrollViewport.scrollTop + scrollViewport.clientHeight)
  );
}

/**
 * Resolve the inverted boundary state.
 * @param scrollViewport - The scroll viewport.
 * @returns The inverted boundary state.
 */
function resolveInvertedBoundaryState(
  scrollViewport: HTMLElement,
): PaginationBoundaryState {
  const scrollTop = scrollViewport.scrollTop;
  const hasFiniteScrollTop = Number.isFinite(scrollTop);

  return {
    hasMovedAwayFromBoundary:
      hasFiniteScrollTop && scrollTop > FEED_INVERTED_LOAD_MORE_THRESHOLD_PX,
    hasReachedBoundary:
      hasFiniteScrollTop && scrollTop <= FEED_INVERTED_LOAD_MORE_THRESHOLD_PX,
  };
}

/**
 * Resolve the standard boundary state.
 * @param scrollViewport - The scroll viewport.
 * @returns The standard boundary state.
 */
function resolveStandardBoundaryState(
  scrollViewport: HTMLElement,
): PaginationBoundaryState {
  const remainingDistance = readStandardRemainingDistance(scrollViewport);
  const hasFiniteRemainingDistance = Number.isFinite(remainingDistance);
  const maxScrollTop = Math.max(
    0,
    scrollViewport.scrollHeight - scrollViewport.clientHeight,
  );
  const hasFiniteScrollProgress =
    Number.isFinite(maxScrollTop) &&
    maxScrollTop > 0 &&
    Number.isFinite(scrollViewport.scrollTop);
  const scrollProgress = hasFiniteScrollProgress
    ? scrollViewport.scrollTop / maxScrollTop
    : Number.NaN;
  const hasReachedProgressBoundary =
    Number.isFinite(scrollProgress) &&
    scrollProgress >= FEED_STANDARD_LOAD_MORE_TRIGGER_RATIO;

  return {
    hasMovedAwayFromBoundary:
      hasFiniteRemainingDistance &&
      remainingDistance > FEED_MIN_SCROLLABLE_OVERFLOW_PX &&
      !hasReachedProgressBoundary,
    hasReachedBoundary:
      (hasFiniteRemainingDistance &&
        remainingDistance <= FEED_MIN_SCROLLABLE_OVERFLOW_PX) ||
      hasReachedProgressBoundary,
  };
}
