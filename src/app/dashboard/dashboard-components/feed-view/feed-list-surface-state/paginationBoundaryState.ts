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

interface FinalizePaginationBoundaryRearmOptions {
  armedBoundaryRef: BooleanRef;
  hasPendingBoundaryRearmAfterCooldownRef: BooleanRef;
  hasRequestedServerLoadRef: BooleanRef;
}

interface HasPendingPaginationBoundaryStateOptions {
  hasPendingServerRevealRef: BooleanRef;
  invertedPaginationAnchorRef: UnknownNullableRef;
}
interface NullableNumberRef {
  current: null | number;
}

interface ResetPaginationRuntimeStateOptions {
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
}
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
