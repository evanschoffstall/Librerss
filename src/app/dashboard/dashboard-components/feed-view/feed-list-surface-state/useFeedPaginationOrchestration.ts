import type {
  FeedPaginationControllers,
  FeedPaginationRuntimeOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationCoordinator";

import {
  useBackfillDepletedRevealedPageEffect,
  useExpandVisibleWindow,
  useHasReachedStandardLoadBoundary,
  useMaybeAutoFillViewport,
  useMaybeLoadNextPage,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationActions";
import {
  useFeedPaginationCleanupEffect,
  useFeedPaginationIntentBindings,
  useFeedPaginationScrollPositionPriming,
  useFeedPaginationSentinelObserver,
  useFeedPaginationViewportScrollBinding,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationEventBindings";
import {
  useInitialFeedPaginationAutoFillEffect,
  useResolvedStandardViewportRevealEffect,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationVisibilityEffects";

interface FeedPaginationRuntimeBindingOptions extends FeedPaginationRuntimeSupportOptions {
  maybeLoadNextPage: ReturnType<typeof useMaybeLoadNextPage>;
  shouldObserveLoadMoreBoundary: boolean;
}

interface FeedPaginationRuntimeSupportOptions {
  controllers: FeedPaginationControllers;
  options: FeedPaginationRuntimeOptions;
}

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
  const { anchorState, localState, serverLoadState } = controllers;

  useBackfillDepletedRevealedPageEffect({
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    canLoadMoreFromServer: options.canLoadMoreFromServer,
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
 * @param localState - The callback that local state.
 * @param serverLoadState - The callback that server load state.
 * @param expandVisibleWindow - The callback that expand visible window.
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
 * @param localState - The callback that local state.
 * @param serverLoadState - The callback that server load state.
 * @param anchorState - The callback that anchor state.
 * @param expandVisibleWindow - The callback that expand visible window.
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
    hasReachedStandardLoadBoundary,
    hasUserScrolledRef: options.hasUserScrolledRef,
    isInvertedLoadBoundaryArmedRef: localState.isInvertedLoadBoundaryArmedRef,
    isInvertedScroll: options.isInvertedScroll,
    isStandardLoadBoundaryArmedRef: localState.isStandardLoadBoundaryArmedRef,
    primeInvertedPaginationAnchor: anchorState.primeInvertedPaginationAnchor,
    requestMoreFromServer: serverLoadState.requestMoreFromServer,
    scrollViewport: options.scrollViewport,
    visibleArticleCountRef: localState.visibleArticleCountRef,
  };
}

/**
 * Manage the feed pagination intent bindings only.
 * @param controllers - The callback that controllers.
 * @param maybeLoadNextPage - The callback that maybe load next page.
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
 * @param controllers - The callback that controllers.
 * @param maybeLoadNextPage - The callback that maybe load next page.
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
 * Manage the feed pagination viewport bindings only.
 * @param controllers - The callback that controllers.
 * @param maybeLoadNextPage - The callback that maybe load next page.
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
