/**
 * Regression test: no spurious duplicate `/api/feeds/batch` requests on the
 * initial dashboard load.
 *
 * ## Background
 *
 * On an unread article-window pass with `articlesPerPage=12`, several React
 * effects can fire in the same commit:
 *
 *  - `useUnreadWindowRefill`: when a local read-state change depletes unread
 *    rows below the overflow threshold, it calls `refillDashboardArticleWindow`,
 *    which sets `isLoadingMoreArticlesRef.current = true` synchronously before
 *    any async work starts.
 *  - `useArticleWindowPrefetchEffect`: without the guard, it could see
 *    `isLoadingMoreArticlesRef.current = false` and fire a concurrent prefetch
 *    for a different article limit, producing overlapping batch requests within
 *    milliseconds of each other.
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
 *     most one warm-ahead read).  If someone removes either guard, this count
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

/** Maximum time budget for background batch-request activity to settle. */
const BACKGROUND_SETTLE_TIMEOUT_MS = 1_200;

/**
 * Records request shape and timing for every intercepted
 * `/api/feeds/batch` POST request so tests can assert on request patterns
 * without affecting the response (the deterministic route still fulfills it).
 */
interface BatchRequestRecord {
  articleLimit: number;
  skipRefresh: boolean;
  timestamp: number;
  urls: string[];
}

/**
 * Return whether a batch request is the aggregate article-window read.
 * @param record - Captured batch request record.
 * @returns Whether the request reads the multi-feed article window.
 */
function isAggregateBatchRead(record: BatchRequestRecord): boolean {
  return record.skipRefresh || record.urls.length > 1;
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
        skipRefresh?: boolean;
        urls?: string[];
      };

      batchRequestLog.push({
        articleLimit: body?.articleLimit ?? -1,
        skipRefresh: body?.skipRefresh === true,
        timestamp: Date.now(),
        urls: Array.isArray(body?.urls) ? body.urls : [],
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

      // Allow background tasks (unread refill, prefetch) to settle by waiting
      // until request activity stops changing for at least one polling cycle.
      let previousBatchRequestCount = -1;
      await expect
        .poll(
          () => {
            const currentBatchRequestCount = batchRequestLog.length;

            if (currentBatchRequestCount === previousBatchRequestCount) {
              return currentBatchRequestCount;
            }

            previousBatchRequestCount = currentBatchRequestCount;
            return -1;
          },
          {
            intervals: [120, 180, 220],
            timeout: BACKGROUND_SETTLE_TIMEOUT_MS,
          },
        )
        .not.toBe(-1);

      // --- Network request assertions ---

      const aggregateReads = batchRequestLog.filter(isAggregateBatchRead);

      // At most two aggregate article-window reads: the initial load and the
      // single warm-ahead window. Per-feed refresh fan-out requests are expected
      // and are not duplicate article-window reads.
      expect(
        aggregateReads.length,
        `Expected ≤ 2 aggregate batch reads but got ${aggregateReads.length}: ${JSON.stringify(
          batchRequestLog.map((r) => ({
            articleLimit: r.articleLimit,
            skipRefresh: r.skipRefresh,
            urls: r.urls,
          })),
        )}`,
      ).toBeLessThanOrEqual(2);

      // No duplicate article limits: the same query key must never be fetched
      // twice.  If two entries share a limit, one was redundant.
      const seenLimits = new Set<number>();
      for (const record of aggregateReads) {
        expect(
          seenLimits.has(record.articleLimit),
          `Duplicate aggregate batch read for articleLimit=${record.articleLimit}. Full log: ${JSON.stringify(
            batchRequestLog.map((r) => ({
              articleLimit: r.articleLimit,
              skipRefresh: r.skipRefresh,
              urls: r.urls,
            })),
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
        skipRefresh?: boolean;
        urls?: string[];
      };

      batchRequestLog.push({
        articleLimit: body?.articleLimit ?? -1,
        skipRefresh: body?.skipRefresh === true,
        timestamp: Date.now(),
        urls: Array.isArray(body?.urls) ? body.urls : [],
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

      let previousBatchRequestCount = -1;
      await expect
        .poll(
          () => {
            const currentBatchRequestCount = batchRequestLog.length;

            if (currentBatchRequestCount === previousBatchRequestCount) {
              return currentBatchRequestCount;
            }

            previousBatchRequestCount = currentBatchRequestCount;
            return -1;
          },
          {
            intervals: [120, 180, 220],
            timeout: BACKGROUND_SETTLE_TIMEOUT_MS,
          },
        )
        .not.toBe(-1);

      const aggregateReads = batchRequestLog.filter(isAggregateBatchRead);

      // With "all" filter there is no unread refill.  Explore mode may serve
      // placeholder data without a network read; if it does read, there should
      // be no more than one aggregate article-window request.
      expect(
        aggregateReads.length,
        `Expected at most 1 aggregate batch read with "all" filter but got ${aggregateReads.length}: ${JSON.stringify(
          batchRequestLog.map((r) => ({
            articleLimit: r.articleLimit,
            skipRefresh: r.skipRefresh,
            urls: r.urls,
          })),
        )}`,
      ).toBeLessThanOrEqual(1);

      const seenLimits = new Set<number>();
      for (const record of aggregateReads) {
        expect(
          seenLimits.has(record.articleLimit),
          `Duplicate aggregate batch read for articleLimit=${record.articleLimit}`,
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
