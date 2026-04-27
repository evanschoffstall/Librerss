/**
 * Desktop dashboard feed pagination regressions focused on refresh collapse,
 * repeated post-refresh stability, and post-refresh boundary rearming.
 */

import {
  DESKTOP_VIEWPORT_CASES,
  expandDesktopFeedWindow,
  expectDesktopRefreshCollapse,
  rearmDesktopPaginationAfterRefresh,
  waitForDesktopClippedWindow,
} from "./dashboard-feed-pagination-support";
import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  installDeterministicFeedBatchRoute,
  readRenderedArticleCount,
  readRenderedItemWindow,
  scrollFeedViewportToBottom,
  selectArticleFilter,
} from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard feed pagination", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicFeedBatchRoute(page);
  });

  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
    test(`resets refresh back to the clipped overflow window on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await selectArticleFilter(page, "all");
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      const initialCount = await waitForDesktopClippedWindow(page, 4);

      await scrollFeedViewportToBottom(page);
      await scrollFeedViewportToBottom(page);

      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(initialCount + 8);

      await page
        .getByRole("button", { exact: true, name: "Refresh selected feed" })
        .click();

      await waitForDesktopClippedWindow(page, 4);
    });

    test(`keeps repeated desktop refreshes collapsed after the feed was expanded on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await selectArticleFilter(page, "all");
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await waitForDesktopClippedWindow(page, 4);

      await expandDesktopFeedWindow(page);
      const expandedCount = await readRenderedArticleCount(page);

      const firstRefreshCount = await expectDesktopRefreshCollapse(page);

      expect(firstRefreshCount).toBeLessThan(expandedCount);

      const secondRefreshCount = await expectDesktopRefreshCollapse(page);

      expect(secondRefreshCount).toBeLessThan(expandedCount);
      expect(secondRefreshCount).toBeLessThan(12);
    });

    test(`rearms desktop pagination after refresh collapses an expanded explore window on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await selectArticleFilter(page, "all");
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expandDesktopFeedWindow(page);

      await expectDesktopRefreshCollapse(page);

      const collapsedWindow = await readRenderedItemWindow(page);
      expect(collapsedWindow.maxIndex).not.toBeNull();
      expect(collapsedWindow.maxIndex!).toBeLessThan(11);

      await rearmDesktopPaginationAfterRefresh(page);
      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThan(collapsedWindow.maxIndex!);
    });

    test(`browser reload collapses the first paint back to the minimum overflow window on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await selectArticleFilter(page, "all");
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expandDesktopFeedWindow(page);

      await page.reload({ waitUntil: "networkidle" });

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await waitForDesktopClippedWindow(page, 4);
    });
  }
});