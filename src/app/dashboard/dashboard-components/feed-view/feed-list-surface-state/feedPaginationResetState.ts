import { useCallback, useMemo } from "react";

import { resetPaginationRuntimeState } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationBoundaryState";

export interface ResetPaginationStateOptions {
  articlesPerPage: number;
  cancelCachedPageReveal: () => void;
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

export function useResetPaginationState(options: ResetPaginationStateOptions) {
  const runtimeStateArgs = useResetPaginationRuntimeStateArgs(options);
  const {
    articlesPerPage,
    cancelCachedPageReveal,
    commitVisibleArticleCount,
    filteredFeedLengthRef,
    onResetInvertedScrollOwnership,
  } = options;

  return useCallback(() => {
    cancelCachedPageReveal();
    resetPaginationRuntimeState({
      ...runtimeStateArgs,
      filteredFeedLength: filteredFeedLengthRef.current,
    });
    commitVisibleArticleCount(articlesPerPage);
    onResetInvertedScrollOwnership();
  }, [
    articlesPerPage,
    cancelCachedPageReveal,
    commitVisibleArticleCount,
    filteredFeedLengthRef,
    onResetInvertedScrollOwnership,
    runtimeStateArgs,
  ]);
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
