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

/**
 * Repeatedly scrolls far enough to reveal at least three configured pages so
 * refresh regressions can prove the surface collapses back to the minimum
 * overflow window instead of preserving stale reveal state.
 */
async function expandDesktopFeedWindow(page: Page) {
  await scrollFeedViewportToBottom(page);
  await scrollFeedViewportToBottom(page);

  await expect
    .poll(async () => {
      return await readRenderedArticleCount(page);
    })
    .toBeGreaterThanOrEqual(12);
}

/**
 * Confirms refresh collapses an expanded desktop feed back to one page plus the
 * minimum overflow while still leaving the next page available to load.
 */
async function expectDesktopRefreshCollapse(page: Page) {
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
  await expect
    .poll(async () => {
      return await hasLoadMoreSentinel(page);
    })
    .toBe(true);
}

async function readFeedViewportMetrics(page: Page) {
  return await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ),
    );
    const viewport = candidates
      .filter(
        (candidate) =>
          candidate.querySelector("article[data-article-key]") !== null,
      )
      .sort((left, right) => right.scrollHeight - left.scrollHeight)[0];

    if (!viewport) {
      throw new Error("Expected the active feed viewport to be present.");
    }

    const maxScrollTop = Math.max(
      0,
      viewport.scrollHeight - viewport.clientHeight,
    );

    return {
      clientHeight: viewport.clientHeight,
      maxScrollTop,
      remaining:
        viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight),
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
    };
  });
}

/** Rearms the desktop load-more boundary after refresh by moving away, then back. */
async function rearmDesktopPaginationAfterRefresh(page: Page) {
  const metrics = await readFeedViewportMetrics(page);

  await setFeedViewportScrollTop(page, Math.floor(metrics.maxScrollTop * 0.45));
  await page.waitForTimeout(800);

  const rearmMetrics = await readFeedViewportMetrics(page);
  await setFeedViewportScrollTop(
    page,
    Math.floor(rearmMetrics.maxScrollTop * 0.95),
  );
}

test.describe("dashboard feed pagination", () => {
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
      expect((await readRenderedItemWindow(page)).maxIndex).toBeLessThan(11);

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
          .toBeGreaterThanOrEqual(8);

        feedRequestUrls.length = 0;

        await page
          .getByRole("button", { name: "Mark fully visible articles as read" })
          .click();

        await expect
          .poll(async () => {
            return await readRenderedArticleCount(page);
          })
          .toBeGreaterThanOrEqual(8);

        await page.waitForTimeout(800);
        expect(feedRequestUrls).toEqual([]);
      } finally {
        page.off("request", handleRequest);
      }
    });

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
