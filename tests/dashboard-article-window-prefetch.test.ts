import type { SetStateAction } from "react";

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { ArticleSortOrder } from "@/lib/core";

import { refillDashboardArticleWindow } from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardArticleWindowPaging";
import {
  prefetchArticleWindowLimitIfNeeded,
  resetArticleWindowPrefetchState,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardArticleWindowPrefetchState";
import { useUnreadWindowRefill } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardArticleWindowEffects";
import { useDashboardArticleWindowPrefetch } from "@/app/dashboard/dashboard-hooks/dashboard-controller/useDashboardArticleWindowPrefetch";
import { ALL_FEEDS_NODE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";

interface DeferredPromise {
  promise: Promise<void>;
  reject: (reason?: unknown) => void;
  resolve: () => void;
}

function createDeferredPromise(): DeferredPromise {
  let resolve = () => {};
  let reject = (_reason?: unknown) => {};
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function createPrefetchRefs() {
  return {
    inFlightPrefetchedLimitRef: { current: 0 },
    lastPrefetchedLimitRef: { current: 0 },
  };
}

describe("article-window prefetch tracking", () => {
  test("tracks four pagination prefetches only after each cache warm completes", async () => {
    const refs = createPrefetchRefs();
    const deferredByLimit = new Map<number, DeferredPromise>();
    const prefetchNextPage = mock((nextLimit: number) => {
      const deferred = createDeferredPromise();
      deferredByLimit.set(nextLimit, deferred);
      return deferred.promise;
    });

    for (const [stepIndex, nextLimit] of [8, 12, 16, 20].entries()) {
      const previousLimit =
        stepIndex === 0 ? 0 : [8, 12, 16, 20][stepIndex - 1];
      const pendingPrefetch = prefetchArticleWindowLimitIfNeeded(
        nextLimit,
        refs,
        prefetchNextPage,
      );

      expect(refs.inFlightPrefetchedLimitRef.current).toBe(nextLimit);
      expect(refs.lastPrefetchedLimitRef.current).toBe(previousLimit);
      expect(
        await prefetchArticleWindowLimitIfNeeded(
          nextLimit,
          refs,
          prefetchNextPage,
        ),
      ).toBe(false);

      deferredByLimit.get(nextLimit)?.resolve();
      expect(await pendingPrefetch).toBe(true);
      expect(refs.inFlightPrefetchedLimitRef.current).toBe(0);
      expect(refs.lastPrefetchedLimitRef.current).toBe(nextLimit);
    }

    expect(prefetchNextPage).toHaveBeenCalledTimes(4);
  });

  test("retries the same page after a failed prefetch instead of treating it as cached", async () => {
    const refs = createPrefetchRefs();
    const firstAttempt = createDeferredPromise();
    const secondAttempt = createDeferredPromise();
    const prefetchNextPage = mock(() => {
      return prefetchNextPage.mock.calls.length === 1
        ? firstAttempt.promise
        : secondAttempt.promise;
    });

    const failedPrefetch = prefetchArticleWindowLimitIfNeeded(
      8,
      refs,
      prefetchNextPage,
    );

    expect(refs.inFlightPrefetchedLimitRef.current).toBe(8);
    expect(refs.lastPrefetchedLimitRef.current).toBe(0);

    firstAttempt.reject(new Error("prefetch failed"));
    await expect(failedPrefetch).rejects.toThrow("prefetch failed");

    expect(refs.inFlightPrefetchedLimitRef.current).toBe(0);
    expect(refs.lastPrefetchedLimitRef.current).toBe(0);

    const successfulRetry = prefetchArticleWindowLimitIfNeeded(
      8,
      refs,
      prefetchNextPage,
    );
    secondAttempt.resolve();
    expect(await successfulRetry).toBe(true);

    expect(prefetchNextPage).toHaveBeenCalledTimes(2);
    expect(refs.lastPrefetchedLimitRef.current).toBe(8);

    resetArticleWindowPrefetchState(refs);
    expect(refs.inFlightPrefetchedLimitRef.current).toBe(0);
    expect(refs.lastPrefetchedLimitRef.current).toBe(0);
  });
});

describe("refillDashboardArticleWindow", () => {
  test("advances a depleted unread refill by exactly one configured page", async () => {
    const fetchAllFeeds = mock(async () => {});
    const setIsLoadingMoreArticles = mock(
      (_value: SetStateAction<boolean>) => {},
    );
    const setRequestedArticleLimit = mock(
      (_value: SetStateAction<number>) => {},
    );
    const isLoadingMoreArticlesRef = { current: false };
    const isRefillingDepletedUnreadWindowRef = { current: false };

    refillDashboardArticleWindow({
      allowPartialArticleWindowGrowthRef: { current: false },
      articleLimit: 24,
      articlesPerPage: 4,
      currentFeedLength: 24,
      fetchAllFeeds,
      fetchCategoryFeeds: mock(async () => {}),
      fetchFeed: mock(async () => {}),
      hasStartedArticleWindowSettlementRef: { current: false },
      isAwaitingArticleWindowSettlementRef: { current: false },
      isLoadingMoreArticlesRef,
      isRefillingDepletedUnreadWindowRef,
      previousAwaitedFeedLengthRef: { current: 0 },
      selectedCategory: ALL_FEEDS_NODE_KEY,
      setIsLoadingMoreArticles,
      setRequestedArticleLimit,
    });

    expect(setRequestedArticleLimit).toHaveBeenCalledWith(28);
    expect(fetchAllFeeds).toHaveBeenCalledWith(undefined, {
      articleLimit: 28,
      forceRefresh: false,
      keepExistingFeed: true,
      requestSource: "feed-scroll-load-more",
      searchTerm: undefined,
      skipRefresh: true,
    });
    expect(isLoadingMoreArticlesRef.current).toBe(true);
    expect(isRefillingDepletedUnreadWindowRef.current).toBe(true);

    await waitFor(() => {
      expect(isLoadingMoreArticlesRef.current).toBe(false);
      expect(isRefillingDepletedUnreadWindowRef.current).toBe(false);
    });
  });
});

describe("useUnreadWindowRefill", () => {
  test("resets its depletion baseline across sort changes before refilling", async () => {
    const fetchAllFeeds = mock(async () => {});
    const setIsLoadingMoreArticles = mock(
      (_value: SetStateAction<boolean>) => {},
    );
    const setRequestedArticleLimit = mock(
      (_value: SetStateAction<number>) => {},
    );
    const sharedRefs = {
      allowPartialArticleWindowGrowthRef: { current: false },
      hasStartedArticleWindowSettlementRef: { current: false },
      isAwaitingArticleWindowSettlementRef: { current: false },
      isLoadingMoreArticlesRef: { current: false },
      isRefillingDepletedUnreadWindowRef: { current: false },
      previousAwaitedFeedLengthRef: { current: 0 },
    };

    const { rerender } = renderHook(
      ({ articleSortOrder, currentFilteredFeedLength }) => {
        useUnreadWindowRefill({
          ...sharedRefs,
          articleFilter: "unread",
          articleSortOrder,
          articlesPerPage: 4,
          currentFeedLength: 24,
          currentFilteredFeedLength,
          fetchAllFeeds,
          fetchCategoryFeeds: mock(async () => {}),
          fetchFeed: mock(async () => {}),
          hasMoreServerArticles: true,
          isLoading: false,
          isLoadingMoreArticles: false,
          requestedArticleLimit: 24,
          selectedCategory: ALL_FEEDS_NODE_KEY,
          setIsLoadingMoreArticles,
          setRequestedArticleLimit,
          shouldUseArticleWindow: true,
        });
      },
      {
        initialProps: {
          articleSortOrder: "newest" as ArticleSortOrder,
          currentFilteredFeedLength: 9,
        },
      },
    );

    rerender({
      articleSortOrder: "oldest",
      currentFilteredFeedLength: 4,
    });

    expect(fetchAllFeeds).not.toHaveBeenCalled();

    rerender({
      articleSortOrder: "oldest",
      currentFilteredFeedLength: 3,
    });

    await waitFor(() => {
      expect(fetchAllFeeds).toHaveBeenCalledTimes(1);
    });
    expect(setRequestedArticleLimit).toHaveBeenCalledWith(28);
  });
});

/**
 * Regression tests for the three-concurrent-batch-request bug.
 *
 * On initial dashboard load with `articleFilter="unread"` and
 * `articlesPerPage=12`, React fires `useUnreadWindowRefill` (useEffect #4) and
 * `useArticleWindowPrefetchEffect` (useEffect #5) in the same commit.
 * `useUnreadWindowRefill` calls `refillDashboardArticleWindow`, which sets
 * `isLoadingMoreArticlesRef.current = true` **synchronously** before returning.
 * Without the guard in `useArticleWindowPrefetchEffect`, effect #5 then fires
 * a concurrent prefetch with a *different* articleLimit, racing the refill.
 *
 * The fix reads `isLoadingMoreArticlesRef.current` synchronously inside the
 * effect and returns early when it is true, deferring the prefetch until after
 * the refill clears the ref and a subsequent render re-triggers the effect.
 */
describe("isLoadingMoreArticlesRef guard in useArticleWindowPrefetchEffect", () => {
  const ALL_FEEDS_CATEGORY = "system-all-feeds";
  const ARTICLES_PER_PAGE = 12;

  /**
   * Returns a minimal set of refs and mock fetchers for the prefetch hook.
   * All feed selection fetchers are async mocks so the hook can be rendered
   * without a real React Query or network layer.
   */
  function createPrefetchHookOptions(overrides?: {
    isLoadingMoreArticlesRef?: { current: boolean };
    requestedArticleLimit?: number;
  }) {
    return {
      articlesPerPage: ARTICLES_PER_PAGE,
      hasMoreServerArticles: true,
      inFlightPrefetchedLimitRef: { current: 0 },
      isLoading: false,
      isLoadingMoreArticlesRef: overrides?.isLoadingMoreArticlesRef ?? {
        current: false,
      },
      lastPrefetchedLimitRef: { current: 0 },
      prefetchAllFeeds: mock(async () => {}),
      prefetchCategoryFeeds: mock(async () => {}),
      prefetchFeed: mock(async () => {}),
      requestedArticleLimit:
        overrides?.requestedArticleLimit ?? ARTICLES_PER_PAGE,
      selectedCategory: ALL_FEEDS_CATEGORY,
      selectedCategoryNode: undefined,
      selectedFeedUrl: undefined,
      shouldUseArticleWindow: true,
      usePlaceholderData: false,
    };
  }

  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  test("fires the next-page prefetch immediately when no refill is in-flight", async () => {
    // Baseline: no in-flight refill, isLoadingMoreArticlesRef.current = false.
    // The effect must schedule a prefetch for requestedArticleLimit + articlesPerPage.
    const options = createPrefetchHookOptions();

    renderHook(() => useDashboardArticleWindowPrefetch(options));

    await waitFor(() => {
      expect(options.prefetchAllFeeds).toHaveBeenCalledTimes(1);
    });

    type PrefetchCall = [
      categories: undefined,
      opts: {
        articleLimit: number;
        keepExistingFeed: boolean;
        skipRefresh: boolean;
      },
    ];
    const [, prefetchOptions] = (
      options.prefetchAllFeeds.mock.calls as unknown as PrefetchCall[]
    )[0];

    expect(prefetchOptions.articleLimit).toBe(ARTICLES_PER_PAGE * 2); // 12 + 12 = 24
    expect(prefetchOptions.keepExistingFeed).toBe(true);
    expect(prefetchOptions.skipRefresh).toBe(true);
  });

  test("blocks the next-page prefetch while isLoadingMoreArticlesRef is true", async () => {
    // Regression guard: when a refill or scroll load-more is already in-flight,
    // the prefetch effect must NOT dispatch a concurrent batch request.
    const isLoadingMoreArticlesRef = { current: true };
    const options = createPrefetchHookOptions({ isLoadingMoreArticlesRef });

    renderHook(() => useDashboardArticleWindowPrefetch(options));

    // Give effects ample time to settle; the guard must prevent any call.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(options.prefetchAllFeeds).not.toHaveBeenCalled();
    expect(options.prefetchCategoryFeeds).not.toHaveBeenCalled();
    expect(options.prefetchFeed).not.toHaveBeenCalled();
  });

  test("resumes the next-page prefetch after the refill clears isLoadingMoreArticlesRef", async () => {
    // Simulates the full initial-load sequence:
    //
    //  1. Render A: isLoadingMoreArticlesRef.current = true (refill in-flight),
    //               requestedArticleLimit = 12 → prefetch BLOCKED.
    //  2. Refill completes: isLoadingMoreArticlesRef.current = false,
    //     React state updates → requestedArticleLimit advances to 24.
    //  3. Render B: effect re-runs with the new requestedArticleLimit and the
    //               cleared ref → prefetch fires for 24 + 12 = 36.
    const isLoadingMoreArticlesRef = { current: true };
    const options = createPrefetchHookOptions({
      isLoadingMoreArticlesRef,
      requestedArticleLimit: ARTICLES_PER_PAGE,
    });

    const { rerender } = renderHook(
      ({ requestedArticleLimit }: { requestedArticleLimit: number }) =>
        useDashboardArticleWindowPrefetch({
          ...options,
          isLoadingMoreArticlesRef,
          requestedArticleLimit,
        }),
      { initialProps: { requestedArticleLimit: ARTICLES_PER_PAGE } },
    );

    // Guard fires: no prefetch while refill is in-flight.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(options.prefetchAllFeeds).not.toHaveBeenCalled();

    // Simulate the refill completing: clear the flag then trigger a rerender
    // by advancing requestedArticleLimit (as refillDashboardArticleWindow does
    // via setRequestedArticleLimit(24)).
    isLoadingMoreArticlesRef.current = false;
    rerender({ requestedArticleLimit: 24 });

    // Effect re-runs with the updated requestedArticleLimit and the cleared ref.
    await waitFor(() => {
      expect(options.prefetchAllFeeds).toHaveBeenCalledTimes(1);
    });

    type PrefetchCall = [categories: undefined, opts: { articleLimit: number }];
    const [, prefetchOptions] = (
      options.prefetchAllFeeds.mock.calls as unknown as PrefetchCall[]
    )[0];

    expect(prefetchOptions.articleLimit).toBe(36); // 24 + 12
  });

  test("does not fire a second prefetch when the refill guard clears but the limit was already prefetched", async () => {
    // After a scroll load-more, handleLoadMoreArticles sets
    // lastPrefetchedLimitRef.current = 36 (requestedArticleLimit=24 + 12).
    // If the guard then re-evaluates with requestedArticleLimit=24, the
    // nextLimit = 24 + 12 = 36 is already covered — no duplicate request.
    const isLoadingMoreArticlesRef = { current: true };
    const lastPrefetchedLimitRef = { current: 36 };
    const options = {
      ...createPrefetchHookOptions({ isLoadingMoreArticlesRef }),
      lastPrefetchedLimitRef,
      requestedArticleLimit: 24,
    };

    const { rerender } = renderHook(
      ({ requestedArticleLimit }: { requestedArticleLimit: number }) =>
        useDashboardArticleWindowPrefetch({
          ...options,
          isLoadingMoreArticlesRef,
          requestedArticleLimit,
        }),
      { initialProps: { requestedArticleLimit: 24 } },
    );

    isLoadingMoreArticlesRef.current = false;
    rerender({ requestedArticleLimit: 24 });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // nextLimit = 24 + 12 = 36, lastPrefetchedLimitRef.current = 36 → skipped.
    expect(options.prefetchAllFeeds).not.toHaveBeenCalled();
  });
});
