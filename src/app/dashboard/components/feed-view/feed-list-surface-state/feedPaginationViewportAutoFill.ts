import {
  activateStandardViewportRefill,
  clearStandardViewportRefillState,
  finalizeInactiveViewportAutoFill,
  type FinishStandardViewportRefillOptions,
  hasReachedStandardViewportRefillTarget,
  resolveStandardViewportRefillState,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/feedPaginationViewportAutoFillState";
import {
  resolveNextAutoFillVisibleCount,
  shouldAutoFillViewport,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/paginationRules";
import { resolveUnreadRefillThreshold } from "@/app/dashboard/services/article";

/**
 * Describes the options for maybe auto fill viewport.
 */
export interface MaybeAutoFillViewportOptions {
  allowOwnedTargetContinuationWithoutLocalBacklog?: boolean;
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer: boolean;
  expandedArticleKey: null | string;
  /** `immediate=true` skips the skeleton reveal delay used by scroll pagination. */
  expandVisibleWindow: (
    immediate?: boolean,
    nextVisibleCount?: number,
  ) => boolean;
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

/**
 * Describes the options for complete viewport auto fill.
 */
interface CompleteViewportAutoFillOptions {
  currentFilteredFeedLength: number;
  effectiveListHeight: number;
  hasListShrunk: boolean;
  hasUserScrolled: boolean;
  options: MaybeAutoFillViewportOptions;
  scrollViewport: HTMLElement;
  shouldAllowStandardViewportRefill: boolean;
}

/**
 * Describes the options for effective list height.
 */
interface EffectiveListHeightOptions {
  committedListHeight?: number;
  scrollViewport: HTMLElement;
}

/**
 * Describes the options for finish viewport auto fill.
 */
interface FinishViewportAutoFillOptions extends FinishStandardViewportRefillOptions {
  allowOwnedTargetContinuationWithoutLocalBacklog?: boolean;
  articleFilter: string;
  articlesPerPage: number;
  currentFilteredFeedLength: number;
  expandVisibleWindow: (
    immediate?: boolean,
    nextVisibleCount?: number,
  ) => boolean;
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  requestMoreFromServer: (options?: { isViewportRefill?: boolean }) => boolean;
}

/**
 * Describes the nullable number ref.
 */
interface NullableNumberRef {
  current: null | number;
}

/**
 * Describes the options for resolve activate standard viewport refill.
 */
interface ResolveActivateStandardViewportRefillOptions {
  options: CompleteViewportAutoFillOptions;
  targetVisibleCountRef?: NullableNumberRef;
}

/**
 * Describes the options for resolve finish viewport auto fill.
 */
interface ResolveFinishViewportAutoFillOptions {
  options: CompleteViewportAutoFillOptions;
  targetVisibleCountRef?: NullableNumberRef;
}

/**
 * Describes the options for should continue auto fill.
 */
interface ShouldContinueAutoFillOptions {
  activeViewportRefillTargetVisibleCount: null | number;
  allowOwnedTargetContinuationWithoutLocalBacklog?: boolean;
  articleFilter: string;
  articlesPerPage: number;
  currentFilteredFeedLength: number;
  currentVisibleCount: number;
  effectiveListHeight: number;
  hasListShrunk: boolean;
  hasUserScrolled: boolean;
  isInitialLoading: boolean;
  isInvertedScroll: boolean;
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
    if (shouldPreserveViewportRefillOwnership(options.options)) {
      return;
    }

    finalizeInactiveViewportAutoFill(
      options.options.isInvertedScroll,
      options.options.isStandardViewportRefillActiveRef,
      targetVisibleCountRef,
    );
    return;
  }

  activateStandardViewportRefill(
    resolveActivateStandardViewportRefillOptions({
      options,
      targetVisibleCountRef,
    }),
  );

  finishViewportAutoFill(
    resolveFinishViewportAutoFillOptions({
      options,
      targetVisibleCountRef,
    }),
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
    const projectedVisibleCount = resolveNextAutoFillVisibleCount({
      currentVisibleCount: options.visibleArticleCountRef.current,
      filteredFeedLength: options.currentFilteredFeedLength,
    });

    options.expandVisibleWindow(true, projectedVisibleCount);

    if (
      shouldRequestAnotherViewportRefillPage(options, projectedVisibleCount)
    ) {
      requestViewportRefillFromServer(options);
    }

    return;
  }

  if (
    shouldRequestAnotherViewportRefillPage(options) &&
    requestViewportRefillFromServer(options)
  ) {
    return;
  }

  if (
    shouldRequestAnotherViewportRefillPage(options) &&
    (options.hasPendingServerRevealRef.current ||
      options.hasRequestedServerLoadRef.current)
  ) {
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
 * Records the latest measured list height so later passes can detect when the
 * unread window has materially shrunk.
 * @param lastAutoFillListHeightRef - Stores the last measured list height for the active viewport.
 * @param effectiveListHeight - The latest measured list height for the active auto-fill pass.
 */
function recordEffectiveListHeight(
  lastAutoFillListHeightRef: NullableNumberRef,
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
 * Builds the activation options for a desktop viewport-refill cycle.
 * @param options - The measured viewport auto-fill state for the current pass.
 * @param targetVisibleCountRef - Stores the visible-count target owned by the refill cycle.
 * @returns The normalized activation options consumed by the refill-state helper.
 */
function resolveActivateStandardViewportRefillOptions(
  options: ResolveActivateStandardViewportRefillOptions,
) {
  return {
    articleFilter: options.options.options.articleFilter,
    articlesPerPage: options.options.options.articlesPerPage,
    hasListShrunk: options.options.hasListShrunk,
    hasUserScrolled: options.options.hasUserScrolled,
    isInvertedScroll: options.options.options.isInvertedScroll,
    isStandardViewportRefillActiveRef:
      options.options.options.isStandardViewportRefillActiveRef,
    standardViewportRefillTargetVisibleCountRef: options.targetVisibleCountRef,
    visibleArticleCountRef: options.options.options.visibleArticleCountRef,
  } satisfies Parameters<typeof activateStandardViewportRefill>[0];
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
 * Builds the continuation options for an active viewport auto-fill cycle.
 * @param options - The measured viewport auto-fill state for the current pass.
 * @param targetVisibleCountRef - Stores the visible-count target owned by the refill cycle.
 * @returns The normalized finish options consumed by the refill continuation step.
 */
function resolveFinishViewportAutoFillOptions(
  options: ResolveFinishViewportAutoFillOptions,
) {
  return {
    allowOwnedTargetContinuationWithoutLocalBacklog:
      options.options.options.allowOwnedTargetContinuationWithoutLocalBacklog,
    articleFilter: options.options.options.articleFilter,
    articlesPerPage: options.options.options.articlesPerPage,
    currentFilteredFeedLength: options.options.currentFilteredFeedLength,
    expandVisibleWindow: options.options.options.expandVisibleWindow,
    hasPendingServerRevealRef:
      options.options.options.hasPendingServerRevealRef,
    hasRequestedServerLoadRef:
      options.options.options.hasRequestedServerLoadRef,
    isInvertedScroll: options.options.options.isInvertedScroll,
    isStandardViewportRefillActiveRef:
      options.options.options.isStandardViewportRefillActiveRef,
    requestMoreFromServer: options.options.options.requestMoreFromServer,
    standardViewportRefillTargetVisibleCountRef: options.targetVisibleCountRef,
    visibleArticleCountRef: options.options.options.visibleArticleCountRef,
  } satisfies FinishViewportAutoFillOptions;
}

/**
 * Returns whether the current viewport still needs more unread articles.
 * @param options - The measured viewport state for the current pass.
 * @returns Whether another auto-fill step should run.
 */
function resolveShouldContinueAutoFill(options: ShouldContinueAutoFillOptions) {
  const shouldContinueOwnedRefillWithoutLocalBacklog =
    options.articleFilter === "unread" &&
    options.activeViewportRefillTargetVisibleCount !== null &&
    (options.currentFilteredFeedLength <
      resolveUnreadRefillThreshold(options.articlesPerPage) ||
      (options.allowOwnedTargetContinuationWithoutLocalBacklog &&
        options.currentFilteredFeedLength <
          options.activeViewportRefillTargetVisibleCount));

  return shouldAutoFillViewport({
    activeViewportRefillTargetVisibleCount:
      options.activeViewportRefillTargetVisibleCount,
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    clientHeight: options.scrollViewport.clientHeight,
    committedListHeight: options.effectiveListHeight,
    currentVisibleCount: options.currentVisibleCount,
    filteredFeedLength: options.currentFilteredFeedLength,
    hasListShrunk: options.hasListShrunk,
    hasUserScrolled:
      options.hasUserScrolled && !options.shouldAllowStandardViewportRefill,
    isInitialLoading: options.isInitialLoading,
    isInvertedScroll: options.isInvertedScroll,
    shouldContinueOwnedRefillWithoutLocalBacklog,
  });
}

/**
 * Adapts the current viewport state into the smaller shape used by the generic
 * auto-fill continuation rule.
 * @param options - The measured viewport auto-fill state for the current pass.
 * @returns Whether the current viewport still needs more visible articles.
 */
function resolveShouldContinueViewportAutoFill(
  options: CompleteViewportAutoFillOptions,
) {
  return resolveShouldContinueAutoFill({
    activeViewportRefillTargetVisibleCount:
      options.shouldAllowStandardViewportRefill
        ? (options.options.standardViewportRefillTargetVisibleCountRef
            ?.current ?? null)
        : null,
    allowOwnedTargetContinuationWithoutLocalBacklog:
      options.options.allowOwnedTargetContinuationWithoutLocalBacklog,
    articleFilter: options.options.articleFilter,
    articlesPerPage: options.options.articlesPerPage,
    currentFilteredFeedLength: options.currentFilteredFeedLength,
    currentVisibleCount: options.options.visibleArticleCountRef.current,
    effectiveListHeight: options.effectiveListHeight,
    hasListShrunk: options.hasListShrunk,
    hasUserScrolled: options.hasUserScrolled,
    isInitialLoading: options.options.isInitialLoading,
    isInvertedScroll: options.options.isInvertedScroll,
    scrollViewport: options.scrollViewport,
    shouldAllowStandardViewportRefill:
      options.shouldAllowStandardViewportRefill,
  });
}

/**
 * Return whether an active standard viewport refill must keep its ownership
 * while a server-backed refill response is still pending.
 * @param options - The current viewport auto-fill options.
 * @returns Whether the active refill should remain armed.
 */
function shouldPreserveViewportRefillOwnership(
  options: MaybeAutoFillViewportOptions,
) {
  return (
    !options.isInvertedScroll &&
    options.isStandardViewportRefillActiveRef.current &&
    (options.hasPendingServerRevealRef.current ||
      options.hasRequestedServerLoadRef.current)
  );
}

/**
 * Return whether the current desktop unread refill must queue another single
 * server page because the local unread backlog still cannot satisfy the owned
 * visible-count target after the immediate local expansion.
 * @param options - The active refill cycle state.
 * @param currentVisibleCount - The visible-count candidate to evaluate against
 *   the active owned refill target.
 * @returns Whether another single server refill page should be requested now.
 */
function shouldRequestAnotherViewportRefillPage(
  options: FinishViewportAutoFillOptions,
  currentVisibleCount = options.visibleArticleCountRef.current,
) {
  if (
    options.articleFilter !== "unread" ||
    !options.isStandardViewportRefillActiveRef.current
  ) {
    return false;
  }

  const activeViewportRefillTargetVisibleCount =
    options.standardViewportRefillTargetVisibleCountRef?.current ??
    currentVisibleCount + options.articlesPerPage;

  if (
    options.allowOwnedTargetContinuationWithoutLocalBacklog &&
    currentVisibleCount >= options.currentFilteredFeedLength
  ) {
    return (
      options.currentFilteredFeedLength < activeViewportRefillTargetVisibleCount
    );
  }

  return (
    options.currentFilteredFeedLength <
    resolveUnreadRefillThreshold(options.articlesPerPage)
  );
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
