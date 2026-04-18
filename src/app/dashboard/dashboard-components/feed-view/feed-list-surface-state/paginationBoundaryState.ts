export interface PaginationBoundaryRearmRefs {
  hasPendingBoundaryRearmAfterCooldownRef: BooleanRef;
  hasPendingServerRevealRef: BooleanRef;
  hasRequestedServerLoadRef: BooleanRef;
  invertedPaginationAnchorRef: UnknownNullableRef;
}

export interface PaginationBoundaryUserIntentOptions extends PaginationBoundaryRearmRefs {
  isInvertedLoadBoundaryArmedRef: BooleanRef;
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: BooleanRef;
  scrollViewport: HTMLElement | null;
}

interface BooleanRef {
  current: boolean;
}

interface NullableNumberRef {
  current: null | number;
}

interface UnknownNullableRef {
  current: unknown;
}

/**
 * @param options
 * @param options.armedBoundaryRef
 * @param options.hasPendingBoundaryRearmAfterCooldownRef
 * @param options.hasRequestedServerLoadRef
 */
export function finalizePaginationBoundaryRearm(options: {
  armedBoundaryRef: BooleanRef;
  hasPendingBoundaryRearmAfterCooldownRef: BooleanRef;
  hasRequestedServerLoadRef: BooleanRef;
}) {
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
 * @param options
 * @param options.hasPendingServerRevealRef
 * @param options.invertedPaginationAnchorRef
 */
export function hasPendingPaginationBoundaryState(options: {
  hasPendingServerRevealRef: BooleanRef;
  invertedPaginationAnchorRef: UnknownNullableRef;
}) {
  return (
    options.hasPendingServerRevealRef.current ||
    options.invertedPaginationAnchorRef.current !== null
  );
}

/**
 * @param options
 * @param options.clearServerLoadCooldown
 * @param options.filteredFeedLength
 * @param options.hasPendingBoundaryRearmAfterCooldownRef
 * @param options.hasPendingServerRevealRef
 * @param options.hasRequestedServerLoadRef
 * @param options.hasResolvedStandardViewportRevealRef
 * @param options.hasUserScrolledRef
 * @param options.isInvertedLoadBoundaryArmedRef
 * @param options.isStandardLoadBoundaryArmedRef
 * @param options.isStandardViewportRefillActiveRef
 * @param options.lastAutoFillListHeightRef
 * @param options.lastInvertedAwayBoundarySnapshotRef
 * @param options.lastInvertedScrollTopRef
 * @param options.lastStandardScrollTopRef
 * @param options.paginationFrameRef
 * @param options.pendingInvertedPaginationAnchorSnapshotRef
 * @param options.previousFilteredFeedLengthRef
 * @param options.previousFilteredFeedLengthRef.current
 */
export function resetPaginationRuntimeState(options: {
  clearServerLoadCooldown: () => void;
  filteredFeedLength: number;
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
}) {
  options.hasUserScrolledRef.current = false;
  options.clearServerLoadCooldown();
  options.hasRequestedServerLoadRef.current = false;
  options.hasPendingServerRevealRef.current = false;
  options.hasPendingBoundaryRearmAfterCooldownRef.current = false;
  options.isInvertedLoadBoundaryArmedRef.current = true;
  options.isStandardLoadBoundaryArmedRef.current = true;
  options.isStandardViewportRefillActiveRef.current = false;
  options.hasResolvedStandardViewportRevealRef.current = false;
  options.lastAutoFillListHeightRef.current = null;
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
 * @param scrollViewport
 * @param hasPendingServerRevealRef
 * @param invertedPaginationAnchorRef
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
