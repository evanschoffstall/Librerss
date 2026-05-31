import { useCallback } from "react";

import { useResetPaginationState } from "@/app/dashboard/components/feed-view/feed-list-surface-state/feedPaginationResetState";
import { useCachedRevealCompletionEffect } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useCachedRevealCompletionEffect";
import { useFeedPaginationLocalState } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationLocalState";
import {
  useFeedPaginationRuntimeActions,
  useFeedPaginationRuntimeBindings,
  useFeedPaginationRuntimeViewportEffects,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationOrchestration";
import { useFeedPaginationServerLoad } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationServerLoad";
import {
  useCollapsingArticlesRefSync,
  useFeedPaginationLoadingMoreRevealEffect,
  useFeedPaginationQueryResetEffect,
  useFeedPaginationRefreshResetEffect,
  useFeedPaginationRevealCountEffect,
  useFeedPaginationStaleResumeResetEffect,
  useMountedFlagCleanupEffect,
  useRearmPaginationBoundaryFromUserIntent,
  useVisibleArticleCountRefSync,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationVisibilityEffects";
import { useInvertedPaginationAnchor } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useInvertedPaginationAnchor";

/**
 * Describes the options for feed pagination controller.
 */
export interface FeedPaginationControllerOptions {
  articlesPerPage: number;
  canLoadMoreFromServer: boolean;
  expandedArticleKey: null | string;
  filteredFeedLength: number;
  hasCollapsingArticles: boolean;
  hasUserScrolledRef: { current: boolean };
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  maybeLoadNextPageRef: {
    current: ((_trigger: "scroll" | "sentinel") => void) | null;
  };
  onLoadMore?: () => void;
  onResetInvertedScrollOwnership: () => void;
  refreshEpoch: number;
  scrollViewport: HTMLElement | null;
}

/**
 * Defines the feed pagination controllers type.
 */
export type FeedPaginationControllers = ReturnType<
  typeof useFeedPaginationControllers
>;

/**
 * Describes the options for feed pagination effects.
 */
export interface FeedPaginationEffectsOptions extends FeedPaginationControllerOptions {
  articleFilter: string;
  controllers: ReturnType<typeof useFeedPaginationControllers>;
  feedViewKey: string;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  searchTerm: string;
}

/**
 * Describes the options for feed pagination runtime.
 */
export interface FeedPaginationRuntimeOptions extends FeedPaginationEffectsOptions {
  clearInitialNormalScrollLock: () => void;
  hasActiveInvertedExpansionScrollLock: () => boolean;
  maybeLoadNextPageRef: {
    current: ((_trigger: "scroll" | "sentinel") => void) | null;
  };
  onClaimInvertedScrollOwnership: () => void;
  onReleaseInvertedExpansionScrollLock: () => void;
  onSyncInvertedExpansionScrollLock: () => void;
  shouldLockInitialNormalScroll: () => boolean;
}

/**
 * Manage the feed pagination controllers.
 * @param options - The options used to manage the feed pagination controllers.
 * @returns The feed pagination controllers state and callbacks.
 */
export function useFeedPaginationControllers(
  options: FeedPaginationControllerOptions,
) {
  const localState = useFeedPaginationLocalState({
    articlesPerPage: options.articlesPerPage,
    filteredFeedLength: options.filteredFeedLength,
    hasCollapsingArticles: options.hasCollapsingArticles,
    isLoadingMore: options.isLoadingMore,
    isRefreshing: options.isRefreshing,
    refreshEpoch: options.refreshEpoch,
  });
  const serverLoadState = useFeedPaginationServerLoad({
    canLoadMoreFromServer: options.canLoadMoreFromServer,
    isInvertedLoadBoundaryArmedRef: localState.isInvertedLoadBoundaryArmedRef,
    isInvertedScroll: options.isInvertedScroll,
    isStandardLoadBoundaryArmedRef: localState.isStandardLoadBoundaryArmedRef,
    maybeLoadNextPageRef: options.maybeLoadNextPageRef,
    onLoadMore: options.onLoadMore,
    paginationFrameRef: localState.paginationFrameRef,
  });
  const anchorState = useInvertedPaginationAnchor({
    hasRequestedServerLoadRef: serverLoadState.hasRequestedServerLoadRef,
    isInvertedLoadBoundaryArmedRef: localState.isInvertedLoadBoundaryArmedRef,
    isInvertedScroll: options.isInvertedScroll,
    scrollViewport: options.scrollViewport,
  });
  const resetPaginationState = useFeedPaginationResetControllers(
    options,
    localState,
    serverLoadState,
    anchorState,
  );
  const {
    rearmPaginationBoundaryFromUserIntent,
    suppressImmediateNormalScrollIntent,
  } = useFeedPaginationBoundaryControllers(
    options,
    localState,
    serverLoadState,
    anchorState,
  );

  return {
    anchorState,
    localState,
    rearmPaginationBoundaryFromUserIntent,
    resetPaginationState,
    serverLoadState,
    suppressImmediateNormalScrollIntent,
  };
}

/**
 * Manage the feed pagination effects.
 * @param options - The options used to manage the feed pagination effects.
 */
export function useFeedPaginationEffects(
  options: FeedPaginationEffectsOptions,
) {
  const { anchorState, localState, resetPaginationState, serverLoadState } =
    options.controllers;

  useCollapsingArticlesRefSync({
    hasCollapsingArticles: options.hasCollapsingArticles,
    hasCollapsingArticlesRef: localState.hasCollapsingArticlesRef,
  });
  localState.filteredFeedLengthRef.current = options.filteredFeedLength;

  useMountedFlagCleanupEffect({ isMountedRef: localState.isMountedRef });
  useFeedPaginationQueryResetEffect({
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    feedViewKey: options.feedViewKey,
    isInvertedScroll: options.isInvertedScroll,
    resetPaginationState,
    searchTerm: options.searchTerm,
    suppressNextInitialViewportAutoFillRef:
      localState.suppressNextInitialViewportAutoFillRef,
    suppressNextRefreshViewportRefillRef:
      localState.suppressNextRefreshViewportRefillRef,
  });
  useFeedPaginationRefreshResetEffect({
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    expandedArticleKey: options.expandedArticleKey,
    hasUserScrolledRef: options.hasUserScrolledRef,
    isInvertedScroll: options.isInvertedScroll,
    isLoadingMore: options.isLoadingMore,
    isRefreshing: options.isRefreshing,
    isStandardViewportRefillActiveRef:
      serverLoadState.isStandardViewportRefillActiveRef,
    previousRefreshEpochRef: localState.previousRefreshEpochRef,
    refreshEpoch: options.refreshEpoch,
    resetPaginationState,
    standardViewportRefillTargetVisibleCountRef:
      localState.standardViewportRefillTargetVisibleCountRef,
    suppressNextRefreshViewportRefillRef:
      localState.suppressNextRefreshViewportRefillRef,
  });
  useFeedPaginationStaleResumeResetEffect({
    expandedArticleKey: options.expandedArticleKey,
    isInvertedScroll: options.isInvertedScroll,
    resetPaginationState,
    scrollViewport: options.scrollViewport,
  });
  useFeedPaginationRevealEffects(
    options,
    anchorState,
    localState,
    serverLoadState,
  );
}

/**
 * Manage the feed pagination runtime.
 * @param options - The options used to manage the feed pagination runtime.
 * @returns The feed pagination runtime state and callbacks.
 */
export function useFeedPaginationRuntime(
  options: FeedPaginationRuntimeOptions,
) {
  const runtimeActions = useFeedPaginationRuntimeActions({
    controllers: options.controllers,
    options,
  });
  options.maybeLoadNextPageRef.current = runtimeActions.maybeLoadNextPage;
  const runtimeViewport = useFeedPaginationRuntimeViewportEffects({
    controllers: options.controllers,
    maybeAutoFillViewport: runtimeActions.maybeAutoFillViewport,
    options,
  });
  useFeedPaginationRuntimeBindings({
    controllers: options.controllers,
    maybeLoadNextPage: runtimeActions.maybeLoadNextPage,
    options,
    shouldObserveLoadMoreBoundary:
      runtimeViewport.shouldObserveLoadMoreBoundary,
  });
  useCachedRevealCompletionEffect({
    isCachedPageRevealing: options.controllers.localState.isCachedPageRevealing,
    isInvertedLoadBoundaryArmedRef:
      options.controllers.localState.isInvertedLoadBoundaryArmedRef,
    isInvertedScroll: options.isInvertedScroll,
    isStandardLoadBoundaryArmedRef:
      options.controllers.localState.isStandardLoadBoundaryArmedRef,
    maybeLoadNextPage: runtimeActions.maybeLoadNextPage,
    paginationFrameRef: options.controllers.localState.paginationFrameRef,
  });

  return {
    invertedPaginationAnchorRef:
      options.controllers.anchorState.invertedPaginationAnchorRef,
    isCachedPageRevealing: options.controllers.localState.isCachedPageRevealing,
    isPendingServerRevealVisible:
      options.controllers.serverLoadState.isPendingServerRevealVisible,
    loadMoreSentinelRef: options.controllers.localState.loadMoreSentinelRef,
    maybeAutoFillViewport: runtimeActions.maybeAutoFillViewport,
    shouldUseVirtualizedFeed: runtimeViewport.shouldUseVirtualizedFeed,
    syncInvertedPaginationAnchor:
      options.controllers.anchorState.syncInvertedPaginationAnchor,
    visibleArticleCount: options.controllers.localState.visibleArticleCount,
  };
}

/**
 * Manage the feed pagination boundary controllers.
 * @param options - The options used to manage the feed pagination boundary controllers.
 * @param localState - Local pagination state returned by useFeedPaginationLocalState.
 * @param serverLoadState - Server-load pagination state returned by useFeedPaginationServerLoad.
 * @param anchorState - Inverted pagination anchor state returned by useInvertedPaginationAnchor.
 * @returns The feed pagination boundary controllers state and callbacks.
 */
function useFeedPaginationBoundaryControllers(
  options: FeedPaginationControllerOptions,
  localState: ReturnType<typeof useFeedPaginationLocalState>,
  serverLoadState: ReturnType<typeof useFeedPaginationServerLoad>,
  anchorState: ReturnType<typeof useInvertedPaginationAnchor>,
) {
  const suppressImmediateNormalScrollIntent = useCallback(() => {
    if (localState.normalScrollIntentSuppressionFrameRef.current !== null) {
      window.cancelAnimationFrame(
        localState.normalScrollIntentSuppressionFrameRef.current,
      );
    }

    localState.normalScrollIntentSuppressionFrameRef.current =
      window.requestAnimationFrame(() => {
        localState.normalScrollIntentSuppressionFrameRef.current = null;
      });
  }, [localState.normalScrollIntentSuppressionFrameRef]);

  return {
    rearmPaginationBoundaryFromUserIntent:
      useRearmPaginationBoundaryFromUserIntent({
        hasPendingBoundaryRearmAfterCooldownRef:
          serverLoadState.hasPendingBoundaryRearmAfterCooldownRef,
        hasPendingServerRevealRef: serverLoadState.hasPendingServerRevealRef,
        hasRequestedServerLoadRef: serverLoadState.hasRequestedServerLoadRef,
        invertedPaginationAnchorRef: anchorState.invertedPaginationAnchorRef,
        isInvertedLoadBoundaryArmedRef:
          localState.isInvertedLoadBoundaryArmedRef,
        isInvertedScroll: options.isInvertedScroll,
        isStandardLoadBoundaryArmedRef:
          localState.isStandardLoadBoundaryArmedRef,
        lastInvertedScrollTopRef: anchorState.lastInvertedScrollTopRef,
        scrollViewport: options.scrollViewport,
      }),
    suppressImmediateNormalScrollIntent,
  };
}

/**
 * Manage the feed pagination reset controllers.
 * @param options - The options used to manage the feed pagination reset controllers.
 * @param localState - Local pagination state returned by useFeedPaginationLocalState.
 * @param serverLoadState - Server-load pagination state returned by useFeedPaginationServerLoad.
 * @param anchorState - Inverted pagination anchor state returned by useInvertedPaginationAnchor.
 * @returns The feed pagination reset controllers state and callbacks.
 */
function useFeedPaginationResetControllers(
  options: FeedPaginationControllerOptions,
  localState: ReturnType<typeof useFeedPaginationLocalState>,
  serverLoadState: ReturnType<typeof useFeedPaginationServerLoad>,
  anchorState: ReturnType<typeof useInvertedPaginationAnchor>,
) {
  return useResetPaginationState({
    articlesPerPage: options.articlesPerPage,
    cancelCachedPageReveal: localState.cancelCachedPageReveal,
    clearServerLoadCooldown: serverLoadState.clearServerLoadCooldown,
    commitVisibleArticleCount: localState.commitVisibleArticleCount,
    filteredFeedLengthRef: localState.filteredFeedLengthRef,
    hasCompletedInvertedServerRevealRef:
      serverLoadState.hasCompletedInvertedServerRevealRef,
    hasPendingBoundaryRearmAfterCooldownRef:
      serverLoadState.hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef: serverLoadState.hasPendingServerRevealRef,
    hasRequestedServerLoadRef: serverLoadState.hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef:
      serverLoadState.hasResolvedStandardViewportRevealRef,
    hasUserScrolledRef: options.hasUserScrolledRef,
    isInvertedLoadBoundaryArmedRef: localState.isInvertedLoadBoundaryArmedRef,
    isStandardLoadBoundaryArmedRef: localState.isStandardLoadBoundaryArmedRef,
    isStandardViewportRefillActiveRef:
      serverLoadState.isStandardViewportRefillActiveRef,
    lastAutoFillListHeightRef: localState.lastAutoFillListHeightRef,
    lastInvertedAwayBoundarySnapshotRef:
      anchorState.lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef: anchorState.lastInvertedScrollTopRef,
    lastStandardScrollTopRef: localState.lastStandardScrollTopRef,
    onResetInvertedScrollOwnership: options.onResetInvertedScrollOwnership,
    paginationFrameRef: localState.paginationFrameRef,
    pendingInvertedPaginationAnchorSnapshotRef:
      anchorState.pendingInvertedPaginationAnchorSnapshotRef,
    previousFilteredFeedLengthRef: localState.previousFilteredFeedLengthRef,
    setIsPendingServerRevealVisible:
      serverLoadState.setIsPendingServerRevealVisible,
    standardViewportRefillTargetVisibleCountRef:
      localState.standardViewportRefillTargetVisibleCountRef,
  });
}

/**
 * Manage the feed pagination reveal effects.
 * @param options - The options used to manage the feed pagination reveal effects.
 * @param anchorState - Inverted pagination anchor state returned by useInvertedPaginationAnchor.
 * @param localState - Local pagination state returned by useFeedPaginationLocalState.
 * @param serverLoadState - Server-load pagination state returned by useFeedPaginationServerLoad.
 */
function useFeedPaginationRevealEffects(
  options: FeedPaginationEffectsOptions,
  anchorState: FeedPaginationControllers["anchorState"],
  localState: FeedPaginationControllers["localState"],
  serverLoadState: FeedPaginationControllers["serverLoadState"],
) {
  useFeedPaginationRevealCountEffect({
    commitVisibleArticleCount: localState.commitVisibleArticleCount,
    filteredFeedLength: options.filteredFeedLength,
    hasCompletedInvertedServerRevealRef:
      serverLoadState.hasCompletedInvertedServerRevealRef,
    hasPendingServerRevealRef: serverLoadState.hasPendingServerRevealRef,
    hasRequestedServerLoadRef: serverLoadState.hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef:
      serverLoadState.hasResolvedStandardViewportRevealRef,
    isInvertedScroll: options.isInvertedScroll,
    isLoadingMore: options.isLoadingMore,
    isStandardViewportRefillActiveRef:
      serverLoadState.isStandardViewportRefillActiveRef,
    lastInvertedAwayBoundarySnapshotRef:
      anchorState.lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef: anchorState.lastInvertedScrollTopRef,
    previousFilteredFeedLengthRef: localState.previousFilteredFeedLengthRef,
    setIsPendingServerRevealVisible:
      serverLoadState.setIsPendingServerRevealVisible,
    startServerLoadRearmCooldown: serverLoadState.startServerLoadRearmCooldown,
    visibleArticleCountRef: localState.visibleArticleCountRef,
  });
  useFeedPaginationLoadingMoreRevealEffect({
    canLoadMoreFromServer: options.canLoadMoreFromServer,
    filteredFeedLength: options.filteredFeedLength,
    hasCompletedInvertedServerRevealRef:
      serverLoadState.hasCompletedInvertedServerRevealRef,
    hasPendingServerRevealRef: serverLoadState.hasPendingServerRevealRef,
    hasResolvedStandardViewportRevealRef:
      serverLoadState.hasResolvedStandardViewportRevealRef,
    isInvertedScroll: options.isInvertedScroll,
    isLoadingMore: options.isLoadingMore,
    isStandardViewportRefillActiveRef:
      serverLoadState.isStandardViewportRefillActiveRef,
    lastInvertedAwayBoundarySnapshotRef:
      anchorState.lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef: anchorState.lastInvertedScrollTopRef,
    previousIsLoadingMoreRef: localState.previousIsLoadingMoreRef,
    setIsPendingServerRevealVisible:
      serverLoadState.setIsPendingServerRevealVisible,
    startServerLoadRearmCooldown: serverLoadState.startServerLoadRearmCooldown,
    visibleArticleCount: localState.visibleArticleCount,
  });
  useVisibleArticleCountRefSync({
    visibleArticleCount: localState.visibleArticleCount,
    visibleArticleCountRef: localState.visibleArticleCountRef,
  });
}
