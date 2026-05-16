/**
 * Describes the pagination boundary rearm refs.
 */
export interface PaginationBoundaryRearmRefs {
  hasPendingBoundaryRearmAfterCooldownRef: BooleanRef;
  hasPendingServerRevealRef: BooleanRef;
  hasRequestedServerLoadRef: BooleanRef;
  invertedPaginationAnchorRef: UnknownNullableRef;
}

/**
 * Describes the options for pagination boundary user intent.
 */
export interface PaginationBoundaryUserIntentOptions extends PaginationBoundaryRearmRefs {
  isInvertedLoadBoundaryArmedRef: BooleanRef;
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: BooleanRef;
  /** Tracks the last recorded inverted scroll position. Passed through so the
   * inverted touchmove intent handler can advance the position history when the
   * user gestures from a non-boundary position, enabling the server-load gate
   * in `maybeLoadInvertedNextPage` to distinguish genuine return-from-away
   * intent from a repeated at-boundary touch. */
  lastInvertedScrollTopRef?: { current: null | number };
  scrollViewport: HTMLElement | null;
}

/**
 * Describes the boolean ref.
 */
interface BooleanRef {
  current: boolean;
}

/**
 * Describes the options for finalize pagination boundary rearm.
 */
interface FinalizePaginationBoundaryRearmOptions {
  armedBoundaryRef: BooleanRef;
  hasPendingBoundaryRearmAfterCooldownRef: BooleanRef;
  hasRequestedServerLoadRef: BooleanRef;
}

/**
 * Describes the options for has pending pagination boundary state.
 */
interface HasPendingPaginationBoundaryStateOptions {
  hasPendingServerRevealRef: BooleanRef;
  invertedPaginationAnchorRef: UnknownNullableRef;
}
/**
 * Describes the nullable number ref.
 */
interface NullableNumberRef {
  current: null | number;
}

/**
 * Describes the options for reset pagination runtime state.
 */
interface ResetPaginationRuntimeStateOptions {
  clearServerLoadCooldown: () => void;
  filteredFeedLength: number;
  hasCompletedInvertedServerRevealRef: BooleanRef;
  hasPendingBoundaryRearmAfterCooldownRef: BooleanRef;
  hasPendingServerRevealRef: BooleanRef;
  hasRequestedServerLoadRef: BooleanRef;
  hasResolvedStandardViewportRevealRef: BooleanRef;
  hasUserScrolledRef: BooleanRef;
  isInvertedLoadBoundaryArmedRef: BooleanRef;
  isStandardLoadBoundaryArmedRef: BooleanRef;
  isStandardViewportRefillActiveRef: BooleanRef;
  lastAutoFillListHeightRef: NullableNumberRef;
  lastInvertedAwayBoundarySnapshotRef: UnknownNullableRef;
  lastInvertedScrollTopRef: NullableNumberRef;
  lastStandardScrollTopRef: NullableNumberRef;
  paginationFrameRef: NullableNumberRef;
  pendingInvertedPaginationAnchorSnapshotRef: UnknownNullableRef;
  previousFilteredFeedLengthRef: { current: number };
  standardViewportRefillTargetVisibleCountRef: NullableNumberRef;
}
/**
 * Describes the unknown nullable ref.
 */
interface UnknownNullableRef {
  current: unknown;
}

/**
 * Process the finalize pagination boundary rearm.
 * @param options - The options used to process the finalize pagination boundary rearm.
 * @returns Whether finalize pagination boundary rearm.
 */
export function finalizePaginationBoundaryRearm(
  options: FinalizePaginationBoundaryRearmOptions,
) {
  if (options.hasRequestedServerLoadRef.current) {
    options.hasPendingBoundaryRearmAfterCooldownRef.current = true;
    return false;
  }

  options.armedBoundaryRef.current = true;
  options.hasPendingBoundaryRearmAfterCooldownRef.current = false;
  options.hasRequestedServerLoadRef.current = false;
  return true;
}
/**
 * Return whether has pending pagination boundary state.
 * @param options - The options used to return whether has pending pagination boundary state.
 * @returns Whether has pending pagination boundary state.
 */
export function hasPendingPaginationBoundaryState(
  options: HasPendingPaginationBoundaryStateOptions,
) {
  return (
    options.hasPendingServerRevealRef.current ||
    options.invertedPaginationAnchorRef.current !== null
  );
}

/**
 * Process the reset pagination runtime state.
 * @param options - The options used to process the reset pagination runtime state.
 */
export function resetPaginationRuntimeState(
  options: ResetPaginationRuntimeStateOptions,
) {
  options.hasUserScrolledRef.current = false;
  options.clearServerLoadCooldown();
  options.hasRequestedServerLoadRef.current = false;
  options.hasCompletedInvertedServerRevealRef.current = false;
  options.hasPendingServerRevealRef.current = false;
  options.hasPendingBoundaryRearmAfterCooldownRef.current = false;
  options.isInvertedLoadBoundaryArmedRef.current = true;
  options.isStandardLoadBoundaryArmedRef.current = true;
  options.isStandardViewportRefillActiveRef.current = false;
  options.hasResolvedStandardViewportRevealRef.current = false;
  options.lastAutoFillListHeightRef.current = null;
  options.standardViewportRefillTargetVisibleCountRef.current = null;
  options.previousFilteredFeedLengthRef.current = options.filteredFeedLength;
  options.lastInvertedScrollTopRef.current = null;
  options.pendingInvertedPaginationAnchorSnapshotRef.current = null;
  options.lastInvertedAwayBoundarySnapshotRef.current = null;
  options.lastStandardScrollTopRef.current = null;

  if (options.paginationFrameRef.current !== null) {
    window.cancelAnimationFrame(options.paginationFrameRef.current);
    options.paginationFrameRef.current = null;
  }
}

/**
 * Return whether should abort pagination boundary rearm.
 * @param scrollViewport - The scroll viewport.
 * @param hasPendingServerRevealRef - The ref that stores the has pending server reveal ref.
 * @param invertedPaginationAnchorRef - The ref that stores the inverted pagination anchor ref.
 * @returns Whether should abort pagination boundary rearm.
 */
export function shouldAbortPaginationBoundaryRearm(
  scrollViewport: HTMLElement | null,
  hasPendingServerRevealRef: BooleanRef,
  invertedPaginationAnchorRef: UnknownNullableRef,
) {
  return (
    !scrollViewport ||
    hasPendingPaginationBoundaryState({
      hasPendingServerRevealRef,
      invertedPaginationAnchorRef,
    })
  );
}
