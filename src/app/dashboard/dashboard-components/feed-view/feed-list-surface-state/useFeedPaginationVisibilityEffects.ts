import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import {
  finalizePaginationBoundaryRearm,
  type PaginationBoundaryUserIntentOptions,
  shouldAbortPaginationBoundaryRearm,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationBoundaryState";
import { resolvePaginationBoundaryState } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationRules";
import {
  cancelPendingServerRevealCompletion,
  completePendingServerReveal,
  handleFeedPaginationRevealCountTransition,
  type PendingServerRevealLifecycleOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/pendingServerReveal";

interface CollapsingArticlesRefSyncOptions {
  hasCollapsingArticles: boolean;
  hasCollapsingArticlesRef: { current: boolean };
}
interface FeedPaginationQueryResetEffectOptions {
  articleFilter: string;
  feedViewKey: string;
  isInvertedScroll: boolean;
  resetPaginationState: () => void;
  searchTerm: string;
}

interface FeedPaginationRefreshResetEffectOptions {
  hasUserScrolledRef: { current: boolean };
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  previousRefreshEpochRef: { current: number };
  refreshEpoch: number;
  resetPaginationState: () => void;
}

interface InitialFeedPaginationAutoFillEffectOptions {
  filteredFeedLength: number;
  isInitialLoading: boolean;
  maybeAutoFillViewport: (committedListHeight?: number) => void;
  scrollViewport: HTMLElement | null;
  shouldUseVirtualizedFeed: boolean;
  visibleArticleCount: number;
}
interface MountedFlagCleanupEffectOptions {
  isMountedRef: { current: boolean };
}

interface NullableNumberRef {
  current: null | number;
}

interface ResolvedStandardViewportRevealEffectOptions {
  filteredFeedLength: number;
  hasResolvedStandardViewportRevealRef: { current: boolean };
  isInvertedScroll: boolean;
  maybeAutoFillViewport: (committedListHeight?: number) => void;
}

interface TimeoutHandleRef {
  current: null | ReturnType<typeof setTimeout>;
}

interface VisibleArticleCountRefSyncOptions {
  visibleArticleCount: number;
  visibleArticleCountRef: { current: number };
}

/**
 * Manage the collapsing articles ref sync.
 * @param options - The options used to manage the collapsing articles ref sync.
 */
export function useCollapsingArticlesRefSync(
  options: CollapsingArticlesRefSyncOptions,
) {
  useLayoutEffect(() => {
    options.hasCollapsingArticlesRef.current = options.hasCollapsingArticles;
  }, [options.hasCollapsingArticles, options.hasCollapsingArticlesRef]);
}
/**
 * Manage the feed pagination loading more reveal effect.
 * @param options - The options used to manage the feed pagination loading more reveal effect.
 */
export function useFeedPaginationLoadingMoreRevealEffect(
  options: PendingServerRevealLifecycleOptions & {
    canLoadMoreFromServer: boolean;
    filteredFeedLength: number;
    isLoadingMore: boolean;
    previousIsLoadingMoreRef: { current: boolean };
    visibleArticleCount: number;
  },
) {
  const {
    canLoadMoreFromServer,
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    isStandardViewportRefillActiveRef,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    previousIsLoadingMoreRef,
    setIsPendingServerRevealVisible,
    startServerLoadRearmCooldown,
    visibleArticleCount,
  } = options;
  useLayoutEffect(() => {
    const previousIsLoadingMore = previousIsLoadingMoreRef.current;
    previousIsLoadingMoreRef.current = isLoadingMore;

    if (
      isLoadingMore ||
      !previousIsLoadingMore ||
      !hasPendingServerRevealRef.current
    ) {
      return;
    }

    if (
      isInvertedScroll &&
      canLoadMoreFromServer &&
      filteredFeedLength <= visibleArticleCount
    ) {
      return;
    }

    completePendingServerReveal({
      hasPendingServerRevealRef,
      hasResolvedStandardViewportRevealRef,
      isInvertedScroll,
      isStandardViewportRefillActiveRef,
      lastInvertedAwayBoundarySnapshotRef,
      lastInvertedScrollTopRef,
      setIsPendingServerRevealVisible,
      startServerLoadRearmCooldown,
    });
  }, [
    canLoadMoreFromServer,
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    setIsPendingServerRevealVisible,
    isLoadingMore,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    isStandardViewportRefillActiveRef,
    previousIsLoadingMoreRef,
    startServerLoadRearmCooldown,
    visibleArticleCount,
  ]);
}

/**
 * Manage the feed pagination query reset effect.
 * @param options - The options used to manage the feed pagination query reset effect.
 */
export function useFeedPaginationQueryResetEffect(
  options: FeedPaginationQueryResetEffectOptions,
) {
  const {
    articleFilter,
    feedViewKey,
    isInvertedScroll,
    resetPaginationState,
    searchTerm,
  } = options;
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    resetPaginationState();
  }, [
    articleFilter,
    feedViewKey,
    isInvertedScroll,
    resetPaginationState,
    searchTerm,
  ]);
}
/**
 * Manage the feed pagination refresh reset effect.
 * @param options - The options used to manage the feed pagination refresh reset effect.
 */
