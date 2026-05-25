import { useEffect } from "react";

import type {
  FeedPaginationControllers,
  FeedPaginationRuntimeOptions,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationCoordinator";

import {
  useBackfillDepletedRevealedPageEffect,
  useExpandVisibleWindow,
  useHasReachedStandardLoadBoundary,
  useMaybeAutoFillViewport,
  useMaybeLoadNextPage,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationActions";
import {
  useFeedPaginationCleanupEffect,
  useFeedPaginationIntentBindings,
  useFeedPaginationScrollPositionPriming,
  useFeedPaginationSentinelObserver,
  useFeedPaginationViewportScrollBinding,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationEventBindings";
import {
  useInitialFeedPaginationAutoFillEffect,
  useResolvedStandardViewportRevealEffect,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationVisibilityEffects";

/**
 * Describes the options for feed pagination auto fill after cooldown effect.
 */
interface FeedPaginationAutoFillAfterCooldownEffectOptions {
  isInvertedScroll: boolean;
  maybeAutoFillViewport: ReturnType<typeof useMaybeAutoFillViewport>;
  serverLoadCooldownEpoch: number;
}

/**
 * Describes the options for feed pagination runtime binding.
 */
interface FeedPaginationRuntimeBindingOptions extends FeedPaginationRuntimeSupportOptions {
  maybeLoadNextPage: ReturnType<typeof useMaybeLoadNextPage>;
  shouldObserveLoadMoreBoundary: boolean;
}

/**
 * Describes the options for feed pagination runtime support.
 */
interface FeedPaginationRuntimeSupportOptions {
  controllers: FeedPaginationControllers;
  options: FeedPaginationRuntimeOptions;
}

/**
 * Describes the options for feed pagination runtime viewport.
 */
interface FeedPaginationRuntimeViewportOptions extends FeedPaginationRuntimeSupportOptions {
  maybeAutoFillViewport: ReturnType<typeof useMaybeAutoFillViewport>;
}

/**
 * Manage the feed pagination runtime actions.
 * @param runtimeSupportOptions - Runtime controllers and feed options used to create pagination actions.
 * @returns The feed pagination runtime actions state and callbacks.
 */
export function useFeedPaginationRuntimeActions(
  runtimeSupportOptions: FeedPaginationRuntimeSupportOptions,
) {
  const { controllers, options } = runtimeSupportOptions;
  const { anchorState, localState, serverLoadState } = controllers;

  const expandVisibleWindow = useExpandVisibleWindow({
    articlesPerPage: options.articlesPerPage,
    commitVisibleArticleCount: localState.commitVisibleArticleCount,
    filteredFeedLengthRef: localState.filteredFeedLengthRef,
    scheduleCachedPageReveal: localState.scheduleCachedPageReveal,
    visibleArticleCountRef: localState.visibleArticleCountRef,
  });
  const hasReachedStandardLoadBoundary = useHasReachedStandardLoadBoundary({
    isInvertedScroll: options.isInvertedScroll,
    scrollViewport: options.scrollViewport,
  });

  return {
    maybeAutoFillViewport: useMaybeAutoFillViewport(
      resolveAutoFillViewportOptions(
        options,
        localState,
        serverLoadState,
        expandVisibleWindow,
      ),
    ),
    maybeLoadNextPage: useMaybeLoadNextPage(
      resolveMaybeLoadNextPageOptions(
        options,
        localState,
        serverLoadState,
        anchorState,
        expandVisibleWindow,
        hasReachedStandardLoadBoundary,
      ),
    ),
  };
}

/**
 * Manage the feed pagination runtime bindings.
 * @param runtimeBindingOptions - Runtime binding inputs used to connect observers and intent handlers.
 */
export function useFeedPaginationRuntimeBindings(
  runtimeBindingOptions: FeedPaginationRuntimeBindingOptions,
) {
  const {
    controllers,
    maybeLoadNextPage,
    options,
    shouldObserveLoadMoreBoundary,
  } = runtimeBindingOptions;
  useFeedPaginationIntentBindingsOnly(controllers, maybeLoadNextPage, options);
  useFeedPaginationViewportBindingsOnly(
    controllers,
    maybeLoadNextPage,
    options,
  );
  useFeedPaginationObserverAndCleanupBindings(
    controllers,
    maybeLoadNextPage,
    options,
    shouldObserveLoadMoreBoundary,
  );
}

/**
 * Manage the feed pagination runtime viewport effects.
 * @param runtimeViewportOptions - Runtime viewport inputs used to coordinate auto-fill and observer state.
 * @returns The feed pagination runtime viewport effects state and callbacks.
 */
export function useFeedPaginationRuntimeViewportEffects(
  runtimeViewportOptions: FeedPaginationRuntimeViewportOptions,
) {
  const { controllers, maybeAutoFillViewport, options } =
    runtimeViewportOptions;
  const { anchorState, localState } = controllers;

  useFeedPaginationServerRevealLifecycleEffects({
    controllers,
    maybeAutoFillViewport,
    options,
  });

  const shouldUseVirtualizedFeed =
    !options.isInitialLoading && options.scrollViewport !== null;
  const shouldObserveLoadMoreBoundary =
    options.canLoadMoreFromServer ||
    localState.visibleArticleCount < options.filteredFeedLength;

  useInitialFeedPaginationAutoFillEffect({
    filteredFeedLength: options.filteredFeedLength,
    isInitialLoading: options.isInitialLoading,
    maybeAutoFillViewport,
    scrollViewport: options.scrollViewport,
    shouldUseVirtualizedFeed,
    suppressNextInitialViewportAutoFillRef:
      localState.suppressNextInitialViewportAutoFillRef,
    visibleArticleCount: localState.visibleArticleCount,
  });
  useFeedPaginationScrollPositionPriming({
    isInvertedScroll: options.isInvertedScroll,
    lastInvertedScrollTopRef: anchorState.lastInvertedScrollTopRef,
    lastStandardScrollTopRef: localState.lastStandardScrollTopRef,
    scrollViewport: options.scrollViewport,
  });

  return { shouldObserveLoadMoreBoundary, shouldUseVirtualizedFeed };
}

/**
 * Resolve the auto fill viewport options.
 * @param options - The options used to resolve the auto fill viewport options.
 * @param localState - Local pagination state returned by useFeedPaginationLocalState.
 * @param serverLoadState - Server-load pagination state returned by useFeedPaginationServerLoad.
 * @param expandVisibleWindow - Callback that expands the visible article window by one page increment.
 * @returns The auto fill viewport options.
 */
function resolveAutoFillViewportOptions(
  options: FeedPaginationRuntimeOptions,
  localState: FeedPaginationControllers["localState"],
  serverLoadState: FeedPaginationControllers["serverLoadState"],
  expandVisibleWindow: ReturnType<typeof useExpandVisibleWindow>,
) {
  return {
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    canLoadMoreFromServer: options.canLoadMoreFromServer,
    expandedArticleKey: options.expandedArticleKey,
    expandVisibleWindow,
    filteredFeedLengthRef: localState.filteredFeedLengthRef,
    hasActiveInvertedExpansionScrollLock:
      options.hasActiveInvertedExpansionScrollLock,
    hasPendingServerRevealRef: serverLoadState.hasPendingServerRevealRef,
    hasRequestedServerLoadRef: serverLoadState.hasRequestedServerLoadRef,
    hasUserScrolledRef: options.hasUserScrolledRef,
    isInitialLoading: options.isInitialLoading,
    isInvertedScroll: options.isInvertedScroll,
    isStandardViewportRefillActiveRef:
      serverLoadState.isStandardViewportRefillActiveRef,
    lastAutoFillListHeightRef: localState.lastAutoFillListHeightRef,
    requestMoreFromServer: serverLoadState.requestMoreFromServer,
    scrollViewport: options.scrollViewport,
    standardViewportRefillTargetVisibleCountRef:
      localState.standardViewportRefillTargetVisibleCountRef,
    visibleArticleCountRef: localState.visibleArticleCountRef,
  };
}

/**
 * Resolve the maybe load next page options.
 * @param options - The options used to resolve the maybe load next page options.
 * @param localState - Local pagination state returned by useFeedPaginationLocalState.
 * @param serverLoadState - Server-load pagination state returned by useFeedPaginationServerLoad.
 * @param anchorState - Inverted pagination anchor state returned by useInvertedPaginationAnchor.
 * @param expandVisibleWindow - Callback that expands the visible article window by one page increment.
 * @param hasReachedStandardLoadBoundary - Whether has reached standard load boundary.
 * @returns The maybe load next page options.
 */
function resolveMaybeLoadNextPageOptions(
  options: FeedPaginationRuntimeOptions,
  localState: FeedPaginationControllers["localState"],
  serverLoadState: FeedPaginationControllers["serverLoadState"],
  anchorState: FeedPaginationControllers["anchorState"],
  expandVisibleWindow: ReturnType<typeof useExpandVisibleWindow>,
  hasReachedStandardLoadBoundary: ReturnType<
    typeof useHasReachedStandardLoadBoundary
  >,
) {
  const expandedArticleKey: null | string = options.expandedArticleKey ?? null;

  return {
    expandedArticleKey,
    expandVisibleWindow,
    filteredFeedLengthRef: localState.filteredFeedLengthRef,
    hasActiveInvertedExpansionScrollLock:
      options.hasActiveInvertedExpansionScrollLock,
    hasCollapsingArticlesRef: localState.hasCollapsingArticlesRef,
    hasCompletedInvertedServerRevealRef:
      serverLoadState.hasCompletedInvertedServerRevealRef,
    hasReachedStandardLoadBoundary,
    hasUserScrolledRef: options.hasUserScrolledRef,
    isInvertedLoadBoundaryArmedRef: localState.isInvertedLoadBoundaryArmedRef,
    isInvertedScroll: options.isInvertedScroll,
    isStandardLoadBoundaryArmedRef: localState.isStandardLoadBoundaryArmedRef,
    lastInvertedScrollTopRef: anchorState.lastInvertedScrollTopRef,
    primeInvertedPaginationAnchor: anchorState.primeInvertedPaginationAnchor,
    requestMoreFromServer: serverLoadState.requestMoreFromServer,
    scrollViewport: options.scrollViewport,
    visibleArticleCountRef: localState.visibleArticleCountRef,
  };
}

/**
 * Re-trigger viewport auto-fill once the server-load rearm cooldown elapses.
 *
 * After every successful server reveal the pagination layer enters a cooldown
 * window that gates the next request. Once the cooldown timer fires the local
 * window may still be underfilled (e.g., after mark-as-read trims the unread
 * set), so this hook schedules one auto-fill pass on the next animation frame
 * to give the standard viewport refill a chance to expand or, if the local set
 * is exhausted but the viewport is still not scrollable, request the next page
 * from the server. The effect is a no-op until the first cooldown completes
 * (`serverLoadCooldownEpoch === 0`) and is skipped entirely for inverted
 * scroll surfaces, which use a separate top-edge reveal mechanism.
 *
 * @param options - The cooldown epoch, scroll-mode flag, and auto-fill callback.
 */
function useFeedPaginationAutoFillAfterCooldownEffect(
  options: FeedPaginationAutoFillAfterCooldownEffectOptions,
) {
  const { isInvertedScroll, maybeAutoFillViewport, serverLoadCooldownEpoch } =
    options;
  useEffect(() => {
    if (serverLoadCooldownEpoch === 0 || isInvertedScroll) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      maybeAutoFillViewport(undefined, true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isInvertedScroll, maybeAutoFillViewport, serverLoadCooldownEpoch]);
}

/**
 * Manage the feed pagination intent bindings only.
 * @param controllers - Grouped pagination controllers for the current feed view.
 * @param maybeLoadNextPage - Callback that requests the next page when the load boundary is reached.
 * @param options - The options used to manage the feed pagination intent bindings only.
 */
function useFeedPaginationIntentBindingsOnly(
  controllers: FeedPaginationControllers,
  maybeLoadNextPage: ReturnType<typeof useMaybeLoadNextPage>,
  options: FeedPaginationRuntimeOptions,
) {
  const {
    anchorState,
    localState,
    rearmPaginationBoundaryFromUserIntent,
    serverLoadState,
  } = controllers;

  useFeedPaginationIntentBindings({
    capturePendingInvertedPaginationAnchorSnapshot:
      anchorState.capturePendingInvertedPaginationAnchorSnapshot,
    clearInitialNormalScrollLock: options.clearInitialNormalScrollLock,
    hasActiveInvertedExpansionScrollLock:
      options.hasActiveInvertedExpansionScrollLock,
    hasRequestedServerLoadRef: serverLoadState.hasRequestedServerLoadRef,
    hasUserScrolledRef: options.hasUserScrolledRef,
    isInvertedLoadBoundaryArmedRef: localState.isInvertedLoadBoundaryArmedRef,
    isInvertedScroll: options.isInvertedScroll,
    maybeLoadNextPage,
    onClaimInvertedScrollOwnership: options.onClaimInvertedScrollOwnership,
    onReleaseInvertedExpansionScrollLock:
      options.onReleaseInvertedExpansionScrollLock,
    paginationFrameRef: localState.paginationFrameRef,
    pendingInvertedPaginationAnchorSnapshotRef:
      anchorState.pendingInvertedPaginationAnchorSnapshotRef,
    preservePendingInvertedPaginationAnchorSnapshotRef:
      anchorState.preservePendingInvertedPaginationAnchorSnapshotRef,
    rearmPaginationBoundaryFromUserIntent,
    releaseInvertedPaginationAnchor:
      anchorState.releaseInvertedPaginationAnchor,
    scrollViewport: options.scrollViewport,
  });
}

/**
 * Manage the feed pagination observer and cleanup bindings.
 * @param controllers - Grouped pagination controllers for the current feed view.
 * @param maybeLoadNextPage - Callback that requests the next page when the load boundary is reached.
 * @param options - The options used to manage the feed pagination observer and cleanup bindings.
 * @param shouldObserveLoadMoreBoundary - Whether should observe load more boundary.
 */
function useFeedPaginationObserverAndCleanupBindings(
  controllers: FeedPaginationControllers,
  maybeLoadNextPage: ReturnType<typeof useMaybeLoadNextPage>,
  options: FeedPaginationRuntimeOptions,
  shouldObserveLoadMoreBoundary: boolean,
) {
  const {
    anchorState,
    localState,
    serverLoadState,
    suppressImmediateNormalScrollIntent,
  } = controllers;

  useFeedPaginationSentinelObserver({
    clearInitialNormalScrollLock: options.clearInitialNormalScrollLock,
    hasUserScrolledRef: options.hasUserScrolledRef,
    isInvertedScroll: options.isInvertedScroll,
    maybeLoadNextPage,
    normalScrollIntentSuppressionFrameRef:
      localState.normalScrollIntentSuppressionFrameRef,
    paginationFrameRef: localState.paginationFrameRef,
    scrollViewport: options.scrollViewport,
    shouldLockInitialNormalScroll: options.shouldLockInitialNormalScroll,
    shouldObserveLoadMoreBoundary,
    suppressImmediateNormalScrollIntent,
  });
  useFeedPaginationCleanupEffect({
    clearServerLoadCooldown: serverLoadState.clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef:
      serverLoadState.hasPendingBoundaryRearmAfterCooldownRef,
    invertedPaginationAnchorFrameRef:
      anchorState.invertedPaginationAnchorFrameRef,
    normalScrollIntentSuppressionFrameRef:
      localState.normalScrollIntentSuppressionFrameRef,
    paginationFrameRef: localState.paginationFrameRef,
  });
}

/**
 * Wire the three server-reveal lifecycle effects (revealed-page backfill,
 * resolved standard reveal auto-fill, and post-cooldown auto-fill re-trigger)
 * onto the runtime viewport hook.
 *
 * Extracted from `useFeedPaginationRuntimeViewportEffects` so that hook stays
 * under the lizard token threshold while keeping each effect's invocation
 * site adjacent to the others it cooperates with.
 *
 * @param params - The runtime viewport inputs and shared callbacks.
 */
function useFeedPaginationServerRevealLifecycleEffects(
  params: FeedPaginationRuntimeViewportOptions,
) {
  const { controllers, maybeAutoFillViewport, options } = params;
  const { anchorState, localState, serverLoadState } = controllers;
  useBackfillDepletedRevealedPageEffect({
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    canLoadMoreFromServer: options.canLoadMoreFromServer,
    feedViewKey: options.feedViewKey,
    filteredFeedLength: options.filteredFeedLength,
    hasPendingServerRevealRef: serverLoadState.hasPendingServerRevealRef,
    hasRequestedServerLoadRef: serverLoadState.hasRequestedServerLoadRef,
    isInvertedScroll: options.isInvertedScroll,
    primeInvertedPaginationAnchor: anchorState.primeInvertedPaginationAnchor,
    requestMoreFromServer: serverLoadState.requestMoreFromServer,
    visibleArticleCountRef: localState.visibleArticleCountRef,
  });
  useResolvedStandardViewportRevealEffect({
    filteredFeedLength: options.filteredFeedLength,
    hasResolvedStandardViewportRevealRef:
      serverLoadState.hasResolvedStandardViewportRevealRef,
    isInvertedScroll: options.isInvertedScroll,
    maybeAutoFillViewport,
  });
  useFeedPaginationAutoFillAfterCooldownEffect({
    isInvertedScroll: options.isInvertedScroll,
    maybeAutoFillViewport,
    serverLoadCooldownEpoch: serverLoadState.serverLoadCooldownEpoch,
  });
}

/**
 * Manage the feed pagination viewport bindings only.
 * @param controllers - Grouped pagination controllers for the current feed view.
 * @param maybeLoadNextPage - Callback that requests the next page when the load boundary is reached.
 * @param options - The options used to manage the feed pagination viewport bindings only.
 */
function useFeedPaginationViewportBindingsOnly(
  controllers: FeedPaginationControllers,
  maybeLoadNextPage: ReturnType<typeof useMaybeLoadNextPage>,
  options: FeedPaginationRuntimeOptions,
) {
  const {
    anchorState,
    localState,
    serverLoadState,
    suppressImmediateNormalScrollIntent,
  } = controllers;

  useFeedPaginationViewportScrollBinding({
    capturePendingInvertedPaginationAnchorSnapshot:
      anchorState.capturePendingInvertedPaginationAnchorSnapshot,
    clearInitialNormalScrollLock: options.clearInitialNormalScrollLock,
    hasActiveInvertedExpansionScrollLock:
      options.hasActiveInvertedExpansionScrollLock,
    hasPendingBoundaryRearmAfterCooldownRef:
      serverLoadState.hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef: serverLoadState.hasPendingServerRevealRef,
    hasRequestedServerLoadRef: serverLoadState.hasRequestedServerLoadRef,
    hasUserScrolledRef: options.hasUserScrolledRef,
    invertedPaginationAnchorRef: anchorState.invertedPaginationAnchorRef,
    isInvertedLoadBoundaryArmedRef: localState.isInvertedLoadBoundaryArmedRef,
    isInvertedScroll: options.isInvertedScroll,
    isStandardLoadBoundaryArmedRef: localState.isStandardLoadBoundaryArmedRef,
    lastInvertedScrollTopRef: anchorState.lastInvertedScrollTopRef,
    lastStandardScrollTopRef: localState.lastStandardScrollTopRef,
    maybeLoadNextPage,
    normalScrollIntentSuppressionFrameRef:
      localState.normalScrollIntentSuppressionFrameRef,
    onClaimInvertedScrollOwnership: options.onClaimInvertedScrollOwnership,
    onSyncInvertedExpansionScrollLock:
      options.onSyncInvertedExpansionScrollLock,
    pendingInvertedPaginationAnchorSnapshotRef:
      anchorState.pendingInvertedPaginationAnchorSnapshotRef,
    preservePendingInvertedPaginationAnchorSnapshotRef:
      anchorState.preservePendingInvertedPaginationAnchorSnapshotRef,
    releaseInvertedPaginationAnchor:
      anchorState.releaseInvertedPaginationAnchor,
    scrollViewport: options.scrollViewport,
    shouldLockInitialNormalScroll: options.shouldLockInitialNormalScroll,
    suppressImmediateNormalScrollIntent,
  });
}
