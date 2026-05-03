/**
 * Desktop dashboard feed pagination regressions focused on bounded initial
 * rendering and scroll-triggered page growth.
 */

import type { Page } from "@playwright/test";

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
  readFeedArticleClipState,
  readMountedFeedArticleCount,
  readRenderedArticleCount,
  readRenderedItemWindow,
  readVisibleFeedArticleCount,
  scrollFeedViewportToBottom,
  selectArticleFilter,
  setFeedViewportScrollTop,
  triggerFeedViewportWheelIntent,
} from "./helpers";
import { expect, test } from "./test";

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

  test("keeps browser batch article-window requests above the historical 500 article ceiling", async ({
    page,
  }) => {
    const requestedArticleLimits: number[] = [];

    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route.request().postDataJSON() as {
        articleLimit?: unknown;
        urls?: string[];
      };
      if (typeof requestBody.articleLimit === "number") {
        requestedArticleLimits.push(requestBody.articleLimit);
      }

      const urls = Array.isArray(requestBody.urls) ? requestBody.urls : [];
      const boundedWindowSize = 20;
      const sourceCount = Math.max(1, urls.length);
      const payload = urls.map((url, feedIndex) => ({
        articles: Array.from(
          { length: Math.ceil(boundedWindowSize / sourceCount) },
          (_ignored, articleIndex) => {
            const articleNumber = articleIndex * sourceCount + feedIndex + 1;

            if (articleNumber > boundedWindowSize) {
              return null;
            }

            return {
              content: `Large-window regression article ${articleNumber}`,
              feedId: feedIndex + 1,
              feedUrl: url,
              hasFullContent: true,
              id: articleNumber,
              isRead: false,
              isStarred: false,
              lastChecked: "2026-03-13T10:00:00.000Z",
              link: `https://example.com/large-window/${articleNumber}`,
              publicationDate: new Date(
                Date.UTC(2026, 2, 13, 9, 0, 0) - articleNumber * 1_000,
              ).toISOString(),
              title: `Large Window Article ${articleNumber}`,
            };
          },
        ).filter((article) => article !== null),
        ok: true,
        url,
      }));

      await route.fulfill({
        body: JSON.stringify(payload),
        contentType: "application/json",
        status: 200,
      });
    });

    await gotoPreviewDashboard(page);
    const responseStatus = await page.evaluate(async () => {
      const response = await fetch("/api/feeds/batch", {
        body: JSON.stringify({
          articleFilter: "unread",
          articleLimit: 600,
          skipRefresh: true,
          urls: ["https://example.com/feed"],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      return response.status;
    });

    expect(responseStatus).toBe(200);
    expect(requestedArticleLimits).toContain(600);
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
      await selectArticleFilter(page, "all");
      await configureArticlesPerPage(page, 4);

      const initialVisibleCount = await waitForInitialClippedWindow(page, 4);
      expect(initialVisibleCount).toBeGreaterThan(4);
      expect(initialVisibleCount).toBeLessThan(8);
      expect(await readRenderedArticleCount(page)).toBe(initialVisibleCount);
      await expect
        .poll(async () => {
          return await readMountedFeedArticleCount(page);
        })
        .toBeLessThanOrEqual(initialVisibleCount);
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
      await selectArticleFilter(page, "all");

      await configureArticlesPerPage(page, 4);

      const initialVisibleCount = await waitForInitialClippedWindow(page, 4);
      await expect
        .poll(async () => {
          return await hasLoadMoreSentinel(page);
        })
        .toBe(true);

      await triggerFeedViewportWheelIntent(page, 240);
      await scrollFeedViewportToBottom(page);
      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(initialVisibleCount + 4);

      await triggerFeedViewportWheelIntent(page, 240);
      await scrollFeedViewportToBottom(page);
      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(initialVisibleCount + 8);

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
      await selectArticleFilter(page, "all");
      await configureArticlesPerPage(page, 4);

      const initialVisibleCount = await waitForInitialClippedWindow(page, 4);

      // The clipped-overflow baseline starts with only enough rows to expose a
      // partial next article; scroll to the bottom twice to reliably trigger the
      // initial boundary load, then exercise the 70 % early-trigger contract on
      // the second page.
      await scrollFeedViewportToBottom(page);
      await scrollFeedViewportToBottom(page);
      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(initialVisibleCount + 4);

      const initialMetrics = await readFeedViewportMetrics(page);
      await setFeedViewportScrollTop(
        page,
        Math.floor(initialMetrics.maxScrollTop * 0.7),
      );

      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(initialVisibleCount + 8);
      await expect
        .poll(async () => {
          return (await readFeedViewportMetrics(page)).remaining;
        })
        .toBeGreaterThan(0);

      const firstRevealMetrics = await readFeedViewportMetrics(page);
      await setFeedViewportScrollTop(
        page,
        Math.floor(firstRevealMetrics.maxScrollTop * 0.35),
      );
      await expect
        .poll(async () => {
          const metrics = await readFeedViewportMetrics(page);

          return metrics.remaining;
        })
        .toBeGreaterThan(0);
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
          return await readVisibleFeedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(initialVisibleCount + 8);
    });
  }
});
