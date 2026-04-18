import { shouldAutoFillViewport } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationRules";

const STANDARD_VIEWPORT_REFILL_SHRINK_THRESHOLD_PX = 1;

export interface MaybeAutoFillViewportOptions {
  articleFilter: string;
  canLoadMoreFromServer: boolean;
  /** `immediate=true` skips the skeleton reveal delay used by scroll pagination. */
  expandVisibleWindow: (immediate?: boolean) => boolean;
  filteredFeedLengthRef: { current: number };
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  hasUserScrolledRef: { current: boolean };
  isInitialLoading: boolean;
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  lastAutoFillListHeightRef: { current: null | number };
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  scrollViewport: HTMLElement | null;
  visibleArticleCountRef: { current: number };
}

interface CompleteViewportAutoFillOptions {
  currentFilteredFeedLength: number;
  effectiveListHeight: number;
  hasUserScrolled: boolean;
  options: MaybeAutoFillViewportOptions;
  scrollViewport: HTMLElement;
  shouldAllowStandardViewportRefill: boolean;
}
interface EffectiveListHeightOptions {
  committedListHeight?: number;
  scrollViewport: HTMLElement;
}

interface FinishViewportAutoFillOptions {
  currentFilteredFeedLength: number;
  expandVisibleWindow: (immediate?: boolean) => boolean;
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  visibleArticleCountRef: { current: number };
}
interface ShouldContinueAutoFillOptions {
  currentFilteredFeedLength: number;
  currentVisibleCount: number;
  effectiveListHeight: number;
  hasUserScrolled: boolean;
  isInitialLoading: boolean;
  scrollViewport: HTMLElement;
  shouldAllowStandardViewportRefill: boolean;
}

interface StandardViewportRefillStateOptions {
  effectiveListHeight: number;
  hasUserScrolled: boolean;
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  lastAutoFillListHeightRef: { current: null | number };
}

/**
 * Process the maybe auto fill viewport now.
 * @param options - The options used to process the maybe auto fill viewport now.
 */
export function maybeAutoFillViewportNow(
  options: MaybeAutoFillViewportOptions & {
    committedListHeight?: number;
  },
) {
  const currentFilteredFeedLength = options.filteredFeedLengthRef.current;
  const hasUserScrolled = options.hasUserScrolledRef.current;

  if (shouldSkipViewportAutoFill(options, currentFilteredFeedLength)) {
    return;
  }

  const scrollViewport = options.scrollViewport;
  if (!scrollViewport) {
    return;
  }

  const effectiveListHeight = resolveEffectiveListHeight({
    committedListHeight: options.committedListHeight,
    scrollViewport,
  });
  const { shouldAllowStandardViewportRefill } =
    resolveStandardViewportRefillState({
      effectiveListHeight,
      hasUserScrolled,
      isInvertedScroll: options.isInvertedScroll,
      isStandardViewportRefillActiveRef:
        options.isStandardViewportRefillActiveRef,
      lastAutoFillListHeightRef: options.lastAutoFillListHeightRef,
    });

  if (hasUserScrolled && !shouldAllowStandardViewportRefill) {
    return;
  }

  completeViewportAutoFill({
    currentFilteredFeedLength,
    effectiveListHeight,
    hasUserScrolled,
    options,
    scrollViewport,
    shouldAllowStandardViewportRefill,
  });
}
/**
 * Process the complete viewport auto fill.
 * @param options - The options used to process the complete viewport auto fill.
 */
function completeViewportAutoFill(options: CompleteViewportAutoFillOptions) {
  const shouldContinueAutoFill = resolveShouldContinueAutoFill({
    currentFilteredFeedLength: options.currentFilteredFeedLength,
    currentVisibleCount: options.options.visibleArticleCountRef.current,
    effectiveListHeight: options.effectiveListHeight,
    hasUserScrolled: options.hasUserScrolled,
    isInitialLoading: options.options.isInitialLoading,
    scrollViewport: options.scrollViewport,
    shouldAllowStandardViewportRefill:
      options.shouldAllowStandardViewportRefill,
  });

  if (Number.isFinite(options.effectiveListHeight)) {
    options.options.lastAutoFillListHeightRef.current =
      options.effectiveListHeight;
  }

  if (!shouldContinueAutoFill) {
    if (!options.options.isInvertedScroll) {
      options.options.isStandardViewportRefillActiveRef.current = false;
    }
    return;
  }

  if (!options.options.isInvertedScroll) {
    options.options.isStandardViewportRefillActiveRef.current = true;
  }

  finishViewportAutoFill({
    currentFilteredFeedLength: options.currentFilteredFeedLength,
    expandVisibleWindow: options.options.expandVisibleWindow,
    hasPendingServerRevealRef: options.options.hasPendingServerRevealRef,
    hasRequestedServerLoadRef: options.options.hasRequestedServerLoadRef,
    isInvertedScroll: options.options.isInvertedScroll,
    isStandardViewportRefillActiveRef:
      options.options.isStandardViewportRefillActiveRef,
    requestMoreFromServer: options.options.requestMoreFromServer,
    visibleArticleCountRef: options.options.visibleArticleCountRef,
  });
}

