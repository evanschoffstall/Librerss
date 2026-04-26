/**
 * Desktop dashboard feed pagination regressions focused on visible-read refill
 * thresholds and repeated unread-window replacement cycles.
 */

import type { Page } from "@playwright/test";

import {
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

async function clickMarkFullyVisibleArticlesAsRead(page: Page) {
  const markFullyVisibleArticlesAsReadButton = page.getByRole("button", {
    name: "Mark fully visible articles as read",
  });

  await expect(markFullyVisibleArticlesAsReadButton).toBeEnabled({
    timeout: 20_000,
  });

  try {
    await markFullyVisibleArticlesAsReadButton.click({ timeout: 20_000 });
  } catch {
    await markFullyVisibleArticlesAsReadButton.click({
      force: true,
      timeout: 20_000,
    });
  }
}

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
          .toBe(8);

        feedRequestUrls.length = 0;

        await page
          .getByRole("button", { name: "Mark fully visible articles as read" })
          .click();

        await expect
          .poll(async () => {
            return await readRenderedArticleCount(page);
          })
          .toBeGreaterThanOrEqual(8);
        await expect
          .poll(() => {
            return feedRequestUrls.length;
          }, { timeout: 1_000 })
          .toBe(0);
      } finally {
        page.off("request", handleRequest);
      }
    });

    test(`keeps repeated visible-read refills stable for twenty cycles on ${viewportCase.name}`, async ({
      page,
    }) => {
      test.slow();

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
      const minimumRenderedCount = repeatedCyclePageSize;

      expect(initialSnapshot.fullyVisibleArticleKeys.length).toBeGreaterThanOrEqual(
        repeatedCyclePageSize,
      );
      expect(initialSnapshot.renderedCount).toBeGreaterThanOrEqual(8);

      await expect(markViewportReadButton).toBeEnabled();
      await clickMarkFullyVisibleArticlesAsRead(page);

      const calibratedSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
        page,
        minimumRenderedCount,
        initialSnapshot.fullyVisibleArticleKeys,
      );

      let previousSnapshot = calibratedSnapshot;

      for (const _cycleIndex of Array.from({ length: 19 }, (_, index) => index)) {
        await clickMarkFullyVisibleArticlesAsRead(page);

        previousSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
          page,
          minimumRenderedCount,
          previousSnapshot.fullyVisibleArticleKeys,
        );
      }
    });
  }
});