import type { Dispatch, SetStateAction } from "react";

import { renderHook } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";

import { useBackfillDepletedRevealedPageEffect } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationActions";
import {
  useFeedPaginationLoadingMoreRevealEffect,
  useFeedPaginationQueryResetEffect,
  useFeedPaginationRefreshResetEffect,
  useFeedPaginationRevealCountEffect,
  useInitialFeedPaginationAutoFillEffect,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationVisibilityEffects";

type LoadingMoreRevealEffectOptions = Parameters<
  typeof useFeedPaginationLoadingMoreRevealEffect
>[0];

function createOptions(
  overrides: Partial<LoadingMoreRevealEffectOptions> = {},
): LoadingMoreRevealEffectOptions {
  return {
    canLoadMoreFromServer: true,
    filteredFeedLength: 12,
    hasCompletedInvertedServerRevealRef: { current: false },
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
    expect(options.lastInvertedAwayBoundarySnapshotRef.current).toBe(
      "snapshot",
    );
    expect(options.lastInvertedScrollTopRef.current).toBe(0);
    expect(options.startServerLoadRearmCooldown).not.toHaveBeenCalled();
  });

  test("keeps the standard pending reveal armed while the new page has not appeared yet", () => {
    const options = createOptions({
      isInvertedScroll: false,
      lastInvertedAwayBoundarySnapshotRef: { current: null },
      lastInvertedScrollTopRef: { current: null },
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

    expect(options.hasPendingServerRevealRef.current).toBe(true);
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
    expect(options.hasCompletedInvertedServerRevealRef.current).toBe(true);
    expect(options.lastInvertedAwayBoundarySnapshotRef.current).toBeNull();
    expect(options.lastInvertedScrollTopRef.current).toBeNull();
    expect(options.startServerLoadRearmCooldown).toHaveBeenCalledTimes(1);
  });

  test("completes a settled pending reveal when server capacity ends after loading", () => {
    const options = createOptions({
      canLoadMoreFromServer: false,
      isLoadingMore: false,
      previousIsLoadingMoreRef: { current: false },
    });

    renderHook((currentOptions: LoadingMoreRevealEffectOptions) => {
      useFeedPaginationLoadingMoreRevealEffect(currentOptions);
    }, {
      initialProps: options,
    });

    expect(options.hasPendingServerRevealRef.current).toBe(false);
    expect(options.startServerLoadRearmCooldown).toHaveBeenCalledTimes(1);
  });

});

describe("useBackfillDepletedRevealedPageEffect", () => {
  test("does not request a server refill for an initially under-threshold unread page", () => {
    const requestMoreFromServer = mock(() => true);

    renderHook(() => {
      useBackfillDepletedRevealedPageEffect({
        articleFilter: "unread",
        articlesPerPage: 4,
        canLoadMoreFromServer: true,
        feedViewKey: "all-feeds:unread",
        filteredFeedLength: 4,
        hasPendingServerRevealRef: { current: false },
        hasRequestedServerLoadRef: { current: false },
        isInvertedScroll: false,
        primeInvertedPaginationAnchor: mock(() => {}),
        requestMoreFromServer,
        visibleArticleCountRef: { current: 4 },
      });
    });

    expect(requestMoreFromServer).not.toHaveBeenCalled();
  });

  test("requests one viewport refill when unread rows drop below the overflow threshold", () => {
    const requestMoreFromServer = mock(() => true);
    const sharedRefs = {
      hasPendingServerRevealRef: { current: false },
      hasRequestedServerLoadRef: { current: false },
      visibleArticleCountRef: { current: 7 },
    };

    const { rerender } = renderHook(
      ({ filteredFeedLength }: { filteredFeedLength: number }) => {
        useBackfillDepletedRevealedPageEffect({
          articleFilter: "unread",
          articlesPerPage: 4,
          canLoadMoreFromServer: true,
          feedViewKey: "all-feeds:unread",
          filteredFeedLength,
          hasPendingServerRevealRef: sharedRefs.hasPendingServerRevealRef,
          hasRequestedServerLoadRef: sharedRefs.hasRequestedServerLoadRef,
          isInvertedScroll: false,
          primeInvertedPaginationAnchor: mock(() => {}),
          requestMoreFromServer,
          visibleArticleCountRef: sharedRefs.visibleArticleCountRef,
        });
      },
      { initialProps: { filteredFeedLength: 7 } },
    );

    rerender({ filteredFeedLength: 4 });

    expect(requestMoreFromServer).toHaveBeenCalledTimes(1);
    expect(requestMoreFromServer).toHaveBeenCalledWith({
      isViewportRefill: true,
    });
  });

  test("resets depletion tracking when the feed view changes", () => {
    const requestMoreFromServer = mock(() => true);

    const { rerender } = renderHook(
      ({ feedViewKey, filteredFeedLength }) => {
        useBackfillDepletedRevealedPageEffect({
          articleFilter: "unread",
          articlesPerPage: 4,
          canLoadMoreFromServer: true,
          feedViewKey,
          filteredFeedLength,
          hasPendingServerRevealRef: { current: false },
          hasRequestedServerLoadRef: { current: false },
          isInvertedScroll: false,
          primeInvertedPaginationAnchor: mock(() => {}),
          requestMoreFromServer,
          visibleArticleCountRef: { current: 4 },
        });
      },
      {
        initialProps: {
          feedViewKey: "all-feeds:unread",
          filteredFeedLength: 10,
        },
      },
    );

    rerender({
      feedViewKey: "local:unread",
      filteredFeedLength: 4,
    });

    expect(requestMoreFromServer).not.toHaveBeenCalled();
  });

  test("treats a sort switch as a new depletion scope before requesting refill", () => {
    const requestMoreFromServer = mock(() => true);
    const sharedRefs = {
      hasPendingServerRevealRef: { current: false },
      hasRequestedServerLoadRef: { current: false },
      visibleArticleCountRef: { current: 7 },
    };

    const { rerender } = renderHook(
      ({ feedViewKey, filteredFeedLength }) => {
        useBackfillDepletedRevealedPageEffect({
          articleFilter: "unread",
          articlesPerPage: 4,
          canLoadMoreFromServer: true,
          feedViewKey,
          filteredFeedLength,
          hasPendingServerRevealRef: sharedRefs.hasPendingServerRevealRef,
          hasRequestedServerLoadRef: sharedRefs.hasRequestedServerLoadRef,
          isInvertedScroll: false,
          primeInvertedPaginationAnchor: mock(() => {}),
          requestMoreFromServer,
          visibleArticleCountRef: sharedRefs.visibleArticleCountRef,
        });
      },
      {
        initialProps: {
          feedViewKey: "all-feeds:unread:newest",
          filteredFeedLength: 9,
        },
      },
    );

    rerender({
      feedViewKey: "all-feeds:unread:oldest",
      filteredFeedLength: 5,
    });
    expect(requestMoreFromServer).not.toHaveBeenCalled();

    rerender({
      feedViewKey: "all-feeds:unread:oldest",
      filteredFeedLength: 4,
    });

    expect(requestMoreFromServer).toHaveBeenCalledTimes(1);
    expect(requestMoreFromServer).toHaveBeenCalledWith({
      isViewportRefill: true,
    });
  });
});

describe("useFeedPaginationQueryResetEffect", () => {
  test("does not reset pagination on the initial mount", () => {
    const resetPaginationState = mock(() => {});

    renderHook(() => {
      useFeedPaginationQueryResetEffect({
        articleFilter: "all",
        articlesPerPage: 8,
        feedViewKey: "preview-all",
        isInvertedScroll: false,
        resetPaginationState,
        searchTerm: "",
        suppressNextInitialViewportAutoFillRef: { current: false },
        suppressNextRefreshViewportRefillRef: { current: false },
      });
    });

    expect(resetPaginationState).not.toHaveBeenCalled();
  });

  test("resets pagination after the page-size setting changes", () => {
    const resetPaginationState = mock(() => {});
    const suppressNextInitialViewportAutoFillRef = { current: false };

    const { rerender } = renderHook(
      (articlesPerPage: number) => {
        useFeedPaginationQueryResetEffect({
          articleFilter: "all",
          articlesPerPage,
          feedViewKey: "preview-all",
          isInvertedScroll: false,
          resetPaginationState,
          searchTerm: "",
          suppressNextInitialViewportAutoFillRef,
          suppressNextRefreshViewportRefillRef: { current: false },
        });
      },
      { initialProps: 8 },
    );

    rerender(4);

    expect(resetPaginationState).toHaveBeenCalledTimes(1);
    expect(suppressNextInitialViewportAutoFillRef.current).toBe(true);
  });

  test("keeps unread query resets at the one-page baseline for the same refresh cycle", () => {
    const resetPaginationState = mock(() => {});
    const suppressNextInitialViewportAutoFillRef = { current: false };
    const suppressNextRefreshViewportRefillRef = { current: false };
    const previousRefreshEpochRef = { current: 0 };
    const isStandardViewportRefillActiveRef = { current: false };
    const standardViewportRefillTargetVisibleCountRef: {
      current: null | number;
    } = { current: null };

    const { rerender } = renderHook(
      ({ articlesPerPage, isRefreshing, refreshEpoch }) => {
        useFeedPaginationQueryResetEffect({
          articleFilter: "unread",
          articlesPerPage,
          feedViewKey: "preview-all",
          isInvertedScroll: false,
          resetPaginationState,
          searchTerm: "",
          suppressNextInitialViewportAutoFillRef,
          suppressNextRefreshViewportRefillRef,
        });
        useFeedPaginationRefreshResetEffect({
          articleFilter: "unread",
          articlesPerPage,
          hasUserScrolledRef: { current: false },
          isInvertedScroll: false,
          isLoadingMore: false,
          isRefreshing,
          isStandardViewportRefillActiveRef,
          previousRefreshEpochRef,
          refreshEpoch,
          resetPaginationState,
          standardViewportRefillTargetVisibleCountRef,
          suppressNextRefreshViewportRefillRef,
        });
      },
      {
        initialProps: {
          articlesPerPage: 8,
          isRefreshing: false,
          refreshEpoch: 0,
        },
      },
    );

    rerender({
      articlesPerPage: 4,
      isRefreshing: true,
      refreshEpoch: 1,
    });

    expect(resetPaginationState).toHaveBeenCalledTimes(2);
    expect(isStandardViewportRefillActiveRef.current).toBe(false);
    expect(standardViewportRefillTargetVisibleCountRef.current).toBeNull();
    expect(suppressNextRefreshViewportRefillRef.current).toBe(false);
  });

  test("keeps ordinary unread refreshes at the one-page baseline until user scroll or depletion owns refill", () => {
    const resetPaginationState = mock(() => {});
    const isStandardViewportRefillActiveRef = { current: false };
    const previousRefreshEpochRef = { current: 0 };
    const standardViewportRefillTargetVisibleCountRef: {
      current: null | number;
    } = { current: null };

    const { rerender } = renderHook(
      ({ refreshEpoch }) => {
        useFeedPaginationRefreshResetEffect({
          articleFilter: "unread",
          articlesPerPage: 4,
          hasUserScrolledRef: { current: false },
          isInvertedScroll: false,
          isLoadingMore: false,
          isRefreshing: true,
          isStandardViewportRefillActiveRef,
          previousRefreshEpochRef,
          refreshEpoch,
          resetPaginationState,
          standardViewportRefillTargetVisibleCountRef,
          suppressNextRefreshViewportRefillRef: { current: false },
        });
      },
      { initialProps: { refreshEpoch: 0 } },
    );

    rerender({ refreshEpoch: 1 });

    expect(resetPaginationState).toHaveBeenCalledTimes(1);
    expect(isStandardViewportRefillActiveRef.current).toBe(false);
    expect(standardViewportRefillTargetVisibleCountRef.current).toBeNull();
  });

  test("does not arm the refresh-owned overflow target for non-unread refreshes", () => {
    const resetPaginationState = mock(() => {});
    const isStandardViewportRefillActiveRef = { current: false };
    const previousRefreshEpochRef = { current: 0 };
    const standardViewportRefillTargetVisibleCountRef: {
      current: null | number;
    } = { current: null };

    const { rerender } = renderHook(
      ({ refreshEpoch }) => {
        useFeedPaginationRefreshResetEffect({
          articleFilter: "all",
          articlesPerPage: 4,
          hasUserScrolledRef: { current: false },
          isInvertedScroll: false,
          isLoadingMore: false,
          isRefreshing: true,
          isStandardViewportRefillActiveRef,
          previousRefreshEpochRef,
          refreshEpoch,
          resetPaginationState,
          standardViewportRefillTargetVisibleCountRef,
          suppressNextRefreshViewportRefillRef: { current: false },
        });
      },
      { initialProps: { refreshEpoch: 0 } },
    );

    rerender({ refreshEpoch: 1 });

    expect(resetPaginationState).toHaveBeenCalledTimes(1);
    expect(isStandardViewportRefillActiveRef.current).toBe(false);
    expect(standardViewportRefillTargetVisibleCountRef.current).toBeNull();
  });
});

describe("useInitialFeedPaginationAutoFillEffect", () => {
  test("consumes a pending query-reset auto-fill suppression before scheduling viewport growth", () => {
    const maybeAutoFillViewport = mock(() => {});
    const suppressNextInitialViewportAutoFillRef = { current: true };

    renderHook(
      ({ visibleArticleCount }) => {
        useInitialFeedPaginationAutoFillEffect({
          filteredFeedLength: 12,
          isInitialLoading: false,
          maybeAutoFillViewport,
          scrollViewport: document.createElement("div"),
          shouldUseVirtualizedFeed: true,
          suppressNextInitialViewportAutoFillRef,
          visibleArticleCount,
        });
      },
      { initialProps: { visibleArticleCount: 4 } },
    );

    expect(maybeAutoFillViewport).not.toHaveBeenCalled();
    expect(suppressNextInitialViewportAutoFillRef.current).toBe(false);
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
        hasCompletedInvertedServerRevealRef: { current: false },
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
        hasCompletedInvertedServerRevealRef: { current: false },
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
        hasCompletedInvertedServerRevealRef: { current: false },
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

  test("completes a standard viewport refill reveal even when the unread total stays below the previous cycle", () => {
    const commitVisibleArticleCount = mock((_nextVisibleCount: number) => {});
    const hasPendingServerRevealRef = { current: true };
    const hasRequestedServerLoadRef = { current: true };
    const hasResolvedStandardViewportRevealRef = { current: false };
    const isStandardViewportRefillActiveRef = { current: true };
    const lastInvertedAwayBoundarySnapshotRef = { current: null };
    const lastInvertedScrollTopRef = { current: null };
    const previousFilteredFeedLengthRef = { current: 7 };
    const setIsPendingServerRevealVisible =
      createPendingServerRevealVisibilitySetter();
    const startServerLoadRearmCooldown = mock(() => {});
    const visibleArticleCountRef = { current: 2 };

    renderHook(() => {
      useFeedPaginationRevealCountEffect({
        commitVisibleArticleCount,
        filteredFeedLength: 6,
        hasCompletedInvertedServerRevealRef: { current: false },
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
    expect(hasPendingServerRevealRef.current).toBe(false);
    expect(hasResolvedStandardViewportRevealRef.current).toBe(true);
    expect(previousFilteredFeedLengthRef.current).toBe(6);
    expect(startServerLoadRearmCooldown).toHaveBeenCalledTimes(1);
    expect(setIsPendingServerRevealVisible).toHaveBeenCalledWith(false);
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
        hasCompletedInvertedServerRevealRef: { current: false },
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
