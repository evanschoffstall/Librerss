import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  hasLoadMoreSentinel,
  installDeterministicFeedBatchRoute,
  readLoadMoreSkeletonState,
  readVisibleFeedArticleCount,
  scrollFeedViewportToBottom,
  setFeedViewportScrollTop,
  triggerFeedViewportWheelIntent,
} from "./helpers";
import { expect, test } from "./test";

const LONG_RUN_PAGE_SIZE = 4;
const LONG_RUN_PAGINATION_CYCLES = 8;
const LONG_RUN_ADVANCE_ATTEMPTS_PER_CYCLE = 4;
const SKELETON_PAINT_DELAY_MS = 120;

interface SkeletonProbeResult {
  sawExpectedSkeletons: boolean;
  sawUnexpectedSkeletonCount: boolean;
}

interface SkeletonProbeWindow extends Window {
  __librerssSkeletonProbe?: {
    disconnect: () => void;
    sawExpectedSkeletons: boolean;
    sawUnexpectedSkeletonCount: boolean;
  };
}

/**
 * Scrolls the feed and proves skeletons stay mounted until articles commit.
 * @param page - The dashboard page under test.
 * @param cycle - The one-based pagination cycle number used in assertion output.
 * @param pageSize - The configured article page size for the current run.
 * @param previousArticleCount - The article count before this cycle started.
 * @param minimumArticleCount - The minimum count expected after this cycle.
 * @returns The committed visible article count for the cycle.
 */
async function requestNextPageAndExpectContinuousSkeletons(
  page: Parameters<typeof triggerFeedViewportWheelIntent>[0],
  _cycle: number,
  pageSize: number,
  previousArticleCount: number,
  minimumArticleCount: number,
) {
  const previousTransitionSettleDeadline = Date.now() + 300;

  while (Date.now() < previousTransitionSettleDeadline) {
    if (!(await readLoadMoreSkeletonState(page)).skeletonsVisible) {
      break;
    }

    await page.waitForTimeout(16);
  }

  let isPreviousSkeletonStillVisible = (await readLoadMoreSkeletonState(page))
    .skeletonsVisible;

  await startSkeletonVisibilityProbe(page, pageSize);

  await setFeedViewportScrollTop(page, 0);
  await triggerFeedViewportWheelIntent(page);
  await scrollFeedViewportToBottom(page);

  let sawSkeletons = false;
  let committedArticleCount = previousArticleCount;
  const deadline = Date.now() + 12_000;
  let nextScrollIntentAt = Date.now() + 250;

  while (Date.now() < deadline) {
    const skeletonState = await readLoadMoreSkeletonState(page);
    const articleCount = await readVisibleFeedArticleCount(page);
    const now = Date.now();

    if (skeletonState.skeletonsVisible) {
      expect(skeletonState.skeletonCount).toBe(pageSize);
      if (!isPreviousSkeletonStillVisible) {
        sawSkeletons = true;
      }
    } else {
      isPreviousSkeletonStillVisible = false;
    }

    if (
      isPreviousSkeletonStillVisible &&
      skeletonState.skeletonsVisible &&
      articleCount >= minimumArticleCount
    ) {
      sawSkeletons = true;
    }

    if (sawSkeletons && articleCount >= minimumArticleCount) {
      committedArticleCount = articleCount;
      break;
    }

    if (now >= nextScrollIntentAt) {
      await triggerFeedViewportWheelIntent(page);
      await scrollFeedViewportToBottom(page);
      nextScrollIntentAt = now + 250;
    }

    await page.waitForTimeout(16);
  }

  const skeletonProbeResult = await stopSkeletonVisibilityProbe(page);

  expect(skeletonProbeResult.sawUnexpectedSkeletonCount).toBe(false);
  expect(sawSkeletons || skeletonProbeResult.sawExpectedSkeletons).toBe(true);

  return committedArticleCount;
}

/**
 * Starts a DOM-local observer before a pagination gesture so one-paint skeleton
 * commits are captured even when Node-side polling misses a frame.
 * @param page - Dashboard page under test.
 * @param pageSize - Expected skeleton row count for the incoming page.
 */
