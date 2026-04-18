import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { useResetPaginationState } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/feedPaginationResetState";
import { useFeedPaginationLocalState } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationLocalState";
import {
  useFeedPaginationRuntimeActions,
  useFeedPaginationRuntimeBindings,
  useFeedPaginationRuntimeViewportEffects,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationOrchestration";
import { useFeedPaginationServerLoad } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationServerLoad";
import { SKELETON_MIN_VISIBLE_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import {
  useCollapsingArticlesRefSync,
  useFeedPaginationLoadingMoreRevealEffect,
  useFeedPaginationQueryResetEffect,
  useFeedPaginationRefreshResetEffect,
  useFeedPaginationRevealCountEffect,
  useMountedFlagCleanupEffect,
  useRearmPaginationBoundaryFromUserIntent,
  useVisibleArticleCountRefSync,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationVisibilityEffects";
import { useInvertedPaginationAnchor } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useInvertedPaginationAnchor";

export interface FeedPaginationControllerOptions {
  articlesPerPage: number;
  canLoadMoreFromServer: boolean;
  filteredFeedLength: number;
  hasCollapsingArticles: boolean;
  hasUserScrolledRef: { current: boolean };
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  onLoadMore?: () => void;
  onResetInvertedScrollOwnership: () => void;
  refreshEpoch: number;
  scrollViewport: HTMLElement | null;
}

export type FeedPaginationControllers = ReturnType<
  typeof useFeedPaginationControllers
>;

export interface FeedPaginationEffectsOptions extends FeedPaginationControllerOptions {
  articleFilter: string;
  controllers: ReturnType<typeof useFeedPaginationControllers>;
  feedViewKey: string;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  searchTerm: string;
}

export interface FeedPaginationRuntimeOptions extends FeedPaginationEffectsOptions {
  clearInitialNormalScrollLock: () => void;
  hasActiveInvertedExpansionScrollLock: () => boolean;
  onClaimInvertedScrollOwnership: () => void;
  onReleaseInvertedExpansionScrollLock: () => void;
  onSyncInvertedExpansionScrollLock: () => void;
  shouldLockInitialNormalScroll: () => boolean;
}

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
    onLoadMore: options.onLoadMore,
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
  useFeedPaginationRefreshResetEffect({
    hasUserScrolledRef: options.hasUserScrolledRef,
    isInvertedScroll: options.isInvertedScroll,
    isLoadingMore: options.isLoadingMore,
    isRefreshing: options.isRefreshing,
    isStandardViewportRefillActiveRef:
      serverLoadState.isStandardViewportRefillActiveRef,
    previousRefreshEpochRef: localState.previousRefreshEpochRef,
    refreshEpoch: options.refreshEpoch,
    resetPaginationState,
  });
  useFeedPaginationQueryResetEffect({
    articleFilter: options.articleFilter,
    feedViewKey: options.feedViewKey,
    isInvertedScroll: options.isInvertedScroll,
    resetPaginationState,
    searchTerm: options.searchTerm,
  });
  useFeedPaginationRevealEffects(
    options,
    anchorState,
    localState,
    serverLoadState,
  );
}

export function useFeedPaginationRuntime(
  options: FeedPaginationRuntimeOptions,
) {
  const runtimeActions = useFeedPaginationRuntimeActions({
    controllers: options.controllers,
    options,
  });
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

  const isServerLoadSkeletonActive = useServerLoadSkeletonHold(
    options.isLoadingMore,
  );

  return {
    invertedPaginationAnchorRef:
      options.controllers.anchorState.invertedPaginationAnchorRef,
    isCachedPageRevealing: options.controllers.localState.isCachedPageRevealing,
    isServerLoadSkeletonActive,
    loadMoreSentinelRef: options.controllers.localState.loadMoreSentinelRef,
    maybeAutoFillViewport: runtimeActions.maybeAutoFillViewport,
    shouldUseVirtualizedFeed: runtimeViewport.shouldUseVirtualizedFeed,
    syncInvertedPaginationAnchor:
      options.controllers.anchorState.syncInvertedPaginationAnchor,
    visibleArticleCount: options.controllers.localState.visibleArticleCount,
  };
}

/**
 * Detects the `isCachedPageRevealing` true → false transition (a cached
 * reveal just completed) and proactively re-arms the load boundary and
 * schedules a follow-up pagination check. Without this, if the user stops
 * scrolling at the boundary the IntersectionObserver sentinel will not
 * re-fire and scroll events will not arrive, permanently deadlocking
 * pagination.
 */
function useCachedRevealCompletionEffect(options: {
  isCachedPageRevealing: boolean;
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: { current: boolean };
  maybeLoadNextPage: (_trigger: "scroll" | "sentinel") => void;
  paginationFrameRef: { current: null | number };
}) {
  const previousRevealingRef = useRef(false);

  useLayoutEffect(() => {
    const wasRevealing = previousRevealingRef.current;
    previousRevealingRef.current = options.isCachedPageRevealing;

    if (!wasRevealing || options.isCachedPageRevealing) {
      return;
    }

    // Reveal just completed — re-arm the load boundary so the sentinel or
    // the next scroll event can trigger another page if needed.
    if (options.isInvertedScroll) {
      options.isInvertedLoadBoundaryArmedRef.current = true;
    } else {
      options.isStandardLoadBoundaryArmedRef.current = true;
    }

    // Schedule a deferred pagination check after the DOM has committed the
    // revealed articles. This covers the case where the user is still at
    // the load boundary and no further scroll events will arrive.
    if (options.paginationFrameRef.current === null) {
      options.paginationFrameRef.current = window.requestAnimationFrame(() => {
        options.paginationFrameRef.current = null;
        options.maybeLoadNextPage("sentinel");
      });
    }
  }, [
    options.isCachedPageRevealing,
    options.isInvertedLoadBoundaryArmedRef,
    options.isInvertedScroll,
    options.isStandardLoadBoundaryArmedRef,
    options.maybeLoadNextPage,
    options.paginationFrameRef,
  ]);
}

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
        scrollViewport: options.scrollViewport,
      }),
    suppressImmediateNormalScrollIntent,
  };
}

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
  });
}

