import {
  activateStandardViewportRefill,
  clearStandardViewportRefillState,
  finalizeInactiveViewportAutoFill,
  type FinishStandardViewportRefillOptions,
  hasReachedStandardViewportRefillTarget,
  resolveStandardViewportRefillState,
  type StandardViewportRefillStateOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/feedPaginationViewportAutoFillState";
import { shouldAutoFillViewport } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationRules";

export interface MaybeAutoFillViewportOptions {
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer: boolean;
  expandedArticleKey: null | string;
  /** `immediate=true` skips the skeleton reveal delay used by scroll pagination. */
  expandVisibleWindow: (immediate?: boolean) => boolean;
  filteredFeedLengthRef: { current: number };
  hasActiveInvertedExpansionScrollLock: () => boolean;
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  hasUserScrolledRef: { current: boolean };
  isInitialLoading: boolean;
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  lastAutoFillListHeightRef: { current: null | number };
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
  scrollViewport: HTMLElement | null;
  standardViewportRefillTargetVisibleCountRef?: { current: null | number };
  visibleArticleCountRef: { current: number };
}

interface CompleteViewportAutoFillOptions {
  currentFilteredFeedLength: number;
  effectiveListHeight: number;
  hasListShrunk: boolean;
  hasUserScrolled: boolean;
  options: MaybeAutoFillViewportOptions;
  scrollViewport: HTMLElement;
  shouldAllowStandardViewportRefill: boolean;
}

interface EffectiveListHeightOptions {
  committedListHeight?: number;
  scrollViewport: HTMLElement;
}

interface FinishViewportAutoFillOptions extends FinishStandardViewportRefillOptions {
  articleFilter: string;
  articlesPerPage: number;
  currentFilteredFeedLength: number;
  expandVisibleWindow: (immediate?: boolean) => boolean;
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
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

/**
 * Re-fills the feed viewport when the rendered unread window is still too
 * small to provide the expected amount of immediate reading headroom.
 * @param options - The feed viewport state used to decide whether more unread articles must be revealed.
 */
export function maybeAutoFillViewportNow(
  options: MaybeAutoFillViewportOptions & {
    committedListHeight?: number;
  },
) {
  const currentFilteredFeedLength = options.filteredFeedLengthRef.current;
  if (shouldSkipViewportAutoFill(options, currentFilteredFeedLength)) {
    return;
  }

  const scrollViewport = options.scrollViewport;
  if (!scrollViewport) {
    return;
  }

  const hasUserScrolled = options.hasUserScrolledRef.current;
  const effectiveListHeight = resolveEffectiveListHeight({
    committedListHeight: options.committedListHeight,
    scrollViewport,
  });
  const refillState = resolveStandardViewportRefillState({
    effectiveListHeight,
    hasUserScrolled,
    isInvertedScroll: options.isInvertedScroll,
    isStandardViewportRefillActiveRef:
      options.isStandardViewportRefillActiveRef,
    lastAutoFillListHeightRef: options.lastAutoFillListHeightRef,
  });

  if (hasUserScrolled && !refillState.shouldAllowStandardViewportRefill) {
    return;
  }

  completeViewportAutoFill({
    currentFilteredFeedLength,
    effectiveListHeight,
    hasListShrunk: refillState.hasListShrunk,
    hasUserScrolled,
    options,
    scrollViewport,
    shouldAllowStandardViewportRefill:
      refillState.shouldAllowStandardViewportRefill,
  });
}

/**
 * Continues, activates, or clears the current viewport auto-fill cycle.
 * @param options - The measured viewport and unread-window state for the active pass.
 */
function completeViewportAutoFill(options: CompleteViewportAutoFillOptions) {
  const targetVisibleCountRef =
    options.options.standardViewportRefillTargetVisibleCountRef;
  const shouldContinueAutoFill = resolveShouldContinueViewportAutoFill(options);

  recordEffectiveListHeight(
    options.options.lastAutoFillListHeightRef,
    options.effectiveListHeight,
  );

  if (!shouldContinueAutoFill) {
    finalizeInactiveViewportAutoFill(
      options.options.isInvertedScroll,
      options.options.isStandardViewportRefillActiveRef,
      targetVisibleCountRef,
    );
    return;
  }

  activateStandardViewportRefill(
    resolveActivateStandardViewportRefillOptions(
      options,
      targetVisibleCountRef,
    ),
  );

  finishViewportAutoFill(
    resolveFinishViewportAutoFillOptions(options, targetVisibleCountRef),
  );
}

/**
 * Continues the active refill by either revealing more local unread articles or
 * requesting another server page.
 * @param options - The unread viewport state that owns the active refill cycle.
 */
function finishViewportAutoFill(options: FinishViewportAutoFillOptions) {
  if (hasReachedStandardViewportRefillTarget(options)) {
    clearStandardViewportRefillState(
      options.isStandardViewportRefillActiveRef,
      options.standardViewportRefillTargetVisibleCountRef,
    );
    return;
  }

  if (
    options.visibleArticleCountRef.current < options.currentFilteredFeedLength
  ) {
    options.expandVisibleWindow(true);
    return;
  }

  if (requestViewportRefillFromServer(options)) {
    return;
  }

  clearStandardViewportRefillState(
    options.isStandardViewportRefillActiveRef,
    options.standardViewportRefillTargetVisibleCountRef,
  );
}

/**
 * Reads the scroll viewport height, guarding against detached or invalid DOM
 * measurement surfaces.
 * @param scrollViewport - The scroll viewport.
 * @returns The current viewport scroll height, or `NaN` when it cannot be measured.
 */
function readViewportScrollHeight(scrollViewport: HTMLElement) {
  try {
    return scrollViewport.scrollHeight;
  } catch {
    return Number.NaN;
  }
}

/**
 * Records the latest list height so later passes can detect unread-window
 * shrink transitions.
 * @param lastAutoFillListHeightRef - Stores the last measured list height.
 * @param lastAutoFillListHeightRef.current
 * @param effectiveListHeight - The most recent measured list height.
 */
function recordEffectiveListHeight(
  lastAutoFillListHeightRef: { current: null | number },
  effectiveListHeight: number,
) {
  if (Number.isFinite(effectiveListHeight)) {
    lastAutoFillListHeightRef.current = effectiveListHeight;
  }
}

/**
 * Returns whether the active refill had to request another server page.
 * @param options - The active refill cycle state.
 * @returns Whether the refill delegated to the server.
 */
function requestViewportRefillFromServer(
  options: FinishViewportAutoFillOptions,
) {
  return (
    !options.isInvertedScroll &&
    !options.hasPendingServerRevealRef.current &&
    !options.hasRequestedServerLoadRef.current &&
    options.requestMoreFromServer({ isViewportRefill: true })
  );
}

/**
 * @param options
 * @param targetVisibleCountRef
 * @param targetVisibleCountRef.current
 */
function resolveActivateStandardViewportRefillOptions(
  options: CompleteViewportAutoFillOptions,
  targetVisibleCountRef?: { current: null | number },
) {
  return {
    articleFilter: options.options.articleFilter,
    articlesPerPage: options.options.articlesPerPage,
    hasListShrunk: options.hasListShrunk,
    hasUserScrolled: options.hasUserScrolled,
    isInvertedScroll: options.options.isInvertedScroll,
    isStandardViewportRefillActiveRef:
      options.options.isStandardViewportRefillActiveRef,
    standardViewportRefillTargetVisibleCountRef: targetVisibleCountRef,
    visibleArticleCountRef: options.options.visibleArticleCountRef,
  } satisfies StandardViewportRefillStateOptions;
}

/**
 * Resolves the effective list height for the current auto-fill pass.
 * @param options - The list-height inputs for the active pass.
 * @returns The committed list height when available, otherwise the live scroll height.
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
 * @param options
 * @param targetVisibleCountRef
 * @param targetVisibleCountRef.current
 */
function resolveFinishViewportAutoFillOptions(
  options: CompleteViewportAutoFillOptions,
  targetVisibleCountRef?: { current: null | number },
) {
  return {
    articleFilter: options.options.articleFilter,
    articlesPerPage: options.options.articlesPerPage,
    currentFilteredFeedLength: options.currentFilteredFeedLength,
    expandVisibleWindow: options.options.expandVisibleWindow,
    hasPendingServerRevealRef: options.options.hasPendingServerRevealRef,
    hasRequestedServerLoadRef: options.options.hasRequestedServerLoadRef,
    isInvertedScroll: options.options.isInvertedScroll,
    isStandardViewportRefillActiveRef:
      options.options.isStandardViewportRefillActiveRef,
    requestMoreFromServer: options.options.requestMoreFromServer,
    standardViewportRefillTargetVisibleCountRef: targetVisibleCountRef,
    visibleArticleCountRef: options.options.visibleArticleCountRef,
  } satisfies FinishViewportAutoFillOptions;
}

/**
 * Returns whether the current viewport still needs more unread articles.
 * @param options - The measured viewport state for the current pass.
 * @returns Whether another auto-fill step should run.
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
 * @param options
 */
function resolveShouldContinueViewportAutoFill(
  options: CompleteViewportAutoFillOptions,
) {
  return resolveShouldContinueAutoFill({
    currentFilteredFeedLength: options.currentFilteredFeedLength,
    currentVisibleCount: options.options.visibleArticleCountRef.current,
    effectiveListHeight: options.effectiveListHeight,
    hasUserScrolled: options.hasUserScrolled,
    isInitialLoading: options.options.isInitialLoading,
    scrollViewport: options.scrollViewport,
    shouldAllowStandardViewportRefill:
      options.shouldAllowStandardViewportRefill,
  });
}

/**
 * Returns whether auto-fill should be skipped entirely for the current pass.
 * @param options - The feed viewport state for the current pass.
 * @param currentFilteredFeedLength - The current unread filtered-feed length.
 * @returns Whether no auto-fill work should run.
 */
function shouldSkipViewportAutoFill(
  options: MaybeAutoFillViewportOptions,
  currentFilteredFeedLength: number,
) {
  return (
    !options.scrollViewport ||
    options.expandedArticleKey !== null ||
    (options.isInvertedScroll &&
      options.hasActiveInvertedExpansionScrollLock()) ||
    options.isInitialLoading ||
    (!options.canLoadMoreFromServer &&
      options.visibleArticleCountRef.current >= currentFilteredFeedLength)
  );
}
