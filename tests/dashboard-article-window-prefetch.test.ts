import { describe, expect, mock, test } from "bun:test";

import {
  prefetchArticleWindowLimitIfNeeded,
  resetArticleWindowPrefetchState,
} from "@/app/dashboard/dashboard-hooks/dashboard-controller/dashboardArticleWindowPrefetchState";

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
      const previousLimit = stepIndex === 0 ? 0 : [8, 12, 16, 20][stepIndex - 1];
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