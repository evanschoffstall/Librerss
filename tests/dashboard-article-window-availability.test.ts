import { describe, expect, test } from "bun:test";

import {
  resolveArticleWindowAvailability,
  shouldBlockArticleWindowLoadMore,
  shouldRefillDepletedUnreadWindow,
} from "@/app/dashboard/dashboard-services/article";

describe("dashboard article window availability", () => {
  test("disables server pagination completely when the article window is inactive", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 12,
        hasStartedAwaitedWindowSettlement: false,
        isAwaitingWindowSettlement: false,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 0,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 12,
        shouldUseArticleWindow: false,
      }),
    ).toEqual({
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("keeps the previous availability signal while an awaited window is still loading", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 6,
        hasStartedAwaitedWindowSettlement: false,
        isAwaitingWindowSettlement: true,
        isLoading: true,
        isLoadingMoreArticles: false,
        previousFeedLength: 0,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 12,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    });
  });

  test("treats partial growth during settlement as proof that more server articles remain", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: true,
        currentFeedLength: 14,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 12,
        previousHasMoreServerArticles: false,
        requestedArticleLimit: 24,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("marks the source exhausted once a settled awaited window returns fewer items than requested", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 11,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 8,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 12,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("preserves availability for preview-mode unread settlements that stay below the requested limit", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        articlesPerPage: 4,
        currentFeedLength: 6,
        currentFilteredFeedLength: 6,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        preservePartialFilteredWindowAvailability: true,
        previousFeedLength: 6,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 8,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("keeps unread pagination alive when visible-read refill restores the filtered window without growing total rows", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: true,
        articlesPerPage: 4,
        currentFeedLength: 24,
        currentFilteredFeedLength: 5,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        preservePartialFilteredWindowAvailability: true,
        previousFeedLength: 24,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 29,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("marks unread pagination exhausted when refill cannot restore the minimum filtered window", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: true,
        articlesPerPage: 4,
        currentFeedLength: 24,
        currentFilteredFeedLength: 4,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        preservePartialFilteredWindowAvailability: true,
        previousFeedLength: 24,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 29,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("preserves the previous availability signal until the next awaited fetch settles", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 11,
        hasStartedAwaitedWindowSettlement: false,
        isAwaitingWindowSettlement: false,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 12,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 12,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    });
  });

  test("blocks load-more while the live article window is still booting or already busy", () => {
    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 0,
        hasMoreServerArticles: true,
        isCategoriesLoading: false,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 12,
        hasMoreServerArticles: true,
        isCategoriesLoading: true,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 12,
        hasMoreServerArticles: false,
        isCategoriesLoading: false,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 12,
        hasMoreServerArticles: true,
        isCategoriesLoading: false,
        isLoadingMoreArticles: true,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 12,
        hasMoreServerArticles: true,
        isCategoriesLoading: false,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);
  });

  test("only refills an unread window when local read updates emptied the filtered view", () => {
    // Filtered count dropped below threshold and no in-flight operations: refill fires.
    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "unread",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 4,
        hasMoreServerArticles: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        isRefillingDepletedUnreadWindow: false,
        previousFilteredFeedLength: 8,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    // Initial hydration can naturally return fewer unread articles than the
    // threshold. That is not a local read-state depletion and must not refill.
    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "unread",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 4,
        hasMoreServerArticles: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        isRefillingDepletedUnreadWindow: false,
        previousFilteredFeedLength: 4,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);

    // Wrong filter: refill must only fire for the "unread" filter.
    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "all",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 0,
        hasMoreServerArticles: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        isRefillingDepletedUnreadWindow: false,
        previousFilteredFeedLength: 4,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);

    // Count at or above threshold: no refill needed.
    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "unread",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 5,
        hasMoreServerArticles: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        isRefillingDepletedUnreadWindow: false,
        previousFilteredFeedLength: 8,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);
  });

  test("blocks unread refill while a concurrent scroll load-more fetch is in-flight", () => {
    // A scroll-triggered load-more is already running (isLoadingMoreArticles = true).
    // A new server refill must not start to prevent duplicate concurrent fetches and
    // the keepExistingFeed race that could produce a stale-article overwrite.
    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "unread",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 4,
        hasMoreServerArticles: true,
        isLoading: false,
        isLoadingMoreArticles: true,
        isRefillingDepletedUnreadWindow: false,
        previousFilteredFeedLength: 8,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);
  });

  test("resumes unread refill once the concurrent load-more fetch clears", () => {
    // Both the load-more and refill flags are clear: refill is now eligible.
    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "unread",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 4,
        hasMoreServerArticles: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        isRefillingDepletedUnreadWindow: false,
        previousFilteredFeedLength: 8,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);
  });

  test("blocks a second refill while a prior refill fetch is still in-flight", () => {
    // isRefillingDepletedUnreadWindow is set to true by refillDashboardArticleWindow
    // before the fetch starts, preventing re-entry until the .finally() callback clears it.
    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "unread",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 4,
        hasMoreServerArticles: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        isRefillingDepletedUnreadWindow: true,
        previousFilteredFeedLength: 8,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);
  });
});

