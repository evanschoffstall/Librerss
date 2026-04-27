import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  hasLoadMoreSentinel,
  readLoadMoreSkeletonState,
  readVisibleFeedArticleCount,
  scrollFeedViewportToBottom,
  triggerFeedViewportWheelIntent,
} from "./helpers";
import { expect, test } from "./test";

test.describe("feed pagination skeleton visibility", () => {
  test("shows skeleton rows during scroll-triggered pagination", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 640, width: 1024 });
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await configureArticlesPerPage(page, 4);

    // Wait for initial articles to be present.
    await expect
      .poll(async () => {
        return await readVisibleFeedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(4);

    await triggerFeedViewportWheelIntent(page);
    await scrollFeedViewportToBottom(page);
    await expect
      .poll(async () => {
        return await readLoadMoreSkeletonState(page);
      })
      .toEqual({
        skeletonCount: 4,
        skeletonsVisible: true,
      });
  });

  test("continues pagination after reaching the scroll boundary", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 640, width: 1024 });
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await configureArticlesPerPage(page, 4);

    // Wait for initial articles.
    await expect
      .poll(async () => {
        return await readVisibleFeedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(4);

    // First scroll — triggers pagination.
    await triggerFeedViewportWheelIntent(page);
    await scrollFeedViewportToBottom(page);

    await expect
      .poll(async () => {
        return await readVisibleFeedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(8);

    // Second scroll — the race condition fix must re-arm the boundary so
    // this scroll triggers another pagination round without deadlocking.
    await triggerFeedViewportWheelIntent(page);
    await scrollFeedViewportToBottom(page);

    await expect
      .poll(async () => {
        return await readVisibleFeedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(12);
  });
});

/**
 * Regression tests for the background-fetch settlement race condition.
 *
 * The bug: load-more fetches are background requests (`keepExistingFeed: true`)
 * that never set `isLoading = true`. The availability effect would run with
 * `hasStarted=true`, `isLoading=false`, and stale `currentFeedLength` (before
 * the fetch completed), prematurely resolving `hasMoreServerArticles = false`.
 * This removed the scroll sentinel and deadlocked pagination.
 *
 * The fix: `resolveArticleWindowAvailability` defers settlement while
 * `isLoadingMoreArticles` is true and the feed length hasn't grown beyond
 * the pre-request snapshot. Settlement resolves only after the fetch's
 * `.finally()` clears `isLoadingMoreArticles`.
 *
 * These e2e tests verify the sentinel persists across multiple rapid pagination
 * cycles and that article counts grow monotonically, proving the race condition
 * no longer causes premature sentinel removal.
 */
test.describe("pagination settlement race condition regression", () => {
  test("sentinel persists through 4 consecutive pagination cycles without deadlock", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 640, width: 1024 });
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await configureArticlesPerPage(page, 4);

    await expect
      .poll(async () => {
        return await readVisibleFeedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(4);

    /*
     * Run 4 consecutive scroll→paginate→verify cycles. Each cycle scrolls to
     * the bottom, waits for new articles to load, and verifies the sentinel
     * still exists. Without the race condition fix, the sentinel would
     * disappear after cycle 1 because hasMoreServerArticles would prematurely
     * flip to false during the background fetch window.
     */
    for (let cycle = 1; cycle <= 4; cycle++) {
      const expectedMinArticles = 4 + cycle * 4;

      await triggerFeedViewportWheelIntent(page);
      await scrollFeedViewportToBottom(page);

      await expect
        .poll(
          async () => {
            return await readVisibleFeedArticleCount(page);
          },
          {
            message: `pagination cycle ${cycle}: expected >= ${expectedMinArticles} visible articles`,
          },
        )
        .toBeGreaterThanOrEqual(expectedMinArticles);

      /*
       * The sentinel must remain in the DOM after each pagination cycle.
       * Its removal would prove the race condition is still present — the
       * availability resolver prematurely set hasMoreServerArticles=false,
       * which causes the sentinel to unmount.
       */
      await expect
        .poll(
          async () => {
            return await hasLoadMoreSentinel(page);
          },
          {
            message: `pagination cycle ${cycle}: sentinel must persist after load-more`,
          },
        )
        .toBe(true);
    }
  });

  test("article count grows monotonically across rapid scroll cycles", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 640, width: 1024 });
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await configureArticlesPerPage(page, 4);

    await expect
      .poll(async () => {
        return await readVisibleFeedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(4);

    /*
     * Track article counts across 3 rapid pagination cycles. Each cycle
     * must produce a strictly higher count than the previous one. A decrease
     * or plateau would indicate the race condition caused a reset (the
     * refresh-reset effect fires when isRefreshing && !isLoadingMore, which
     * resets visibleArticleCount back to articlesPerPage).
     */
    const counts: number[] = [await readVisibleFeedArticleCount(page)];

    for (let cycle = 0; cycle < 3; cycle++) {
      await triggerFeedViewportWheelIntent(page);
      await scrollFeedViewportToBottom(page);

      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThan(counts[counts.length - 1]);

      counts.push(await readVisibleFeedArticleCount(page));
    }

    /* Verify strict monotonic increase. */
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    }
  });
});