export function useFeedPaginationRefreshResetEffect(
  options: FeedPaginationRefreshResetEffectOptions,
) {
  const {
    hasUserScrolledRef,
    isInvertedScroll,
    isLoadingMore,
    isRefreshing,
    isStandardViewportRefillActiveRef,
    previousRefreshEpochRef,
    refreshEpoch,
    resetPaginationState,
  } = options;
  useLayoutEffect(() => {
    const didRefreshEpochChange =
      previousRefreshEpochRef.current !== refreshEpoch;
    previousRefreshEpochRef.current = refreshEpoch;
    const shouldResetForActiveRefresh =
      didRefreshEpochChange && isRefreshing && !isLoadingMore;

    if (shouldResetForActiveRefresh) {
      if (!isInvertedScroll) {
        isStandardViewportRefillActiveRef.current = false;
      }
      resetPaginationState();
    }
  }, [
    hasUserScrolledRef,
    isInvertedScroll,
    isLoadingMore,
    isRefreshing,
    isStandardViewportRefillActiveRef,
    previousRefreshEpochRef,
    refreshEpoch,
    resetPaginationState,
  ]);
}

/**
 * Manage the feed pagination reveal count effect.
 * @param options - The options used to manage the feed pagination reveal count effect.
 */
export function useFeedPaginationRevealCountEffect(
  options: PendingServerRevealLifecycleOptions & {
    commitVisibleArticleCount: (nextVisibleCount: number) => void;
    filteredFeedLength: number;
    hasRequestedServerLoadRef: { current: boolean };
    isLoadingMore: boolean;
    previousFilteredFeedLengthRef: { current: number };
    visibleArticleCountRef: { current: number };
  },
) {
  const {
    commitVisibleArticleCount,
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    isStandardViewportRefillActiveRef,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    previousFilteredFeedLengthRef,
    setIsPendingServerRevealVisible,
    startServerLoadRearmCooldown,
    visibleArticleCountRef,
  } = options;
  const pendingServerRevealCountRef = useRef<null | number>(null);
  const pendingServerRevealFrameRef = useRef<null | number>(null);
  const pendingServerRevealTimeoutRef = useRef<null | ReturnType<
    typeof setTimeout
  >>(null);
  usePendingServerRevealCleanup(
    pendingServerRevealCountRef,
    pendingServerRevealFrameRef,
    pendingServerRevealTimeoutRef,
  );

  useLayoutEffect(() => {
    handleFeedPaginationRevealCountTransition({
      commitVisibleArticleCount,
      filteredFeedLength,
      hasPendingServerRevealRef,
      hasRequestedServerLoadRef,
      hasResolvedStandardViewportRevealRef,
      isInvertedScroll,
      isLoadingMore,
      isStandardViewportRefillActiveRef,
      lastInvertedAwayBoundarySnapshotRef,
      lastInvertedScrollTopRef,
      pendingServerRevealCountRef,
      pendingServerRevealFrameRef,
      pendingServerRevealTimeoutRef,
      previousFilteredFeedLengthRef,
      setIsPendingServerRevealVisible,
      startServerLoadRearmCooldown,
      visibleArticleCountRef,
    });
  }, [
    commitVisibleArticleCount,
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    setIsPendingServerRevealVisible,
    isLoadingMore,
    lastInvertedAwayBoundarySnapshotRef,
    lastInvertedScrollTopRef,
    isStandardViewportRefillActiveRef,
    pendingServerRevealCountRef,
    pendingServerRevealFrameRef,
    pendingServerRevealTimeoutRef,
    previousFilteredFeedLengthRef,
    startServerLoadRearmCooldown,
    visibleArticleCountRef,
  ]);
}

/**
 * Manage the initial feed pagination auto fill effect.
 * @param options - The options used to manage the initial feed pagination auto fill effect.
 */
