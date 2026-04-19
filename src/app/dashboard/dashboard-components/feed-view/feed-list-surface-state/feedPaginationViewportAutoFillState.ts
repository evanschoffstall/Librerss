const STANDARD_VIEWPORT_REFILL_SHRINK_THRESHOLD_PX = 1;

export interface FinishStandardViewportRefillOptions {
  articleFilter: string;
  articlesPerPage: number;
  currentFilteredFeedLength: number;
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: BooleanRef;
  standardViewportRefillTargetVisibleCountRef?: NullableNumberRef;
  visibleArticleCountRef: { current: number };
}

export interface StandardViewportRefillStateOptions {
  effectiveListHeight: number;
  hasUserScrolled: boolean;
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: BooleanRef;
  lastAutoFillListHeightRef: NullableNumberRef;
}

export interface StandardViewportRefillTargetOptions {
  articlesPerPage: number;
  hasUserScrolled: boolean;
  standardViewportRefillTargetVisibleCountRef?: NullableNumberRef;
  visibleArticleCountRef: { current: number };
}

interface ActivateStandardViewportRefillOptions {
  articleFilter: string;
  articlesPerPage: number;
  hasListShrunk: boolean;
  hasUserScrolled: boolean;
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: BooleanRef;
  standardViewportRefillTargetVisibleCountRef?: NullableNumberRef;
  visibleArticleCountRef: { current: number };
}

interface BooleanRef {
  current: boolean;
}

interface ListHeightShrinkState {
  effectiveListHeight: number;
  lastAutoFillListHeightRef: NullableNumberRef;
}

interface NullableNumberRef {
  current: null | number;
}

/**
 * Arms desktop unread refill state when the current pass is recovering a
 * shrunken unread window or a user-owned scrolled window.
 * @param options - The unread viewport state for the current pass.
 */
export function activateStandardViewportRefill(
  options: ActivateStandardViewportRefillOptions,
) {
  if (options.isInvertedScroll) {
    return;
  }

  primeStandardViewportRefillTarget({
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    hasListShrunk: options.hasListShrunk,
    hasUserScrolled: options.hasUserScrolled,
    isStandardViewportRefillActiveRef:
      options.isStandardViewportRefillActiveRef,
    standardViewportRefillTargetVisibleCountRef:
      options.standardViewportRefillTargetVisibleCountRef,
    visibleArticleCountRef: options.visibleArticleCountRef,
  });
  options.isStandardViewportRefillActiveRef.current = true;
}

/**
 * Clears the desktop viewport-refill state once the current refill cycle no
 * longer owns the feed window.
 * @param isStandardViewportRefillActiveRef - Tracks whether a desktop refill is active.
 * @param standardViewportRefillTargetVisibleCountRef - Stores the visible-count target owned by a desktop refill.
 */
export function clearStandardViewportRefillState(
  isStandardViewportRefillActiveRef: BooleanRef,
  standardViewportRefillTargetVisibleCountRef?: NullableNumberRef,
) {
  isStandardViewportRefillActiveRef.current = false;

  if (standardViewportRefillTargetVisibleCountRef) {
    standardViewportRefillTargetVisibleCountRef.current = null;
  }
}

/**
 * Clears desktop refill ownership once the current pass no longer owns the
 * unread viewport.
 * @param isInvertedScroll - Whether the active surface is using inverted scroll.
 * @param isStandardViewportRefillActiveRef - Tracks whether desktop refill state is active.
 * @param standardViewportRefillTargetVisibleCountRef - Stores the desktop refill target.
 */
export function finalizeInactiveViewportAutoFill(
  isInvertedScroll: boolean,
  isStandardViewportRefillActiveRef: BooleanRef,
  standardViewportRefillTargetVisibleCountRef?: NullableNumberRef,
) {
  if (isInvertedScroll) {
    return;
  }

  clearStandardViewportRefillState(
    isStandardViewportRefillActiveRef,
    standardViewportRefillTargetVisibleCountRef,
  );
}

/**
 * Returns whether the current desktop unread refill has already restored the
 * unread window it owns.
 * @param options - The active desktop refill state.
 * @returns Whether the current desktop unread refill target has been satisfied.
 */
export function hasReachedStandardViewportRefillTarget(
  options: FinishStandardViewportRefillOptions,
) {
  if (options.articleFilter !== "unread" || options.isInvertedScroll) {
    return false;
  }

  const refillTargetVisibleCount = Math.min(
    options.standardViewportRefillTargetVisibleCountRef?.current ??
      options.visibleArticleCountRef.current + options.articlesPerPage,
    Math.max(
      options.currentFilteredFeedLength,
      options.visibleArticleCountRef.current,
    ),
  );

  return (
    options.isStandardViewportRefillActiveRef.current &&
    options.visibleArticleCountRef.current >= refillTargetVisibleCount
  );
}

/**
 * Resolves whether the current desktop pass is recovering from a shrunken list
 * and whether an already-owned desktop refill may continue.
 * @param options - The measured list-height state for the current pass.
 * @returns The current list shrink status and desktop refill permission.
 */
export function resolveStandardViewportRefillState(
  options: StandardViewportRefillStateOptions,
) {
  const hasListShrunk = hasListHeightShrunk({
    effectiveListHeight: options.effectiveListHeight,
    lastAutoFillListHeightRef: options.lastAutoFillListHeightRef,
  });

  return {
    hasListShrunk,
    shouldAllowStandardViewportRefill:
      !options.isInvertedScroll &&
      (options.isStandardViewportRefillActiveRef.current ||
        (options.hasUserScrolled && hasListShrunk)),
  };
}

/**
 * Returns whether the measured list height shrank enough to classify the next
 * pass as unread-window recovery instead of initial underfill work.
 * @param options - The list-height samples used to detect a shrink transition.
 * @returns Whether the feed list has materially shrunk since the last pass.
 */
function hasListHeightShrunk(options: ListHeightShrinkState) {
  const previousListHeight = options.lastAutoFillListHeightRef.current;

  return (
    previousListHeight !== null &&
    previousListHeight - options.effectiveListHeight >
      STANDARD_VIEWPORT_REFILL_SHRINK_THRESHOLD_PX
  );
}

/**
 * Stores a refill target only for desktop unread windows that either shrank or
 * were explicitly owned by the reader's prior scroll position.
 * @param options - The unread refill target inputs for the active auto-fill cycle.
 */
function primeStandardViewportRefillTarget(
  options: StandardViewportRefillTargetOptions & {
    articleFilter: string;
    hasListShrunk: boolean;
    isStandardViewportRefillActiveRef: { current: boolean };
  },
) {
  if (
    options.articleFilter !== "unread" ||
    options.isStandardViewportRefillActiveRef.current ||
    (!options.hasListShrunk && !options.hasUserScrolled) ||
    !options.standardViewportRefillTargetVisibleCountRef
  ) {
    return;
  }

  options.standardViewportRefillTargetVisibleCountRef.current =
    resolveStandardViewportRefillTargetVisibleCount(options);
}

/**
 * Resolves the unread visible-count target owned by the current desktop refill.
 * Non-scrolled desktop refills collapse to the minimum overflow window, while
 * user-owned windows preserve the larger count they earned.
 * @param options - The unread refill target inputs for the active auto-fill cycle.
 * @returns The visible-count target for the current desktop refill cycle.
 */
function resolveStandardViewportRefillTargetVisibleCount(
  options: StandardViewportRefillTargetOptions,
) {
  return options.hasUserScrolled
    ? Math.max(
        options.visibleArticleCountRef.current,
        options.articlesPerPage * 2,
      )
    : options.articlesPerPage * 2;
}
