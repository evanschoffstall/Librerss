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

const SMALL_PAGE_SIZE = 4;
const LARGE_PAGE_SIZE = 8;

/**
 * Installs a MutationObserver on the page body that records every time a
 * `[data-feed-load-more-skeletons]` element is added to the DOM. Must be
 * called before the action that is expected to produce skeletons.
 */
async function installLoadMoreSkeletonObserver(page: Page) {
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    win["__skeletonAdditions"] = 0;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            (node as Element).getAttribute("data-feed-load-more-skeletons") !==
              null
          ) {
            (win["__skeletonAdditions"] as number)++;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    win["__skeletonObserver"] = observer;
  });
}

/** Returns the number of times skeletons have been added since the observer was installed. */
async function readSkeletonAdditionCount(page: Page): Promise<number> {
  return await page.evaluate(
    () => ((window as unknown as Record<string, unknown>)["__skeletonAdditions"] as number) ?? 0,
  );
}

test.describe("pagination skeleton contract", () => {
  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
    test(`shows load-more skeletons during scroll-triggered cached page reveal on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      // Wait for initial auto-fill to settle then install observer.
      await expect
        .poll(async () => readRenderedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE);

      await installLoadMoreSkeletonObserver(page);
      const skeletonsBeforeScroll = await readSkeletonAdditionCount(page);

      await scrollFeedViewportToBottom(page);

      // Skeleton must appear at least once during cached page reveal.
      await expect
        .poll(async () => readSkeletonAdditionCount(page))
        .toBeGreaterThan(skeletonsBeforeScroll);

      // After skeleton clears the expanded article window must be visible.
      await expect
        .poll(async () => (await readRenderedItemWindow(page)).maxIndex)
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE * 2 - 1);
    });

    test(`initial render is bounded to one page plus auto-fill on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, LARGE_PAGE_SIZE);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      // Before any user-initiated scroll the rendered window must not exceed
      // two pages: 1 initial page + at most 1 auto-fill page.
      await expect
        .poll(async () => (await readRenderedItemWindow(page)).maxIndex)
        .toBeLessThan(LARGE_PAGE_SIZE * 2);

      // The load-more sentinel must still be present so infinite scroll works.
      await expect
        .poll(async () => hasLoadMoreSentinel(page))
        .toBe(true);
    });

    test(`sentinel is present after initial hydration on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      // Sentinel must be in the DOM from the very first render because the
      // server always has more articles than the initial page.
      await expect
        .poll(async () => hasLoadMoreSentinel(page))
        .toBe(true);
    });

    test(`skeletons appear on every additional load during multi-page scroll on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => readRenderedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE);

      await installLoadMoreSkeletonObserver(page);

      // Scroll to bottom three times to trigger multiple page expansions.
      await scrollFeedViewportToBottom(page);
      await expect
        .poll(async () => readSkeletonAdditionCount(page))
        .toBeGreaterThanOrEqual(1);

      const countAfterFirst = await readSkeletonAdditionCount(page);
      await scrollFeedViewportToBottom(page);
      await expect
        .poll(async () => readSkeletonAdditionCount(page))
        .toBeGreaterThan(countAfterFirst);

      // Article window must span at least three configured pages.
      await expect
        .poll(async () => (await readRenderedItemWindow(page)).maxIndex)
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE * 3 - 1);
    });

    test(`scroll-triggered reveal does not collapse to zero articles on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      await scrollFeedViewportToBottom(page);

      // During or after the skeleton phase there must always be at least
      // the initial page of articles rendered — never a blank flash.
      await expect
        .poll(async () => (await readRenderedItemWindow(page)).maxIndex)
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE - 1);
    });

    test(`reset cancels any in-flight cached reveal so stale count is never committed on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => readRenderedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE);

      // Scroll to 70 % — near but not at the load-more boundary.
      const metrics = await page.evaluate(() => {
        const vp = document.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        return vp
          ? { maxScrollTop: Math.max(0, vp.scrollHeight - vp.clientHeight) }
          : { maxScrollTop: 0 };
      });
      await setFeedViewportScrollTop(
        page,
        Math.floor(metrics.maxScrollTop * 0.7),
      );

      // Trigger a refresh which internally calls resetPaginationState and
      // must cancel any in-flight cached reveal.
      await page
        .getByRole("button", { exact: true, name: "Refresh selected feed" })
        .click();

      // After reset the article window may temporarily shrink back toward 1
      // page but must never show more than 2 pages of stale content.
      await expect
        .poll(async () => (await readRenderedItemWindow(page)).maxIndex)
        .toBeLessThan(SMALL_PAGE_SIZE * 2);
    });
  }
});