/**
 * Regression tests for the background-fetch settlement race condition.
 *
 * Load-more fetches use `keepExistingFeed: true`, making them background requests
 * that never set `isLoading = true`. Without the `isLoadingMoreArticles` guard in
 * `resolveArticleWindowAvailability`, settlement resolves immediately with stale
 * `currentFeedLength` (before the fetch completes), prematurely marking the server
 * as exhausted and removing the scroll sentinel.
 *
 * Each test in this group exercises a specific point in the load-more lifecycle:
 * 1. Handler fires → sets `isLoadingMoreArticles = true`, `hasStarted = true`
 * 2. React re-renders with new `requestedArticleLimit` but stale `currentFeedLength`
 * 3. Fetch starts (background, `isLoading` stays false)
 * 4. Fetch completes → `.finally()` clears `isLoadingMoreArticles`
 * 5. React re-renders with updated `currentFeedLength`
 */
describe("background-fetch settlement race condition guard", () => {
  test("defers settlement while a background load-more fetch is in-flight and feed length is stale", () => {
    /*
     * Simulates step 2: React rendered with requestedArticleLimit=36 but the
     * background fetch hasn't completed yet (isLoadingMoreArticles=true) and
     * currentFeedLength (24) still equals the snapshot taken when the request
     * started (previousFeedLength=24).
     *
     * Without the guard, this would settle with hasMoreServerArticles=false
     * because 24 < 36. With the guard, it preserves the previous value (true).
     */
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 24,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: true,
        previousFeedLength: 24,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 36,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    });
  });

  test("resolves settlement correctly after the fetch completes and feed grew to match the limit", () => {
    /*
     * Simulates step 5: The fetch completed (isLoadingMoreArticles=false) and
     * currentFeedLength grew to match requestedArticleLimit. Settlement should
     * resolve with hasMoreServerArticles=true.
     */
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 36,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 24,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 36,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("resolves settlement with false when the fetch completes but the server was exhausted", () => {
    /*
     * Simulates step 4→5 when the server has no more articles: the fetch
     * completed (isLoadingMoreArticles=false) but currentFeedLength didn't
     * grow to requestedArticleLimit. This is genuine exhaustion, not a race.
     */
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 24,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: false,
        previousFeedLength: 24,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 36,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("allows settlement when feed grew during a background fetch even if still in-flight", () => {
    /*
     * Edge case: if the feed length grew beyond the previous snapshot while
     * the fetch is still technically in-flight (streaming response or React
     * Query cache update arrived before .finally()), the guard should pass
     * through because the data is already fresher than the snapshot.
     */
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 30,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: true,
        previousFeedLength: 24,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 36,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("allows settlement with partial growth recognition when feed grew during a background fetch", () => {
    /*
     * Same scenario as above but with allowPartialFeedGrowth=true (used by
     * the refill path). Even though currentFeedLength < requestedArticleLimit,
     * the partial growth flag recognizes that the feed grew and resolves
     * settlement with hasMoreServerArticles=true.
     */
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: true,
        currentFeedLength: 30,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: true,
        previousFeedLength: 24,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 36,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("preserves availability when the settlement has not started yet despite a background fetch being in-flight", () => {
    /*
     * Simulates step 1→2 where hasStartedAwaitedWindowSettlement is false
     * (the settlement lifecycle hasn't been kicked off yet). The guard is
     * not needed here because the pre-existing !hasStarted check handles it,
     * but this test verifies the two guards compose correctly.
     */
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 24,
        hasStartedAwaitedWindowSettlement: false,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        isLoadingMoreArticles: true,
        previousFeedLength: 24,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 36,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    });
  });

  test("simulates the full race condition lifecycle across multiple effect cycles", () => {
    /*
     * End-to-end lifecycle simulation of 3 sequential availability effect
     * runs during a single load-more cycle:
     *
     * Cycle 1: Handler fired, requestedArticleLimit bumped, fetch in-flight
     * Cycle 2: Fetch completed (isLoadingMoreArticles=false), feed grew
     * Cycle 3: Settlement cleared, normal state
     *
     * This test verifies no intermediate state produces a premature false.
     */

    /* Cycle 1: Immediately after handler, fetch in-flight. */
    const cycle1 = resolveArticleWindowAvailability({
      allowPartialFeedGrowth: false,
      currentFeedLength: 24,
      hasStartedAwaitedWindowSettlement: true,
      isAwaitingWindowSettlement: true,
      isLoading: false,
      isLoadingMoreArticles: true,
      previousFeedLength: 24,
      previousHasMoreServerArticles: true,
      requestedArticleLimit: 36,
      shouldUseArticleWindow: true,
    });

    expect(cycle1).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    });

    /* Cycle 2: Fetch completed, feed grew to match limit. */
    const cycle2 = resolveArticleWindowAvailability({
      allowPartialFeedGrowth: false,
      currentFeedLength: 36,
      hasStartedAwaitedWindowSettlement: true,
      isAwaitingWindowSettlement: true,
      isLoading: false,
      isLoadingMoreArticles: false,
      previousFeedLength: 24,
      previousHasMoreServerArticles: cycle1.hasMoreServerArticles,
      requestedArticleLimit: 36,
      shouldUseArticleWindow: true,
    });

    expect(cycle2).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    });

    /* Cycle 3: Settlement cleared, normal steady state. */
    const cycle3 = resolveArticleWindowAvailability({
      allowPartialFeedGrowth: false,
      currentFeedLength: 36,
      hasStartedAwaitedWindowSettlement: false,
      isAwaitingWindowSettlement: false,
      isLoading: false,
      isLoadingMoreArticles: false,
      previousFeedLength: 24,
      previousHasMoreServerArticles: cycle2.hasMoreServerArticles,
      requestedArticleLimit: 36,
      shouldUseArticleWindow: true,
    });

    expect(cycle3).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    });
  });

  test("simulates full lifecycle when the server is exhausted", () => {
    /*
     * Same 3-cycle simulation, but the server returns fewer articles than
     * requested (server exhausted). The guard must defer until the fetch
     * completes, then correctly resolve with false.
     */

    /* Cycle 1: Fetch in-flight, feed length stale. */
    const cycle1 = resolveArticleWindowAvailability({
      allowPartialFeedGrowth: false,
      currentFeedLength: 24,
      hasStartedAwaitedWindowSettlement: true,
      isAwaitingWindowSettlement: true,
      isLoading: false,
      isLoadingMoreArticles: true,
      previousFeedLength: 24,
      previousHasMoreServerArticles: true,
      requestedArticleLimit: 36,
      shouldUseArticleWindow: true,
    });

    expect(cycle1).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    });

    /* Cycle 2: Fetch completed, feed didn't grow (server exhausted). */
    const cycle2 = resolveArticleWindowAvailability({
      allowPartialFeedGrowth: false,
      currentFeedLength: 24,
      hasStartedAwaitedWindowSettlement: true,
      isAwaitingWindowSettlement: true,
      isLoading: false,
      isLoadingMoreArticles: false,
      previousFeedLength: 24,
      previousHasMoreServerArticles: cycle1.hasMoreServerArticles,
      requestedArticleLimit: 36,
      shouldUseArticleWindow: true,
    });

    expect(cycle2).toEqual({
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    });
  });
});