export function useInitialFeedPaginationAutoFillEffect(
  options: InitialFeedPaginationAutoFillEffectOptions,
) {
  const {
    filteredFeedLength,
    isInitialLoading,
    maybeAutoFillViewport,
    scrollViewport,
    visibleArticleCount,
  } = options;
  useEffect(() => {
    if (
      !scrollViewport ||
      isInitialLoading ||
      visibleArticleCount >= filteredFeedLength
    ) {
      return;
    }

    const autoFillFrameId = window.requestAnimationFrame(() => {
      maybeAutoFillViewport();
    });

    return () => {
      window.cancelAnimationFrame(autoFillFrameId);
    };
  }, [
    filteredFeedLength,
    isInitialLoading,
    maybeAutoFillViewport,
    scrollViewport,
    visibleArticleCount,
  ]);
}

/**
 * Manage the mounted flag cleanup effect.
 * @param options - The options used to manage the mounted flag cleanup effect.
 */
export function useMountedFlagCleanupEffect(
  options: MountedFlagCleanupEffectOptions,
) {
  useEffect(() => {
    return () => {
      options.isMountedRef.current = false;
    };
  }, [options.isMountedRef]);
}

/**
 * Manage the rearm pagination boundary from user intent.
 * @param options - The options used to manage the rearm pagination boundary from user intent.
 * @returns The rearm pagination boundary from user intent state and callbacks.
 */
export function useRearmPaginationBoundaryFromUserIntent(
  options: PaginationBoundaryUserIntentOptions,
) {
  const {
    hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    invertedPaginationAnchorRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    scrollViewport,
  } = options;
  return useCallback(() => {
    if (!scrollViewport) {
      return;
    }

    if (isInvertedScroll) {
      if (hasPendingServerRevealRef.current) {
        return;
      }

      finalizePaginationBoundaryRearm({
        armedBoundaryRef: isInvertedLoadBoundaryArmedRef,
        hasPendingBoundaryRearmAfterCooldownRef,
        hasRequestedServerLoadRef,
      });
      return;
    }

    if (
      shouldAbortPaginationBoundaryRearm(
        scrollViewport,
        hasPendingServerRevealRef,
        invertedPaginationAnchorRef,
      )
    ) {
      return;
    }

    const { hasMovedAwayFromBoundary } = resolvePaginationBoundaryState({
      isInvertedScroll,
      scrollViewport,
    });

    if (!hasMovedAwayFromBoundary) {
      return;
    }

    finalizePaginationBoundaryRearm({
      armedBoundaryRef: isStandardLoadBoundaryArmedRef,
      hasPendingBoundaryRearmAfterCooldownRef,
      hasRequestedServerLoadRef,
    });
  }, [
    hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    invertedPaginationAnchorRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    scrollViewport,
  ]);
}

/**
 * Manage the resolved standard viewport reveal effect.
 * @param options - The options used to manage the resolved standard viewport reveal effect.
 */
export function useResolvedStandardViewportRevealEffect(
  options: ResolvedStandardViewportRevealEffectOptions,
) {
  const {
    filteredFeedLength,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    maybeAutoFillViewport,
  } = options;
  useLayoutEffect(() => {
    if (isInvertedScroll || !hasResolvedStandardViewportRevealRef.current) {
      return;
    }

    hasResolvedStandardViewportRevealRef.current = false;
    maybeAutoFillViewport();
  }, [
    filteredFeedLength,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    maybeAutoFillViewport,
  ]);
}
/**
 * Manage the visible article count ref sync.
 * @param options - The options used to manage the visible article count ref sync.
 */
export function useVisibleArticleCountRefSync(
  options: VisibleArticleCountRefSyncOptions,
) {
  useLayoutEffect(() => {
    options.visibleArticleCountRef.current = options.visibleArticleCount;
  }, [options.visibleArticleCount, options.visibleArticleCountRef]);
}

/**
 * Cancels deferred pending-reveal work when the owning hook unmounts.
 * @param pendingServerRevealCountRef - Tracks the pending reveal count.
 * @param pendingServerRevealFrameRef - Tracks the scheduled reveal frame.
 * @param pendingServerRevealTimeoutRef - Tracks the delayed reveal timeout.
 */
function usePendingServerRevealCleanup(
  pendingServerRevealCountRef: NullableNumberRef,
  pendingServerRevealFrameRef: NullableNumberRef,
  pendingServerRevealTimeoutRef: TimeoutHandleRef,
) {
  useEffect(() => {
    return () => {
      cancelPendingServerRevealCompletion(
        pendingServerRevealCountRef,
        pendingServerRevealFrameRef,
        pendingServerRevealTimeoutRef,
      );
    };
  }, [
    pendingServerRevealCountRef,
    pendingServerRevealFrameRef,
    pendingServerRevealTimeoutRef,
  ]);
}
