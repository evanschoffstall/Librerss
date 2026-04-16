import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import {
  finalizePaginationBoundaryRearm,
  type PaginationBoundaryUserIntentOptions,
  resetPaginationRuntimeState,
  shouldAbortPaginationBoundaryRearm,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationBoundaryState";
import { resolvePaginationBoundaryState } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationRules";

type ResetPaginationRuntimeStateArgs = Omit<
  ResetPaginationStateOptions,
  | "articlesPerPage"
  | "commitVisibleArticleCount"
  | "filteredFeedLengthRef"
  | "onResetInvertedScrollOwnership"
>;

interface ResetPaginationStateOptions {
  articlesPerPage: number;
  clearServerLoadCooldown: () => void;
  commitVisibleArticleCount: (nextVisibleCount: number) => void;
  filteredFeedLengthRef: { current: number };
  hasPendingBoundaryRearmAfterCooldownRef: { current: boolean };
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  hasResolvedStandardViewportRevealRef: { current: boolean };
  hasUserScrolledRef: { current: boolean };
  isInvertedLoadBoundaryArmedRef: { current: boolean };
  isStandardLoadBoundaryArmedRef: { current: boolean };
  isStandardViewportRefillActiveRef: { current: boolean };
  lastAutoFillListHeightRef: { current: null | number };
  lastInvertedAwayBoundarySnapshotRef: { current: unknown };
  lastInvertedScrollTopRef: { current: null | number };
  lastStandardScrollTopRef: { current: null | number };
  onResetInvertedScrollOwnership: () => void;
  paginationFrameRef: { current: null | number };
  pendingInvertedPaginationAnchorSnapshotRef: { current: unknown };
  previousFilteredFeedLengthRef: { current: number };
}

export function useCollapsingArticlesRefSync(options: {
  hasCollapsingArticles: boolean;
  hasCollapsingArticlesRef: { current: boolean };
}) {
  useLayoutEffect(() => {
    options.hasCollapsingArticlesRef.current = options.hasCollapsingArticles;
  }, [options.hasCollapsingArticles, options.hasCollapsingArticlesRef]);
}

export function useFeedPaginationLoadingMoreRevealEffect(options: {
  hasPendingServerRevealRef: { current: boolean };
  hasResolvedStandardViewportRevealRef: { current: boolean };
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  previousIsLoadingMoreRef: { current: boolean };
  startServerLoadRearmCooldown: () => void;
}) {
  const {
    hasPendingServerRevealRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    isStandardViewportRefillActiveRef,
    previousIsLoadingMoreRef,
    startServerLoadRearmCooldown,
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

    hasPendingServerRevealRef.current = false;
    startServerLoadRearmCooldown();

    if (!isInvertedScroll && isStandardViewportRefillActiveRef.current) {
      hasResolvedStandardViewportRevealRef.current = true;
    }
  }, [
    hasPendingServerRevealRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    isStandardViewportRefillActiveRef,
    previousIsLoadingMoreRef,
    startServerLoadRearmCooldown,
  ]);
}

