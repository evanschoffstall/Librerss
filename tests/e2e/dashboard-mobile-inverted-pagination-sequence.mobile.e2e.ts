import type { Page } from "@playwright/test";

import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  readFeedViewportMetrics,
  readRenderedArticleCount,
  readTopVisibleFeedArticle,
  scrollFeedViewportToTop,
  setFeedViewportScrollTop,
  triggerFeedViewportWheelIntent,
} from "./helpers";
import { expect, test } from "./test";

const MOBILE_INVERTED_SCROLL_STORAGE_KEY = "librerss:mobileInvertedScroll";
const STABLE_TOP_VISIBLE_ARTICLE_OFFSET_PX = 144;
const STABLE_TOP_VISIBLE_ARTICLE_TOLERANCE_PX = 24;
const INVERTED_PAGINATION_RETRY_LIMIT = 8;
const INVERTED_PAGINATION_REARM_DELAY_MS = 1_100;
const RENDERED_COUNT_SETTLE_DELAY_MS = 180;
const RENDERED_COUNT_SETTLE_LIMIT = 10;

async function expandInvertedWindowByOnePage(page: Page, expectedCount: number) {
  let renderedCount = await readRenderedArticleCount(page);

  for (let attempt = 0; attempt < INVERTED_PAGINATION_RETRY_LIMIT; attempt += 1) {
    await triggerFeedViewportWheelIntent(page, -240);
    await page.waitForTimeout(180);

    renderedCount = await readRenderedArticleCount(page);
    if (renderedCount === expectedCount) {
      return;
    }

    if (renderedCount > expectedCount) {
      break;
    }

    await page.waitForTimeout(INVERTED_PAGINATION_REARM_DELAY_MS);
    await scrollFeedViewportToTop(page);
  }

  expect(renderedCount).toBe(expectedCount);
}

async function readStableRenderedCount(page: Page) {
  let previousCount: null | number = null;

  for (let attempt = 0; attempt < RENDERED_COUNT_SETTLE_LIMIT; attempt += 1) {
    const currentCount = await readRenderedArticleCount(page);

    if (currentCount === previousCount) {
      return currentCount;
    }

    previousCount = currentCount;
    await page.waitForTimeout(RENDERED_COUNT_SETTLE_DELAY_MS);
  }

  return previousCount ?? 0;
}

/** Enables mobile inverted scroll before the preview dashboard hydrates. */
async function enableMobileInvertedScroll(page: Page) {
  await page.addInitScript((storageKey: string) => {
    window.localStorage.setItem(storageKey, "true");
  }, MOBILE_INVERTED_SCROLL_STORAGE_KEY);
}

test.describe("dashboard mobile inverted pagination sequence", () => {
  test("keeps exact article counts and anchor position across four inverted paginations", async ({
    page,
  }) => {
    await page.setViewportSize({
      height: 560,
      width: 375,
    });

    await enableMobileInvertedScroll(page);
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    await configureArticlesPerPage(page, 4);

    let initialCount = 0;
    await expect.poll(async () => {
      initialCount = await readStableRenderedCount(page);
      return initialCount;
    }).toBeGreaterThanOrEqual(4);
    expect([4, 8]).toContain(initialCount);

    const expectedGrowthByStep = [4, 8, 12, 16];

    for (const [stepIndex, expectedGrowth] of expectedGrowthByStep.entries()) {
      await scrollFeedViewportToTop(page);
      const viewportBeforeLoad = await readFeedViewportMetrics(page);

      const anchorBeforeLoad = await readTopVisibleFeedArticle(
        page,
        STABLE_TOP_VISIBLE_ARTICLE_OFFSET_PX,
      );

      await expandInvertedWindowByOnePage(page, initialCount + expectedGrowth);

      const anchorAfterLoad = await readTopVisibleFeedArticle(
        page,
        STABLE_TOP_VISIBLE_ARTICLE_OFFSET_PX,
      );
      const viewportAfterLoad = await readFeedViewportMetrics(page);

      expect(anchorBeforeLoad?.articleKey).not.toBeNull();
      expect(anchorAfterLoad?.articleKey).toBe(anchorBeforeLoad?.articleKey);
      expect(
        Math.abs(
          (anchorAfterLoad?.offsetTop ?? 0) -
            (anchorBeforeLoad?.offsetTop ?? 0),
        ),
      ).toBeLessThanOrEqual(STABLE_TOP_VISIBLE_ARTICLE_TOLERANCE_PX);
      expect(viewportAfterLoad.scrollHeight).toBeGreaterThanOrEqual(
        viewportBeforeLoad.scrollHeight,
      );
      expect(viewportAfterLoad.scrollTop).toBeGreaterThanOrEqual(0);

      if (stepIndex < expectedGrowthByStep.length - 1) {
        await setFeedViewportScrollTop(page, 800);
        await page.waitForTimeout(INVERTED_PAGINATION_REARM_DELAY_MS);
      }
    }
  });
});
