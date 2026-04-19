import type { Dispatch, SetStateAction } from "react";

import { renderHook } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";

import {
  useFeedPaginationLoadingMoreRevealEffect,
  useFeedPaginationRevealCountEffect,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationVisibilityEffects";

type LoadingMoreRevealEffectOptions =
  Parameters<typeof useFeedPaginationLoadingMoreRevealEffect>[0];

function createOptions(
  overrides: Partial<LoadingMoreRevealEffectOptions> = {},
): LoadingMoreRevealEffectOptions {
  return {
    canLoadMoreFromServer: true,
    filteredFeedLength: 12,
    hasPendingServerRevealRef: { current: true },
    hasResolvedStandardViewportRevealRef: { current: false },
    isInvertedScroll: true,
    isLoadingMore: true,
    isStandardViewportRefillActiveRef: { current: false },
    lastInvertedAwayBoundarySnapshotRef: { current: "snapshot" },
    lastInvertedScrollTopRef: { current: 0 },
    previousIsLoadingMoreRef: { current: false },
    setIsPendingServerRevealVisible:
      createPendingServerRevealVisibilitySetter(),
    startServerLoadRearmCooldown: mock(() => {}),
    visibleArticleCount: 12,
    ...overrides,
  };
}

function createPendingServerRevealVisibilitySetter(): Dispatch<
  SetStateAction<boolean>
> {
  return mock((_value: SetStateAction<boolean>) => {});
}

describe("useFeedPaginationLoadingMoreRevealEffect", () => {
  test("keeps the inverted pending reveal armed while the new page has not appeared yet", () => {
    const options = createOptions();

    const { rerender } = renderHook(
      (currentOptions: LoadingMoreRevealEffectOptions) => {
        useFeedPaginationLoadingMoreRevealEffect(currentOptions);
      },
      { initialProps: options },
    );

    rerender({
      ...options,
      isLoadingMore: false,
    });

    expect(options.hasPendingServerRevealRef.current).toBe(true);
    expect(options.lastInvertedAwayBoundarySnapshotRef.current).toBe("snapshot");
    expect(options.lastInvertedScrollTopRef.current).toBe(0);
    expect(options.startServerLoadRearmCooldown).not.toHaveBeenCalled();
  });

  test("completes the inverted pending reveal once the server reports no more pages", () => {
    const options = createOptions({
      canLoadMoreFromServer: false,
    });

    const { rerender } = renderHook(
      (currentOptions: LoadingMoreRevealEffectOptions) => {
        useFeedPaginationLoadingMoreRevealEffect(currentOptions);
      },
      { initialProps: options },
    );

    rerender({
      ...options,
      isLoadingMore: false,
    });

    expect(options.hasPendingServerRevealRef.current).toBe(false);
    expect(options.lastInvertedAwayBoundarySnapshotRef.current).toBeNull();
    expect(options.lastInvertedScrollTopRef.current).toBeNull();
    expect(options.startServerLoadRearmCooldown).toHaveBeenCalledTimes(1);
  });
});

describe("useFeedPaginationRevealCountEffect", () => {
  test("does not reveal prefetched pages during loading without an active viewport refill", () => {
    const commitVisibleArticleCount = mock((_nextVisibleCount: number) => {});
    const hasPendingServerRevealRef = { current: false };
    const hasRequestedServerLoadRef = { current: false };
    const hasResolvedStandardViewportRevealRef = { current: false };
    const isStandardViewportRefillActiveRef = { current: false };
    const lastInvertedAwayBoundarySnapshotRef = { current: "snapshot" };
    const lastInvertedScrollTopRef = { current: 0 };
    const previousFilteredFeedLengthRef = { current: 8 };
    const setIsPendingServerRevealVisible =
      createPendingServerRevealVisibilitySetter();
    const startServerLoadRearmCooldown = mock(() => {});
    const visibleArticleCountRef = { current: 8 };

    renderHook(() => {
      useFeedPaginationRevealCountEffect({
        commitVisibleArticleCount,
        filteredFeedLength: 12,
        hasPendingServerRevealRef,
        hasRequestedServerLoadRef,
        hasResolvedStandardViewportRevealRef,
        isInvertedScroll: false,
        isLoadingMore: true,
        isStandardViewportRefillActiveRef,
        lastInvertedAwayBoundarySnapshotRef,
        lastInvertedScrollTopRef,
        previousFilteredFeedLengthRef,
        setIsPendingServerRevealVisible,
        startServerLoadRearmCooldown,
        visibleArticleCountRef,
      });
    });

    expect(commitVisibleArticleCount).not.toHaveBeenCalled();
    expect(previousFilteredFeedLengthRef.current).toBe(12);
    expect(setIsPendingServerRevealVisible).not.toHaveBeenCalled();
    expect(startServerLoadRearmCooldown).not.toHaveBeenCalled();
  });

  test("preserves the current visible window size when a standard viewport refill settles", () => {
    const commitVisibleArticleCount = mock((_nextVisibleCount: number) => {});
    const hasPendingServerRevealRef = { current: true };
    const hasRequestedServerLoadRef = { current: true };
    const hasResolvedStandardViewportRevealRef = { current: false };
    const isStandardViewportRefillActiveRef = { current: true };
    const lastInvertedAwayBoundarySnapshotRef = { current: null };
    const lastInvertedScrollTopRef = { current: null };
    const previousFilteredFeedLengthRef = { current: 4 };
    const setIsPendingServerRevealVisible =
      createPendingServerRevealVisibilitySetter();
    const startServerLoadRearmCooldown = mock(() => {});
    const visibleArticleCountRef = { current: 8 };

    renderHook(() => {
      useFeedPaginationRevealCountEffect({
        commitVisibleArticleCount,
        filteredFeedLength: 10,
        hasPendingServerRevealRef,
        hasRequestedServerLoadRef,
        hasResolvedStandardViewportRevealRef,
        isInvertedScroll: false,
        isLoadingMore: false,
        isStandardViewportRefillActiveRef,
        lastInvertedAwayBoundarySnapshotRef,
        lastInvertedScrollTopRef,
        previousFilteredFeedLengthRef,
        setIsPendingServerRevealVisible,
        startServerLoadRearmCooldown,
        visibleArticleCountRef,
      });
    });

    expect(commitVisibleArticleCount).not.toHaveBeenCalled();

    renderHook(() => {
      useFeedPaginationRevealCountEffect({
        commitVisibleArticleCount,
        filteredFeedLength: 10,
        hasPendingServerRevealRef: { current: false },
        hasRequestedServerLoadRef: { current: false },
        hasResolvedStandardViewportRevealRef,
        isInvertedScroll: false,
        isLoadingMore: true,
        isStandardViewportRefillActiveRef,
        lastInvertedAwayBoundarySnapshotRef,
        lastInvertedScrollTopRef,
        previousFilteredFeedLengthRef,
        setIsPendingServerRevealVisible,
        startServerLoadRearmCooldown,
        visibleArticleCountRef,
      });
    });

    expect(commitVisibleArticleCount).toHaveBeenCalledWith(8);
    expect(hasResolvedStandardViewportRevealRef.current).toBe(true);
    expect(startServerLoadRearmCooldown).toHaveBeenCalledTimes(1);
  });

  test("keeps the pending inverted reveal armed while the next page is still loading", () => {
    const commitVisibleArticleCount = mock((_nextVisibleCount: number) => {});
    const hasPendingServerRevealRef = { current: true };
    const hasRequestedServerLoadRef = { current: true };
    const hasResolvedStandardViewportRevealRef = { current: false };
    const isStandardViewportRefillActiveRef = { current: false };
    const lastInvertedAwayBoundarySnapshotRef = { current: "snapshot" };
    const lastInvertedScrollTopRef = { current: 0 };
    const previousFilteredFeedLengthRef = { current: 12 };
    const setIsPendingServerRevealVisible =
      createPendingServerRevealVisibilitySetter();
    const startServerLoadRearmCooldown = mock(() => {});
    const visibleArticleCountRef = { current: 12 };

    renderHook(() => {
      useFeedPaginationRevealCountEffect({
        commitVisibleArticleCount,
        filteredFeedLength: 16,
        hasPendingServerRevealRef,
        hasRequestedServerLoadRef,
        hasResolvedStandardViewportRevealRef,
        isInvertedScroll: true,
        isLoadingMore: true,
        isStandardViewportRefillActiveRef,
        lastInvertedAwayBoundarySnapshotRef,
        lastInvertedScrollTopRef,
        previousFilteredFeedLengthRef,
        setIsPendingServerRevealVisible,
        startServerLoadRearmCooldown,
        visibleArticleCountRef,
      });
    });

    expect(commitVisibleArticleCount).not.toHaveBeenCalled();
    expect(previousFilteredFeedLengthRef.current).toBe(16);
    expect(hasPendingServerRevealRef.current).toBe(true);
    expect(lastInvertedAwayBoundarySnapshotRef.current).toBe("snapshot");
    expect(lastInvertedScrollTopRef.current).toBe(0);
    expect(setIsPendingServerRevealVisible).not.toHaveBeenCalled();
    expect(startServerLoadRearmCooldown).not.toHaveBeenCalled();
  });
});
