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

function completeViewportAutoFill(options: {
  currentFilteredFeedLength: number;
  effectiveListHeight: number;
  hasUserScrolled: boolean;
  options: MaybeAutoFillViewportOptions;
  scrollViewport: HTMLElement;
  shouldAllowStandardViewportRefill: boolean;
}) {
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

function finishViewportAutoFill(options: {
  currentFilteredFeedLength: number;
  expandVisibleWindow: (immediate?: boolean) => boolean;
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  visibleArticleCountRef: { current: number };
}) {
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

function readViewportScrollHeight(scrollViewport: HTMLElement) {
  try {
    return scrollViewport.scrollHeight;
  } catch {
    return Number.NaN;
  }
}

function resolveEffectiveListHeight(options: {
  committedListHeight?: number;
  scrollViewport: HTMLElement;
}): number {
  const { committedListHeight } = options;
  return typeof committedListHeight === "number" &&
    Number.isFinite(committedListHeight) &&
    committedListHeight > 0
    ? committedListHeight
    : readViewportScrollHeight(options.scrollViewport);
}

function resolveShouldContinueAutoFill(options: {
  currentFilteredFeedLength: number;
  currentVisibleCount: number;
  effectiveListHeight: number;
  hasUserScrolled: boolean;
  isInitialLoading: boolean;
  scrollViewport: HTMLElement;
  shouldAllowStandardViewportRefill: boolean;
}) {
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

function resolveStandardViewportRefillState(options: {
  effectiveListHeight: number;
  hasUserScrolled: boolean;
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  lastAutoFillListHeightRef: { current: null | number };
}) {
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
