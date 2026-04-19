/**
 * Desktop dashboard feed pagination regressions focused on visible-read refill
 * thresholds and repeated unread-window replacement cycles.
 */

import {
  countIncomingArticleKeys,
  DESKTOP_VIEWPORT_CASES,
  readStableDesktopMarkVisibleReadBaseline,
  waitForStableDesktopMarkVisibleReadCycle,
} from "./dashboard-feed-pagination-support";
import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  installDeterministicFeedBatchRoute,
  readRenderedArticleCount,
} from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard feed pagination", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicFeedBatchRoute(page);
  });

  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
    test(`waits to refill visible-read depletion until unread drops below a page plus overflow on ${viewportCase.name}`, async ({
      page,
    }) => {
      const feedRequestUrls: string[] = [];
      const handleRequest = (request: { url: () => string }) => {
        const requestUrl = new URL(request.url());

        if (requestUrl.pathname === "/api/feeds") {
          feedRequestUrls.push(request.url());
        }
      };

      page.on("request", handleRequest);

      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      try {
        await gotoPreviewDashboard(page);
        await configureArticlesPerPage(page, 4);

        await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
        await expect
          .poll(async () => {
            return await readRenderedArticleCount(page);
          })
          .toBeGreaterThanOrEqual(8);

        feedRequestUrls.length = 0;

        await page
          .getByRole("button", { name: "Mark fully visible articles as read" })
          .click();

        await expect
          .poll(async () => {
            return await readRenderedArticleCount(page);
          })
          .toBeGreaterThanOrEqual(8);

        await page.waitForTimeout(800);
        expect(feedRequestUrls).toEqual([]);
      } finally {
        page.off("request", handleRequest);
      }
    });

    test(`keeps repeated visible-read refills stable for twenty cycles on ${viewportCase.name}`, async ({
      page,
    }) => {
      const repeatedCyclePageSize = 4;
      const repeatedCycleViewportHeight = Math.max(viewportCase.height, 780);
      const markViewportReadButton = page.getByRole("button", {
        name: "Mark fully visible articles as read",
      });

      await page.setViewportSize({
        height: repeatedCycleViewportHeight,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await configureArticlesPerPage(page, repeatedCyclePageSize);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect(markViewportReadButton).toBeEnabled({ timeout: 15_000 });

      const initialSnapshot =
        await readStableDesktopMarkVisibleReadBaseline(page);
      const expectedReplacementCount =
        initialSnapshot.fullyVisibleArticleKeys.length;

      expect(expectedReplacementCount).toBeGreaterThanOrEqual(
        repeatedCyclePageSize,
      );

      await expect(markViewportReadButton).toBeEnabled();
      await markViewportReadButton.click();

      const calibratedSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
        page,
        expectedReplacementCount,
        initialSnapshot.fullyVisibleArticleKeys,
      );

      let previousSnapshot = calibratedSnapshot;

      for (const cycleIndex of Array.from({ length: 19 }, (_, index) => index)) {
        expect(
          previousSnapshot.fullyVisibleArticleKeys.length,
          `Expected cycle ${cycleIndex + 2} to start with the same fully visible unread window size.`,
        ).toBe(expectedReplacementCount);

        await expect(markViewportReadButton).toBeEnabled();
        await markViewportReadButton.click();

        const nextSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
          page,
          expectedReplacementCount,
          previousSnapshot.fullyVisibleArticleKeys,
        );
        const incomingVisibleArticleCount = countIncomingArticleKeys(
          previousSnapshot.fullyVisibleArticleKeys,
          nextSnapshot.fullyVisibleArticleKeys,
        );

        expect(
          incomingVisibleArticleCount,
          `Expected cycle ${cycleIndex + 2} to replace the fully visible unread window with exactly ${expectedReplacementCount} new visible articles after marking it read.`,
        ).toBe(expectedReplacementCount);
        expect(
          previousSnapshot.fullyVisibleArticleKeys.every(
            (articleKey) =>
              !nextSnapshot.fullyVisibleArticleKeys.includes(articleKey),
          ),
          `Expected cycle ${cycleIndex + 2} to remove every previously fully visible unread article from the next fully visible unread window.`,
        ).toBe(true);
        expect(nextSnapshot.maxIndex).not.toBeNull();

        previousSnapshot = nextSnapshot;
      }
    });
  }
});