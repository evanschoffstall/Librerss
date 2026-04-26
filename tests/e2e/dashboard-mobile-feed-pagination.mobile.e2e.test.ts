import type { Page } from "@playwright/test";

import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  hasLoadMoreSentinel,
  readFeedViewportMetrics,
  readRenderedItemWindow,
  readTopVisibleFeedArticle,
  readVisibleFeedArticleCount,
  scrollFeedViewportToBottom,
  scrollFeedViewportToTop,
  triggerFeedViewportWheelIntent,
  wheelActiveFeedViewport,
} from "./helpers";
import { expect, test } from "./test";

const MOBILE_INVERTED_SCROLL_STORAGE_KEY = "librerss:mobileInvertedScroll";
const STABLE_TOP_VISIBLE_ARTICLE_OFFSET_PX = 144;
const STABLE_TOP_VISIBLE_ARTICLE_TOLERANCE_PX = 144;

interface MobileViewportCase {
  height: number;
  name: string;
  width: number;
}

const MOBILE_VIEWPORT_CASES: MobileViewportCase[] = [
  { height: 667, name: "short mobile", width: 375 },
  { height: 852, name: "tall mobile", width: 393 },
];

/** Enables the mobile inverted-scroll preference before the dashboard hydrates. */
async function enableMobileInvertedScroll(page: Page) {
  await page.addInitScript((storageKey: string) => {
    window.localStorage.setItem(storageKey, "true");
  }, MOBILE_INVERTED_SCROLL_STORAGE_KEY);
}

/** Expands the mobile feed by one additional configured page in inverted mode. */
async function expandInvertedMobileWindow(page: Page) {
  await wheelActiveFeedViewport(page, -700);
  await expect
    .poll(async () => {
      return await readVisibleFeedArticleCount(page);
    })
    .toBeGreaterThanOrEqual(8);

  await wheelActiveFeedViewport(page, -700);
  await expect
    .poll(async () => {
      return await readVisibleFeedArticleCount(page);
    })
    .toBeGreaterThanOrEqual(12);
}

/** Expands the mobile feed by one additional configured page in standard mode. */
async function expandStandardMobileWindow(page: Page) {
  await scrollFeedViewportToBottom(page);
  await triggerFeedViewportWheelIntent(page, 240);
  await scrollFeedViewportToBottom(page);
  await triggerFeedViewportWheelIntent(page, 240);

  await expect
    .poll(async () => {
      return (await readRenderedItemWindow(page)).maxIndex;
    })
    .toBeGreaterThanOrEqual(11);
}

/** Verifies refresh collapses an expanded mobile feed back to the minimum overflow window. */
async function expectMobileRefreshCollapse(page: Page) {
  await page
    .getByRole("button", { exact: true, name: "Refresh selected feed" })
    .click();

  await expect
    .poll(async () => {
      return await readVisibleFeedArticleCount(page);
    })
    .toBeGreaterThanOrEqual(4);
  await expect
    .poll(async () => {
      return await readVisibleFeedArticleCount(page);
    })
    .toBeLessThan(12);
  await expect
    .poll(async () => {
      return await hasLoadMoreSentinel(page);
    })
    .toBe(true);
}

/** Reads the feed attribute that indicates inverted scroll is active. */
async function readInvertedScrollAttribute(page: Page) {
  const feedSurface = page.locator("[data-feed-surface-mode]").first();
  return await feedSurface.getAttribute("data-inverted-scroll");
}