export function useFeedPaginationQueryResetEffect(options: {
  articleFilter: string;
  feedViewKey: string;
  isInvertedScroll: boolean;
  resetPaginationState: () => void;
  searchTerm: string;
}) {
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

export function useFeedPaginationRefreshResetEffect(options: {
  hasUserScrolledRef: { current: boolean };
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  previousRefreshEpochRef: { current: number };
  refreshEpoch: number;
  resetPaginationState: () => void;
}) {
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

export function useFeedPaginationRevealCountEffect(options: {
  commitVisibleArticleCount: (nextVisibleCount: number) => void;
  filteredFeedLength: number;
  hasPendingServerRevealRef: { current: boolean };
  hasRequestedServerLoadRef: { current: boolean };
  hasResolvedStandardViewportRevealRef: { current: boolean };
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  previousFilteredFeedLengthRef: { current: number };
  startServerLoadRearmCooldown: () => void;
  visibleArticleCountRef: { current: number };
}) {
  const {
    commitVisibleArticleCount,
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    isStandardViewportRefillActiveRef,
    previousFilteredFeedLengthRef,
    startServerLoadRearmCooldown,
    visibleArticleCountRef,
  } = options;
  useLayoutEffect(() => {
    const currentVisibleCount = visibleArticleCountRef.current;

    if (isLoadingMore && currentVisibleCount < filteredFeedLength) {
      commitVisibleArticleCount(filteredFeedLength);
      previousFilteredFeedLengthRef.current = filteredFeedLength;
      return;
    }

    const previousFilteredFeedLength = previousFilteredFeedLengthRef.current;
    previousFilteredFeedLengthRef.current = filteredFeedLength;
    const hasSettledRequestedReveal =
      hasPendingServerRevealRef.current || hasRequestedServerLoadRef.current;

    if (
      !hasSettledRequestedReveal ||
      filteredFeedLength <= previousFilteredFeedLength
    ) {
      return;
    }

    hasPendingServerRevealRef.current = false;
    startServerLoadRearmCooldown();

    if (!isInvertedScroll && isStandardViewportRefillActiveRef.current) {
      hasResolvedStandardViewportRevealRef.current = true;
    }

    if (currentVisibleCount < filteredFeedLength) {
      commitVisibleArticleCount(filteredFeedLength);
    }
  }, [
    commitVisibleArticleCount,
    filteredFeedLength,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isInvertedScroll,
    isLoadingMore,
    isStandardViewportRefillActiveRef,
    previousFilteredFeedLengthRef,
    startServerLoadRearmCooldown,
    visibleArticleCountRef,
  ]);
}

export function useInitialFeedPaginationAutoFillEffect(options: {
  filteredFeedLength: number;
  isInitialLoading: boolean;
  maybeAutoFillViewport: (committedListHeight?: number) => void;
  scrollViewport: HTMLElement | null;
  shouldUseVirtualizedFeed: boolean;
  visibleArticleCount: number;
}) {
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

export function useMountedFlagCleanupEffect(options: {
  isMountedRef: { current: boolean };
}) {
  useEffect(() => {
    return () => {
      options.isMountedRef.current = false;
    };
  }, [options.isMountedRef]);
}

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
      armedBoundaryRef: isInvertedScroll
        ? isInvertedLoadBoundaryArmedRef
        : isStandardLoadBoundaryArmedRef,
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

export function useResetPaginationState(options: ResetPaginationStateOptions) {
  const runtimeStateArgs = useResetPaginationRuntimeStateArgs(options);
  return useCallback(() => {
    resetPaginationStateAndCommit({
      articlesPerPage: options.articlesPerPage,
      commitVisibleArticleCount: options.commitVisibleArticleCount,
      filteredFeedLength: options.filteredFeedLengthRef.current,
      onResetInvertedScrollOwnership: options.onResetInvertedScrollOwnership,
      runtimeStateArgs,
    });
  }, [
    options.articlesPerPage,
    options.commitVisibleArticleCount,
    options.filteredFeedLengthRef,
    options.onResetInvertedScrollOwnership,
    runtimeStateArgs,
  ]);
}

export function useResolvedStandardViewportRevealEffect(options: {
  filteredFeedLength: number;
  hasResolvedStandardViewportRevealRef: { current: boolean };
  isInvertedScroll: boolean;
  maybeAutoFillViewport: (committedListHeight?: number) => void;
}) {
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

export function useVisibleArticleCountRefSync(options: {
  visibleArticleCount: number;
  visibleArticleCountRef: { current: number };
}) {
  useLayoutEffect(() => {
    options.visibleArticleCountRef.current = options.visibleArticleCount;
  }, [options.visibleArticleCount, options.visibleArticleCountRef]);
}

function resetPaginationStateAndCommit(options: {
  articlesPerPage: number;
  commitVisibleArticleCount: (nextVisibleCount: number) => void;
  filteredFeedLength: number;
  onResetInvertedScrollOwnership: () => void;
  runtimeStateArgs: ResetPaginationRuntimeStateArgs;
}) {
  resetPaginationRuntimeState({
    ...options.runtimeStateArgs,
    filteredFeedLength: options.filteredFeedLength,
  });
  options.commitVisibleArticleCount(options.articlesPerPage);
  options.onResetInvertedScrollOwnership();
}

function useResetPaginationRuntimeStateArgs(
  options: ResetPaginationStateOptions,
) {
  return useMemo(
    () => ({
      clearServerLoadCooldown: options.clearServerLoadCooldown,
      hasPendingBoundaryRearmAfterCooldownRef:
        options.hasPendingBoundaryRearmAfterCooldownRef,
      hasPendingServerRevealRef: options.hasPendingServerRevealRef,
      hasRequestedServerLoadRef: options.hasRequestedServerLoadRef,
      hasResolvedStandardViewportRevealRef:
        options.hasResolvedStandardViewportRevealRef,
      hasUserScrolledRef: options.hasUserScrolledRef,
      isInvertedLoadBoundaryArmedRef: options.isInvertedLoadBoundaryArmedRef,
      isStandardLoadBoundaryArmedRef: options.isStandardLoadBoundaryArmedRef,
      isStandardViewportRefillActiveRef:
        options.isStandardViewportRefillActiveRef,
      lastAutoFillListHeightRef: options.lastAutoFillListHeightRef,
      lastInvertedAwayBoundarySnapshotRef:
        options.lastInvertedAwayBoundarySnapshotRef,
      lastInvertedScrollTopRef: options.lastInvertedScrollTopRef,
      lastStandardScrollTopRef: options.lastStandardScrollTopRef,
      paginationFrameRef: options.paginationFrameRef,
      pendingInvertedPaginationAnchorSnapshotRef:
        options.pendingInvertedPaginationAnchorSnapshotRef,
      previousFilteredFeedLengthRef: options.previousFilteredFeedLengthRef,
    }),
    [
      options.clearServerLoadCooldown,
      options.hasPendingBoundaryRearmAfterCooldownRef,
      options.hasPendingServerRevealRef,
      options.hasRequestedServerLoadRef,
      options.hasResolvedStandardViewportRevealRef,
      options.hasUserScrolledRef,
      options.isInvertedLoadBoundaryArmedRef,
      options.isStandardLoadBoundaryArmedRef,
      options.isStandardViewportRefillActiveRef,
      options.lastAutoFillListHeightRef,
      options.lastInvertedAwayBoundarySnapshotRef,
      options.lastInvertedScrollTopRef,
      options.lastStandardScrollTopRef,
      options.paginationFrameRef,
      options.pendingInvertedPaginationAnchorSnapshotRef,
      options.previousFilteredFeedLengthRef,
    ],
  );
}
