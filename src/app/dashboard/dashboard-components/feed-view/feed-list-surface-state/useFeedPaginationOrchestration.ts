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
 * @param root0
 * @param root0.controllers
 * @param root0.options
 */
export function useFeedPaginationRuntimeActions({
  controllers,
  options,
}: FeedPaginationRuntimeSupportOptions) {
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
 * @param root0
 * @param root0.controllers
 * @param root0.maybeLoadNextPage
 * @param root0.options
 * @param root0.shouldObserveLoadMoreBoundary
 */
export function useFeedPaginationRuntimeBindings({
  controllers,
  maybeLoadNextPage,
  options,
  shouldObserveLoadMoreBoundary,
}: FeedPaginationRuntimeBindingOptions) {
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
 * @param root0
 * @param root0.controllers
 * @param root0.maybeAutoFillViewport
 * @param root0.options
 */
export function useFeedPaginationRuntimeViewportEffects({
  controllers,
  maybeAutoFillViewport,
  options,
}: FeedPaginationRuntimeViewportOptions) {
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
 * @param options
 * @param localState
 * @param serverLoadState
 * @param expandVisibleWindow
 */
function resolveAutoFillViewportOptions(
  options: FeedPaginationRuntimeOptions,
  localState: FeedPaginationControllers["localState"],
  serverLoadState: FeedPaginationControllers["serverLoadState"],
  expandVisibleWindow: ReturnType<typeof useExpandVisibleWindow>,
) {
  return {
    articleFilter: options.articleFilter,
    canLoadMoreFromServer: options.canLoadMoreFromServer,
    expandVisibleWindow,
    filteredFeedLengthRef: localState.filteredFeedLengthRef,
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
    visibleArticleCountRef: localState.visibleArticleCountRef,
  };
}

/**
 * @param options
 * @param localState
 * @param serverLoadState
 * @param anchorState
 * @param expandVisibleWindow
 * @param hasReachedStandardLoadBoundary
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
  return {
    expandVisibleWindow,
    filteredFeedLengthRef: localState.filteredFeedLengthRef,
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
 * @param controllers
 * @param maybeLoadNextPage
 * @param options
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
    rearmPaginationBoundaryFromUserIntent,
    releaseInvertedPaginationAnchor:
      anchorState.releaseInvertedPaginationAnchor,
    scrollViewport: options.scrollViewport,
  });
}

/**
 * @param controllers
 * @param maybeLoadNextPage
 * @param options
 * @param shouldObserveLoadMoreBoundary
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
 * @param controllers
 * @param maybeLoadNextPage
 * @param options
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
    releaseInvertedPaginationAnchor:
      anchorState.releaseInvertedPaginationAnchor,
    scrollViewport: options.scrollViewport,
    shouldLockInitialNormalScroll: options.shouldLockInitialNormalScroll,
    suppressImmediateNormalScrollIntent,
  });
}
