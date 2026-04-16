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
 * Preserves boundary-departure evidence when the browser coalesces one scroll
 * interaction from an away position back onto the active boundary.
 */
export function hasMovedAwayFromBoundarySincePreviousScroll({
  isInvertedScroll,
  previousScrollTop,
  scrollViewport,
}: HasMovedAwayFromBoundarySincePreviousScrollOptions) {
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

export function resolveInvertedPaginationAnchorScrollTop({
  anchorViewportOffsetTop,
  currentAnchorOffsetTop,
  currentScrollTop,
}: ResolveInvertedPaginationAnchorScrollTopOptions) {
  return Math.max(
    0,
    currentScrollTop + (currentAnchorOffsetTop - anchorViewportOffsetTop),
  );
}

export function resolveNextVisibleCount({
  articlesPerPage,
  currentVisibleCount,
  filteredFeedLength,
}: ResolveNextVisibleCountOptions) {
  if (currentVisibleCount >= filteredFeedLength) {
    return currentVisibleCount;
  }

  return Math.min(currentVisibleCount + articlesPerPage, filteredFeedLength);
}

export function resolvePaginationBoundaryState({
  isInvertedScroll,
  scrollViewport,
}: ResolvePaginationBoundaryStateOptions): PaginationBoundaryState {
  return isInvertedScroll
    ? resolveInvertedBoundaryState(scrollViewport)
    : resolveStandardBoundaryState(scrollViewport);
}

export function shouldAutoFillViewport({
  clientHeight,
  committedListHeight,
  currentVisibleCount,
  filteredFeedLength,
  hasUserScrolled,
  isInitialLoading,
}: ShouldAutoFillViewportOptions) {
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

function readStandardRemainingDistance(scrollViewport: HTMLElement) {
  return (
    scrollViewport.scrollHeight -
    (scrollViewport.scrollTop + scrollViewport.clientHeight)
  );
}

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
