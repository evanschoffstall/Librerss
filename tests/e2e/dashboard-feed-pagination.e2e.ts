import type { Page } from "@playwright/test";

import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  hasLoadMoreSentinel,
  readRenderedArticleCount,
  readRenderedItemWindow,
  scrollFeedViewportToBottom,
  setFeedViewportScrollTop,
} from "./helpers";
import { expect, test } from "./test";

interface DesktopViewportCase {
  height: number;
  name: string;
  width: number;
}

const DESKTOP_VIEWPORT_CASES: DesktopViewportCase[] = [
  { height: 640, name: "compact desktop", width: 1024 },
  { height: 780, name: "wide desktop", width: 1440 },
];

async function readFeedViewportMetrics(page: Page) {
  return await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]"),
    );
    const viewport = candidates
      .filter((candidate) => candidate.querySelector("article[data-article-key]") !== null)
      .sort((left, right) => right.scrollHeight - left.scrollHeight)[0];

    if (!viewport) {
      throw new Error("Expected the active feed viewport to be present.");
    }

    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

    return {
      clientHeight: viewport.clientHeight,
      maxScrollTop,
      remaining: viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight),
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
    };
  });
}

test.describe("dashboard feed pagination", () => {
  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
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
      await setFeedViewportScrollTop(page, Math.floor(initialMetrics.maxScrollTop * 0.7));

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
        Math.floor(firstRevealMetrics.maxScrollTop * 0.7),
      );

      await page.waitForTimeout(400);
      expect((await readRenderedItemWindow(page)).maxIndex).toBeLessThan(11);

      await page.waitForTimeout(800);
      await setFeedViewportScrollTop(
        page,
        Math.floor(firstRevealMetrics.maxScrollTop * 0.4),
      );
      const rearmMetrics = await readFeedViewportMetrics(page);
      await setFeedViewportScrollTop(page, Math.floor(rearmMetrics.maxScrollTop * 0.95));

      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(11);
    });

    test(`refills visible-read depletion without draining to a single page on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(8);

      for (const _ignored of [0, 1, 2]) {
        await page
          .getByRole("button", { name: "Mark fully visible articles as read" })
          .click();
        await expect
          .poll(async () => {
            return await readRenderedArticleCount(page);
          })
          .toBeGreaterThanOrEqual(6);
      }
    });
  }
});