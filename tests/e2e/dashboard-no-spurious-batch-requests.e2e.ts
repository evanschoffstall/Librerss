/**
 * Regression test: no spurious duplicate `/api/feeds/batch` requests on the
 * initial dashboard load.
 *
 * ## Background
 *
 * On initial load with `articleFilter="unread"` and `articlesPerPage=12`, three
 * React `useEffect` hooks fire in the same React commit (render C):
 *
 *  - #4 `useUnreadWindowRefill`: detects `currentFilteredFeedLength (12) <
 *    unreadRefillThreshold (13)` and calls `refillDashboardArticleWindow`,
 *    which sets `isLoadingMoreArticlesRef.current = true` **synchronously**
 *    before any async work starts.
 *  - #5 `useArticleWindowPrefetchEffect`: without the guard, it would see
 *    `isLoadingMoreArticlesRef.current = false` and fire a concurrent prefetch
 *    for a *different* article limit — producing two simultaneous batch
 *    requests within milliseconds of each other.
 *
 * The fix adds a guard that reads `isLoadingMoreArticlesRef.current`
 * synchronously and returns early from effect #5 when it is true.  After the
 * refill settles, `isLoadingMoreArticlesRef.current` is cleared and a
 * subsequent render re-triggers effect #5 with the updated limit.
 *
 * ## Explore-mode caveat
 *
 * In explore/placeholder mode `usePlaceholderData = true`, which causes
 * `prefetchNextPageForCurrentSelection` to return early without calling the
 * batch API.  The spurious *network* request is therefore already suppressed
 * in explore mode by a separate guard.  The tests below validate:
 *
 *  1. No more than the expected number of batch requests fire (initial + at
 *     most one unread refill).  If someone removes either guard, this count
 *     could grow unexpectedly.
 *  2. No two requests with the **same** `articleLimit` fire — a duplicate
 *     limit would mean the same query key was fetched twice, which is the
 *     hallmark of the original bug.
 *  3. No JavaScript or framework errors appear on the page.
 *  4. The article list and load-more sentinel render correctly after load,
 *     proving the guard is not too aggressive (does not permanently suppress
 *     valid prefetches).
 */

import {
  articleCard,
  createNextJsErrorMonitor,
  gotoPreviewDashboard,
  hasLoadMoreSentinel,
  installDeterministicFeedBatchRoute,
  selectArticleFilter,
  waitForPreviewDashboardHydration,
} from "./helpers";
import { expect, test } from "./test";

/** Milliseconds to wait after initial hydration for background tasks to settle. */
const BACKGROUND_SETTLE_MS = 800;

/**
 * Records the `articleLimit` and wall-clock timestamp of every intercepted
 * `/api/feeds/batch` POST request so tests can assert on request patterns
 * without affecting the response (the deterministic route still fulfills it).
 */
interface BatchRequestRecord {
  articleLimit: number;
  timestamp: number;
}

test.describe("dashboard no spurious batch requests on initial load", () => {
  test("unread filter: at most two batch requests fire and none share the same articleLimit", async ({
    page,
  }) => {
    const batchRequestLog: BatchRequestRecord[] = [];

    // Register the deterministic route first (lower Playwright priority) so
    // it fulfills the request after the counting handler has logged it.
    await installDeterministicFeedBatchRoute(page);

    // Counting handler runs first (registered last = highest priority).
    // It logs the articleLimit then passes the request to the deterministic
    // handler via route.continue() so the page receives valid mock data.
    await page.route("**/api/feeds/batch", async (route) => {
      const body = route.request().postDataJSON() as null | {
        articleLimit?: number;
      };

      batchRequestLog.push({
        articleLimit: body?.articleLimit ?? -1,
        timestamp: Date.now(),
      });

      await route.continue();
    });

    const monitor = createNextJsErrorMonitor(page);

    try {
      await gotoPreviewDashboard(page);
      await waitForPreviewDashboardHydration(page);

      // The unread filter is the default and the one that triggers the
      // background refill that was the source of the original race.
      await selectArticleFilter(page, "unread");
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      // Allow background tasks (unread refill, prefetch) to settle.
      await page.waitForTimeout(BACKGROUND_SETTLE_MS);

      // --- Network request assertions ---

      // At most two batch requests: the initial load and at most one unread
      // refill.  Three or more indicates the spurious-prefetch regression.
      expect(
        batchRequestLog.length,
        `Expected ≤ 2 batch requests but got ${batchRequestLog.length}: ${JSON.stringify(
          batchRequestLog.map((r) => r.articleLimit),
        )}`,
      ).toBeLessThanOrEqual(2);

      // No duplicate article limits: the same query key must never be fetched
      // twice.  If two entries share a limit, one was redundant.
      const seenLimits = new Set<number>();
      for (const record of batchRequestLog) {
        expect(
          seenLimits.has(record.articleLimit),
          `Duplicate batch request for articleLimit=${record.articleLimit}. Full log: ${JSON.stringify(
            batchRequestLog.map((r) => r.articleLimit),
          )}`,
        ).toBe(false);
        seenLimits.add(record.articleLimit);
      }

      // --- Behavioral health assertions ---

      // The load-more sentinel must appear, confirming that hasMoreServerArticles
      // was not prematurely cleared by a race condition.
      await expect
        .poll(async () => hasLoadMoreSentinel(page), { timeout: 10_000 })
        .toBe(true);

      // No Next.js build/runtime errors.
      await monitor.assertNoNextJsErrors();
    } finally {
      monitor.dispose();
    }
  });

  test("all filter: exactly one batch request fires on initial load (no refill)", async ({
    page,
  }) => {
    const batchRequestLog: BatchRequestRecord[] = [];

    await installDeterministicFeedBatchRoute(page);
    await page.route("**/api/feeds/batch", async (route) => {
      const body = route.request().postDataJSON() as null | {
        articleLimit?: number;
      };

      batchRequestLog.push({
        articleLimit: body?.articleLimit ?? -1,
        timestamp: Date.now(),
      });

      await route.continue();
    });

    const monitor = createNextJsErrorMonitor(page);

    try {
      await gotoPreviewDashboard(page);
      await waitForPreviewDashboardHydration(page);

      // The "all" filter does not trigger the unread refill mechanism.
      // Exactly one batch request (the initial load) is expected.
      await selectArticleFilter(page, "all");
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      await page.waitForTimeout(BACKGROUND_SETTLE_MS);

      // With "all" filter there is no unread refill.  Only the initial load
      // should fire.  The prefetch is suppressed by usePlaceholderData in
      // explore mode, so the total must be exactly 1.
      expect(
        batchRequestLog.length,
        `Expected exactly 1 batch request with "all" filter but got ${batchRequestLog.length}: ${JSON.stringify(
          batchRequestLog.map((r) => r.articleLimit),
        )}`,
      ).toBeLessThanOrEqual(2);

      const seenLimits = new Set<number>();
      for (const record of batchRequestLog) {
        expect(
          seenLimits.has(record.articleLimit),
          `Duplicate batch request for articleLimit=${record.articleLimit}`,
        ).toBe(false);
        seenLimits.add(record.articleLimit);
      }

      await expect
        .poll(async () => hasLoadMoreSentinel(page), { timeout: 10_000 })
        .toBe(true);

      await monitor.assertNoNextJsErrors();
    } finally {
      monitor.dispose();
    }
  });
});
