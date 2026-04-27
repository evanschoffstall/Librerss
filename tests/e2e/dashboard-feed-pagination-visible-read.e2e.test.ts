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
  readFeedArticleClipState,
  readVisibleFeedArticleCount,
  selectArticleFilter,
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

async function waitForInitialClippedWindow(page: Page, pageSize: number) {
  await expect
    .poll(async () => {
      const visibleCount = await readVisibleFeedArticleCount(page);
      const clipState = await readFeedArticleClipState(page);

      return (
        visibleCount > pageSize &&
        visibleCount < pageSize * 2 &&
        clipState.partiallyVisibleCount > 0
      );
    })
    .toBe(true);

  return await readVisibleFeedArticleCount(page);
}

test.describe("dashboard feed pagination", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicFeedBatchRoute(page);
  });

  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
    test(`keeps visible-read replacement bounded to the clipped overflow window on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await selectArticleFilter(page, "unread");
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await waitForInitialClippedWindow(page, 4);

      const initialSnapshot = await readStableDesktopMarkVisibleReadBaseline(
        page,
      );

      await page
        .getByRole("button", { name: "Mark fully visible articles as read" })
        .click();

      const replacementSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
        page,
        5,
        initialSnapshot.fullyVisibleArticleKeys,
      );

      expect(replacementSnapshot.renderedCount).toBeGreaterThanOrEqual(5);
      expect(replacementSnapshot.renderedCount).toBeLessThan(12);
      await expect
        .poll(async () => {
          const visibleCount = await readVisibleFeedArticleCount(page);

          return visibleCount >= 5 && visibleCount < 12;
        })
        .toBe(true);
    });

    test(`keeps repeated visible-read refills stable across available replacement pages on ${viewportCase.name}`, async ({
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
      await selectArticleFilter(page, "unread");
      await configureArticlesPerPage(page, repeatedCyclePageSize);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect(markViewportReadButton).toBeEnabled({ timeout: 15_000 });

      const initialSnapshot =
        await readStableDesktopMarkVisibleReadBaseline(page);
      const minimumRenderedCount = repeatedCyclePageSize + 1;

      expect(initialSnapshot.fullyVisibleArticleKeys.length).toBeGreaterThanOrEqual(
        repeatedCyclePageSize,
      );
      expect(initialSnapshot.renderedCount).toBeGreaterThanOrEqual(
        repeatedCyclePageSize + 1,
      );
      expect(initialSnapshot.renderedCount).toBeLessThan(
        repeatedCyclePageSize * 3,
      );

      await expect(markViewportReadButton).toBeEnabled();
      await clickMarkFullyVisibleArticlesAsRead(page);

      const calibratedSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
        page,
        minimumRenderedCount,
        initialSnapshot.fullyVisibleArticleKeys,
      );

      let previousSnapshot = calibratedSnapshot;

      for (const _cycleIndex of Array.from({ length: 3 }, (_, index) => index)) {
        await clickMarkFullyVisibleArticlesAsRead(page);

        previousSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
          page,
          minimumRenderedCount,
          previousSnapshot.fullyVisibleArticleKeys,
        );

        expect(previousSnapshot.renderedCount).toBeGreaterThanOrEqual(
          repeatedCyclePageSize + 1,
        );
        expect(previousSnapshot.renderedCount).toBeLessThan(
          repeatedCyclePageSize * 3,
        );
      }
    });
  }
});