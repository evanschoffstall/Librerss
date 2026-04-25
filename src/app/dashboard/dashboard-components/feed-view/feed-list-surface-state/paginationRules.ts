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
  activeViewportRefillTargetVisibleCount?: null | number;
  articleFilter: string;
  articlesPerPage: number;
  clientHeight: number;
  committedListHeight: number;
  currentVisibleCount: number;
  filteredFeedLength: number;
  hasListShrunk?: boolean;
  hasUserScrolled: boolean;
  isInitialLoading: boolean;
  isInvertedScroll?: boolean;
  shouldContinueOwnedRefillWithoutLocalBacklog?: boolean;
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
  if (shouldSkipViewportAutoFill(options)) {
    return false;
  }

  const scrollableOverflowPx =
    options.committedListHeight - options.clientHeight;

  return (
    Number.isFinite(scrollableOverflowPx) &&
    scrollableOverflowPx <= FEED_MIN_AUTOFILL_OVERFLOW_PX
  );
}

/**
 * Return whether the visible unread window has exhausted its local backlog and
 * no owned refill continuation is still allowed.
 * @param options - The auto-fill inputs for the current feed surface.
 * @returns Whether the local unread backlog is exhausted for generic auto-fill.
 */
function hasExhaustedViewportAutoFillBacklog(
  options: ShouldAutoFillViewportOptions,
) {
  return (
    options.currentVisibleCount >= options.filteredFeedLength &&
    !options.shouldContinueOwnedRefillWithoutLocalBacklog
  );
}

/**
 * Return whether the active owned viewport-refill target has already been
 * satisfied.
 * @param options - The auto-fill inputs for the current feed surface.
 * @returns Whether the owned visible-count target has been reached.
 */
function hasReachedOwnedViewportRefillTarget(
  options: ShouldAutoFillViewportOptions,
) {
  const ownedViewportRefillTarget = resolveOwnedViewportRefillTarget(options);

  return (
    ownedViewportRefillTarget !== null &&
    options.currentVisibleCount >= ownedViewportRefillTarget
  );
}

/**
 * Return whether the generic viewport auto-fill inputs contain usable numeric
 * measurements.
 * @param options - The auto-fill inputs for the current feed surface.
 * @returns Whether the numeric inputs are valid for auto-fill evaluation.
 */
function hasValidViewportAutoFillMeasurements(
  options: ShouldAutoFillViewportOptions,
) {
  return (
    Number.isFinite(options.articlesPerPage) &&
    options.articlesPerPage > 0 &&
    Number.isFinite(options.clientHeight) &&
    options.clientHeight > 0
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
 * Resolve the active owned viewport-refill target when one is present.
 * @param options - The auto-fill inputs for the current feed surface.
 * @returns The active owned target, or `null` when no owned target is active.
 */
function resolveOwnedViewportRefillTarget(
  options: ShouldAutoFillViewportOptions,
) {
  return typeof options.activeViewportRefillTargetVisibleCount === "number" &&
    Number.isFinite(options.activeViewportRefillTargetVisibleCount)
    ? options.activeViewportRefillTargetVisibleCount
    : null;
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

/**
 * Return whether the generic viewport auto-fill pass should short-circuit
 * before measuring overflow.
 *
 * The one-page ceiling check enforces the Initial Hydration Contract: without
 * an active owned refill target the visible window must never grow past one
 * configured page by auto-fill alone. This prevents unbounded DOM expansion on
 * first render and after browser reloads, regardless of the scroll-container
 * measurement at the time of each auto-fill pass. An owned refill target (for
 * example the two-page window that the post-refresh reset arms) is the only
 * path that may legally exceed this ceiling.
 *
 * @param options - The auto-fill inputs for the current feed surface.
 * @returns Whether the caller should skip generic viewport auto-fill.
 */
function shouldSkipViewportAutoFill(options: ShouldAutoFillViewportOptions) {
  if (
    options.isInitialLoading ||
    options.hasUserScrolled ||
    !hasValidViewportAutoFillMeasurements(options)
  ) {
    return true;
  }

  if (hasExhaustedViewportAutoFillBacklog(options)) {
    return true;
  }

  const canBypassOnePageCeilingForShrinkRecovery =
    options.articleFilter === "unread" && options.hasListShrunk === true;

  if (
    resolveOwnedViewportRefillTarget(options) === null &&
    options.currentVisibleCount >= options.articlesPerPage &&
    !canBypassOnePageCeilingForShrinkRecovery
  ) {
    // Hard count ceiling: auto-fill must never expand the visible window past
    // one configured page without an owned refill target. This enforces the
    // Initial Hydration Contract regardless of whether the committed list height
    // has reached the viewport height, ensuring consistent behaviour between
    // unit tests (mocked heights) and real browser (variable article heights).
    return true;
  }

  return hasReachedOwnedViewportRefillTarget(options);
}
