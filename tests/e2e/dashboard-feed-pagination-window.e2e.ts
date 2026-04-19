/**
 * Desktop dashboard feed pagination regressions focused on bounded initial
 * rendering and scroll-triggered page growth.
 */

import {
  DESKTOP_VIEWPORT_CASES,
  readFeedViewportMetrics,
} from "./dashboard-feed-pagination-support";
import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  hasLoadMoreSentinel,
  installDeterministicFeedBatchRoute,
  readRenderedArticleCount,
  readRenderedItemWindow,
  scrollFeedViewportToBottom,
  setFeedViewportScrollTop,
} from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard feed pagination", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicFeedBatchRoute(page);
  });

  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
    test(`does not render the entire explore corpus at once on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, 4);

      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeLessThan(40);
      await expect
        .poll(async () => {
          return await hasLoadMoreSentinel(page);
        })
        .toBe(true);
    });

    test(`keeps the configured page size and loads at least three pages on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { exact: true, name: "all" }).click();

      await configureArticlesPerPage(page, 4);

      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(3);
      await expect
        .poll(async () => {
          return await hasLoadMoreSentinel(page);
        })
        .toBe(true);

      await scrollFeedViewportToBottom(page);
      await scrollFeedViewportToBottom(page);
      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(11);

      const previousWindow = await readRenderedItemWindow(page);
      expect(previousWindow.maxIndex).not.toBeNull();

      for (const _ignored of [0]) {
        await scrollFeedViewportToBottom(page);
        await expect
          .poll(async () => {
            return (await readRenderedItemWindow(page)).maxIndex;
          })
          .toBeGreaterThanOrEqual(previousWindow.maxIndex!);
      }
    });

    test(`loads the next desktop page before exact bottom on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, 4);

      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(3);

      const initialMetrics = await readFeedViewportMetrics(page);
      await setFeedViewportScrollTop(
        page,
        Math.floor(initialMetrics.maxScrollTop * 0.7),
      );

      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(7);
      await expect
        .poll(async () => {
          return (await readFeedViewportMetrics(page)).remaining;
        })
        .toBeGreaterThan(0);

      const firstRevealMetrics = await readFeedViewportMetrics(page);
      await setFeedViewportScrollTop(
        page,
        Math.floor(firstRevealMetrics.maxScrollTop * 0.55),
      );

      await page.waitForTimeout(400);
      expect((await readRenderedItemWindow(page)).maxIndex).toBeLessThanOrEqual(
        11,
      );

      await page.waitForTimeout(800);
      await setFeedViewportScrollTop(
        page,
        Math.floor(firstRevealMetrics.maxScrollTop * 0.4),
      );
      const rearmMetrics = await readFeedViewportMetrics(page);
      await setFeedViewportScrollTop(
        page,
        Math.floor(rearmMetrics.maxScrollTop * 0.95),
      );

      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(11);
    });
  }
});