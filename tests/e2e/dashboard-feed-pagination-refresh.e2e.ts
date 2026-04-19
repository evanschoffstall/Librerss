/**
 * Desktop dashboard feed pagination regressions focused on refresh collapse,
 * repeated post-refresh stability, and post-refresh boundary rearming.
 */

import {
  DESKTOP_VIEWPORT_CASES,
  expandDesktopFeedWindow,
  expectDesktopRefreshCollapse,
  rearmDesktopPaginationAfterRefresh,
} from "./dashboard-feed-pagination-support";
import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  installDeterministicFeedBatchRoute,
  readRenderedArticleCount,
  readRenderedItemWindow,
  scrollFeedViewportToBottom,
} from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard feed pagination", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicFeedBatchRoute(page);
  });

  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
    test(`resets refresh back to one page plus minimum overflow on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(8);

      await scrollFeedViewportToBottom(page);
      await scrollFeedViewportToBottom(page);

      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(12);

      await page
        .getByRole("button", { exact: true, name: "Refresh selected feed" })
        .click();

      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(8);
      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeLessThan(12);
    });

    test(`keeps repeated desktop refreshes collapsed after the feed was expanded on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(8);

      await expandDesktopFeedWindow(page);
      const expandedCount = await readRenderedArticleCount(page);

      await expectDesktopRefreshCollapse(page);
      const firstRefreshCount = await readRenderedArticleCount(page);

      expect(firstRefreshCount).toBeGreaterThanOrEqual(8);
      expect(firstRefreshCount).toBeLessThan(expandedCount);

      await expectDesktopRefreshCollapse(page);
      const secondRefreshCount = await readRenderedArticleCount(page);

      expect(secondRefreshCount).toBeGreaterThanOrEqual(8);
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
      await page.getByRole("button", { exact: true, name: "all" }).click();
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
  }
});