function useFeedPaginationRevealEffects(
  options: FeedPaginationEffectsOptions,
  anchorState: FeedPaginationControllers["anchorState"],
  localState: FeedPaginationControllers["localState"],
  serverLoadState: FeedPaginationControllers["serverLoadState"],
) {
  useFeedPaginationRevealCountEffect({
    commitVisibleArticleCount: localState.commitVisibleArticleCount,
    filteredFeedLength: options.filteredFeedLength,
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
    startServerLoadRearmCooldown: serverLoadState.startServerLoadRearmCooldown,
    visibleArticleCountRef: localState.visibleArticleCountRef,
  });
  useFeedPaginationLoadingMoreRevealEffect({
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
    startServerLoadRearmCooldown: serverLoadState.startServerLoadRearmCooldown,
  });
  useVisibleArticleCountRefSync({
    visibleArticleCount: localState.visibleArticleCount,
    visibleArticleCountRef: localState.visibleArticleCountRef,
  });
}

/**
 * Extends the `isLoadingMore` signal so load-more skeletons stay visible for
 * at least {@link SKELETON_MIN_VISIBLE_MS} after the dashboard controller
 * clears `isLoadingMore`. When server data is prefetched, the controller
 * can clear the flag within a single effect cycle — far too fast for the user
 * to perceive the skeleton transition.
 */
function useServerLoadSkeletonHold(isLoadingMore: boolean): boolean {
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  const isMountedRef = useRef(true);

  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (holdTimerRef.current !== null) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (isLoadingMore) {
      if (holdTimerRef.current !== null) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      setIsHolding(true);
      return;
    }

    if (!isHolding) {
      return;
    }

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (isMountedRef.current) {
        setIsHolding(false);
      }
    }, SKELETON_MIN_VISIBLE_MS);
  }, [isHolding, isLoadingMore]);

  return isLoadingMore || isHolding;
}