/**
 * Process the finish viewport auto fill.
 * @param options - The options used to process the finish viewport auto fill.
 */
function finishViewportAutoFill(options: FinishViewportAutoFillOptions) {
  if (
    options.visibleArticleCountRef.current < options.currentFilteredFeedLength
  ) {
    // Auto-fill uses immediate=true: viewport refills don't need skeleton delay.
    options.expandVisibleWindow(true);
    return;
  }

  if (
    !options.isInvertedScroll &&
    !options.hasPendingServerRevealRef.current &&
    !options.hasRequestedServerLoadRef.current &&
    !options.requestMoreFromServer({ isViewportRefill: true })
  ) {
    options.isStandardViewportRefillActiveRef.current = false;
  }
}
/**
 * Process the read viewport scroll height.
 * @param scrollViewport - The scroll viewport.
 * @returns The read viewport scroll height.
 */
function readViewportScrollHeight(scrollViewport: HTMLElement) {
  try {
    return scrollViewport.scrollHeight;
  } catch {
    return Number.NaN;
  }
}

/**
 * Resolve the effective list height.
 * @param options - The options used to resolve the effective list height.
 * @returns The effective list height.
 */
function resolveEffectiveListHeight(
  options: EffectiveListHeightOptions,
): number {
  const { committedListHeight } = options;
  return typeof committedListHeight === "number" &&
    Number.isFinite(committedListHeight) &&
    committedListHeight > 0
    ? committedListHeight
    : readViewportScrollHeight(options.scrollViewport);
}
/**
 * Resolve the should continue auto fill.
 * @param options - The options used to resolve the should continue auto fill.
 * @returns Whether should continue auto fill.
 */
function resolveShouldContinueAutoFill(options: ShouldContinueAutoFillOptions) {
  return shouldAutoFillViewport({
    clientHeight: options.scrollViewport.clientHeight,
    committedListHeight: options.effectiveListHeight,
    currentVisibleCount: options.currentVisibleCount,
    filteredFeedLength: options.currentFilteredFeedLength,
    hasUserScrolled:
      options.hasUserScrolled && !options.shouldAllowStandardViewportRefill,
    isInitialLoading: options.isInitialLoading,
  });
}

/**
 * Resolve the standard viewport refill state.
 * @param options - The options used to resolve the standard viewport refill state.
 * @returns The standard viewport refill state.
 */
function resolveStandardViewportRefillState(
  options: StandardViewportRefillStateOptions,
) {
  const previousListHeight = options.lastAutoFillListHeightRef.current;
  const hasListShrunk =
    previousListHeight !== null &&
    previousListHeight - options.effectiveListHeight >
      STANDARD_VIEWPORT_REFILL_SHRINK_THRESHOLD_PX;
  const shouldAllowStandardViewportRefill =
    !options.isInvertedScroll &&
    (options.isStandardViewportRefillActiveRef.current ||
      (options.hasUserScrolled && hasListShrunk));

  return { shouldAllowStandardViewportRefill };
}

/**
 * Return whether should skip viewport auto fill.
 * @param options - The options used to return whether should skip viewport auto fill.
 * @param currentFilteredFeedLength - The current filtered feed length value.
 * @returns Whether should skip viewport auto fill.
 */
function shouldSkipViewportAutoFill(
  options: MaybeAutoFillViewportOptions,
  currentFilteredFeedLength: number,
) {
  return (
    !options.scrollViewport ||
    options.isInitialLoading ||
    (!options.canLoadMoreFromServer &&
      options.visibleArticleCountRef.current >= currentFilteredFeedLength)
  );
}
