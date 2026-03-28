import type { Page } from "@playwright/test";

import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  hasLoadMoreSentinel,
  readRenderedItemWindow,
  scrollFeedViewportToBottom,
  scrollFeedViewportToTop,
  triggerFeedViewportWheelIntent,
} from "./helpers";
import { expect, test } from "./test";

const MOBILE_INVERTED_SCROLL_STORAGE_KEY = "librerss:mobileInvertedScroll";

interface MobileViewportCase {
  height: number;
  name: string;
  width: number;
}

const MOBILE_VIEWPORT_CASES: MobileViewportCase[] = [
  { height: 667, name: "short mobile", width: 375 },
  { height: 852, name: "tall mobile", width: 393 },
];

/** Reads the feed attribute that indicates inverted scroll is active. */
async function readInvertedScrollAttribute(page: Page) {
  const feedSurface = page.locator("[data-feed-surface-mode]").first();
  return await feedSurface.getAttribute("data-inverted-scroll");
}

test.describe("dashboard mobile feed pagination", () => {
  for (const viewportCase of MOBILE_VIEWPORT_CASES) {
    test(`keeps one configured page visible and prepends older pages in inverted mode on ${viewportCase.name}`, async ({
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

      await expect(readInvertedScrollAttribute(page)).resolves.toBe("true");
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

      let previousWindow = await readRenderedItemWindow(page);

      for (const _minimumRenderedArticles of [8, 12]) {
        await scrollFeedViewportToTop(page);
        await triggerFeedViewportWheelIntent(page, -240);
        await expect
          .poll(async () => {
            return (await readRenderedItemWindow(page)).minIndex;
          })
          .not.toBeNull();

        const nextWindow = await readRenderedItemWindow(page);
        expect(nextWindow.minIndex).not.toBeNull();
        expect(previousWindow.minIndex).not.toBeNull();
        expect(nextWindow.minIndex!).toBeLessThanOrEqual(previousWindow.minIndex!);
        previousWindow = nextWindow;
      }
    });

    test(`keeps one configured page visible and appends older pages in standard mode on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.addInitScript((storageKey: string) => {
        window.localStorage.setItem(storageKey, "false");
      }, MOBILE_INVERTED_SCROLL_STORAGE_KEY);
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { exact: true, name: "all" }).click();

      await configureArticlesPerPage(page, 4);

      await expect(readInvertedScrollAttribute(page)).resolves.toBeNull();
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
      await triggerFeedViewportWheelIntent(page, 240);
      await scrollFeedViewportToBottom(page);
      await triggerFeedViewportWheelIntent(page, 240);
      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(11);

      const previousWindow = await readRenderedItemWindow(page);
      expect(previousWindow.maxIndex).not.toBeNull();

      for (const _ignored of [0]) {
        await scrollFeedViewportToBottom(page);
        await triggerFeedViewportWheelIntent(page, 240);
        await expect
          .poll(async () => {
            return (await readRenderedItemWindow(page)).maxIndex;
          })
          .toBeGreaterThanOrEqual(previousWindow.maxIndex!);
      }
    });
  }
});