/** Rearms the inverted mobile pagination boundary after refresh. */
async function rearmInvertedMobilePaginationAfterRefresh(page: Page) {
  await scrollFeedViewportToTop(page);
  await wheelActiveFeedViewport(page, -700);
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

      await enableMobileInvertedScroll(page);
      await gotoPreviewDashboard(page);
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { exact: true, name: "all" }).click();

      await configureArticlesPerPage(page, 4);

      await expect(readInvertedScrollAttribute(page)).resolves.toBe("true");
      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(4);
      await expect
        .poll(async () => {
          return await hasLoadMoreSentinel(page);
        })
        .toBe(true);

      let previousVisibleCount = await readVisibleFeedArticleCount(page);

      for (const _minimumRenderedArticles of [8, 12]) {
        await scrollFeedViewportToTop(page);
        await triggerFeedViewportWheelIntent(page, -240);
        await expect
          .poll(async () => {
            return await readVisibleFeedArticleCount(page);
          })
          .toBeGreaterThan(previousVisibleCount);

        previousVisibleCount = await readVisibleFeedArticleCount(page);
      }
    });

    test(`rearms inverted pagination from continuous upward wheel input on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await enableMobileInvertedScroll(page);
      await gotoPreviewDashboard(page);
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { exact: true, name: "all" }).click();

      await configureArticlesPerPage(page, 4);

      await expect(readInvertedScrollAttribute(page)).resolves.toBe("true");

      const firstVisibleCount = await readVisibleFeedArticleCount(page);

      await scrollFeedViewportToTop(page);
      await wheelActiveFeedViewport(page, -700);
      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThan(firstVisibleCount);

      const secondVisibleCount = await readVisibleFeedArticleCount(page);

      let thirdVisibleCount = secondVisibleCount;

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await wheelActiveFeedViewport(page, -700);

        try {
          await expect
            .poll(async () => {
              return await readVisibleFeedArticleCount(page);
            }, {
              intervals: [80, 120, 160],
              timeout: 700,
            })
            .toBeGreaterThan(secondVisibleCount);
          thirdVisibleCount = await readVisibleFeedArticleCount(page);
          break;
        } catch {
          thirdVisibleCount = await readVisibleFeedArticleCount(page);
        }

        if (thirdVisibleCount > secondVisibleCount) {
          break;
        }
      }

      expect(thirdVisibleCount).toBeGreaterThan(secondVisibleCount);
    });

    test(`preserves the top visible article position during inverted pagination on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await enableMobileInvertedScroll(page);
      await gotoPreviewDashboard(page);
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { exact: true, name: "all" }).click();

      await configureArticlesPerPage(page, 4);
      await expect(readInvertedScrollAttribute(page)).resolves.toBe("true");

      await wheelActiveFeedViewport(page, -700);
      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(8);

      const anchorBeforeLoad = await readTopVisibleFeedArticle(
        page,
        STABLE_TOP_VISIBLE_ARTICLE_OFFSET_PX,
      );
      expect(anchorBeforeLoad?.articleKey).not.toBeNull();

      await wheelActiveFeedViewport(page, -700);

      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(12);

      const anchorAfterLoad = await readTopVisibleFeedArticle(
        page,
        STABLE_TOP_VISIBLE_ARTICLE_OFFSET_PX,
      );
      expect(anchorAfterLoad?.articleKey).not.toBeNull();
      expect(
        Math.abs(
          (anchorAfterLoad?.offsetTop ?? 0) -
            (anchorBeforeLoad?.offsetTop ?? 0),
        ),
      ).toBeLessThanOrEqual(STABLE_TOP_VISIBLE_ARTICLE_TOLERANCE_PX);
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

    test(`collapses inverted explore refresh back to one page plus overflow on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await enableMobileInvertedScroll(page);
      await gotoPreviewDashboard(page);
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { exact: true, name: "all" }).click();

      await configureArticlesPerPage(page, 4);
      await expect(readInvertedScrollAttribute(page)).resolves.toBe("true");

      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(4);

      await expandInvertedMobileWindow(page);
      const expandedCount = await readVisibleFeedArticleCount(page);
      const expandedMetrics = await readFeedViewportMetrics(page);

      expect(expandedMetrics.scrollHeight).toBeGreaterThan(
        expandedMetrics.clientHeight,
      );

      await expectMobileRefreshCollapse(page);
      const collapsedCount = await readVisibleFeedArticleCount(page);

      expect(collapsedCount).toBeGreaterThanOrEqual(4);
      expect(collapsedCount).toBeLessThan(expandedCount);
    });

    test(`rearms inverted mobile pagination after refresh collapses the expanded explore window on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await enableMobileInvertedScroll(page);
      await gotoPreviewDashboard(page);
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { exact: true, name: "all" }).click();

      await configureArticlesPerPage(page, 4);
      await expect(readInvertedScrollAttribute(page)).resolves.toBe("true");

      await expandInvertedMobileWindow(page);
      await expectMobileRefreshCollapse(page);

      const collapsedWindow = await readRenderedItemWindow(page);
      expect(collapsedWindow.maxIndex).not.toBeNull();
      expect(collapsedWindow.maxIndex!).toBeLessThan(11);

      await rearmInvertedMobilePaginationAfterRefresh(page);

      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThan(collapsedWindow.maxIndex!);
    });

    test(`collapses standard mobile explore refresh back to one page plus overflow on ${viewportCase.name}`, async ({
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
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(4);

      await expandStandardMobileWindow(page);
      const expandedCount = await readVisibleFeedArticleCount(page);

      await expectMobileRefreshCollapse(page);
      const collapsedCount = await readVisibleFeedArticleCount(page);

      expect(collapsedCount).toBeGreaterThanOrEqual(4);
      expect(collapsedCount).toBeLessThan(expandedCount);

      const collapsedWindow = await readRenderedItemWindow(page);
      expect(collapsedWindow.maxIndex).not.toBeNull();
      expect(collapsedWindow.maxIndex!).toBeLessThan(11);

      await scrollFeedViewportToBottom(page);
      await triggerFeedViewportWheelIntent(page, 240);
      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThan(collapsedWindow.maxIndex!);
    });
  }
});