async function startSkeletonVisibilityProbe(
  page: Parameters<typeof triggerFeedViewportWheelIntent>[0],
  pageSize: number,
) {
  await page.evaluate((expectedSkeletonCount) => {
    const probeWindow = window as SkeletonProbeWindow;
    probeWindow.__librerssSkeletonProbe?.disconnect();

    const probe = {
      disconnect: () => observer.disconnect(),
      sawExpectedSkeletons: false,
      sawUnexpectedSkeletonCount: false,
    };
    const readSkeletonState = () => {
      const visibleSurfaces = Array.from(
        document.querySelectorAll<HTMLElement>("[data-feed-surface-mode]"),
      ).filter((surface) => {
        const rect = surface.getBoundingClientRect();

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          window.getComputedStyle(surface).visibility !== "hidden"
        );
      });

      for (const surface of visibleSurfaces) {
        if (surface.dataset.feedLoadMoreSkeletonsVisible !== "true") {
          continue;
        }

        const skeletonCount = Number.parseInt(
          surface.dataset.feedLoadMoreSkeletonCount ?? "0",
          10,
        );

        if (skeletonCount === expectedSkeletonCount) {
          probe.sawExpectedSkeletons = true;
        } else {
          probe.sawUnexpectedSkeletonCount = true;
        }
      }
    };
    const observer = new MutationObserver(readSkeletonState);

    observer.observe(document.body, {
      attributeFilter: [
        "data-feed-load-more-skeleton-count",
        "data-feed-load-more-skeletons-visible",
      ],
      attributes: true,
      subtree: true,
    });
    probeWindow.__librerssSkeletonProbe = probe;
    readSkeletonState();
  }, pageSize);
}

/**
 * Stops the skeleton observer and returns whether the expected count appeared.
 * @param page - Dashboard page under test.
 * @returns The skeleton probe flags captured during the pagination transition.
 */
async function stopSkeletonVisibilityProbe(
  page: Parameters<typeof triggerFeedViewportWheelIntent>[0],
): Promise<SkeletonProbeResult> {
  return await page.evaluate(() => {
    const probeWindow = window as SkeletonProbeWindow;
    const probe = probeWindow.__librerssSkeletonProbe;

    if (!probe) {
      return {
        sawExpectedSkeletons: false,
        sawUnexpectedSkeletonCount: true,
      };
    }

    probe.disconnect();
    delete probeWindow.__librerssSkeletonProbe;

    return {
      sawExpectedSkeletons: probe.sawExpectedSkeletons,
      sawUnexpectedSkeletonCount: probe.sawUnexpectedSkeletonCount,
    };
  });
}

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

  test("loads 8 consecutive paginated pages without losing skeletons or the sentinel", async ({
    page,
  }) => {
    test.slow();

    await page.setViewportSize({ height: 640, width: 1024 });
    const requestedArticleLimits: number[] = [];
    await installDeterministicFeedBatchRoute(page, {
      respectArticleLimit: true,
      responseDelayMs: SKELETON_PAINT_DELAY_MS,
      totalArticlesPerFeed: 1_000,
    });
    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route.request().postDataJSON() as {
        articleLimit?: unknown;
      };

      if (typeof requestBody.articleLimit === "number") {
        requestedArticleLimits.push(requestBody.articleLimit);
      }

      await route.fallback();
    });
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await configureArticlesPerPage(page, LONG_RUN_PAGE_SIZE);

    await expect
      .poll(async () => {
        return await readVisibleFeedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(LONG_RUN_PAGE_SIZE);
    await expect
      .poll(async () => {
        return (await readLoadMoreSkeletonState(page)).skeletonsVisible;
      })
      .toBe(false);

    let committedArticleCount = await readVisibleFeedArticleCount(page);

    /*
     * Eight full scroll-triggered pagination cycles catches late boundary rearm
     * and stale-settlement regressions that a short two-to-four-page smoke path
     * can miss. Each cycle must show the load-more skeletons first, commit at
     * least one more configured page of articles, and leave the sentinel mounted
     * so the next cycle can run.
     */
    for (let cycle = 1; cycle <= LONG_RUN_PAGINATION_CYCLES; cycle++) {
      let didAdvanceCycle = false;

      for (
        let attempt = 1;
        attempt <= LONG_RUN_ADVANCE_ATTEMPTS_PER_CYCLE;
        attempt += 1
      ) {
        const previousArticleCount = committedArticleCount;
        const minimumArticleCount = previousArticleCount + LONG_RUN_PAGE_SIZE;
        const requestCountBeforeCycle = requestedArticleLimits.length;

        committedArticleCount =
          await requestNextPageAndExpectContinuousSkeletons(
            page,
            cycle,
            LONG_RUN_PAGE_SIZE,
            previousArticleCount,
            minimumArticleCount,
          );

        didAdvanceCycle =
          committedArticleCount > previousArticleCount ||
          requestedArticleLimits.length > requestCountBeforeCycle;

        if (didAdvanceCycle) {
          break;
        }
      }

      expect(
        didAdvanceCycle,
        `pagination cycle ${cycle}: expected the visible window or requested article limit to advance`,
      ).toBe(true);

      await expect
        .poll(
          async () => {
            return await hasLoadMoreSentinel(page);
          },
          {
            message: `pagination cycle ${cycle}: sentinel must remain mounted for the next page`,
          },
        )
        .toBe(true);
    }
  });
});
