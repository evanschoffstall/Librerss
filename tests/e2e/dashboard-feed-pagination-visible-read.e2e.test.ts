/**
 * Desktop dashboard feed pagination regressions focused on visible-read refill
 * thresholds and repeated unread-window replacement cycles.
 */

import type { Page } from "@playwright/test";

import {
  DESKTOP_VIEWPORT_CASES,
  readStableDesktopMarkVisibleReadBaseline,
  waitForStableDesktopMarkVisibleReadCycle,
} from "./dashboard-feed-pagination-support";
import {
  articleCard,
  configureArticlesPerPage,
  gotoAuthenticatedDashboard,
  gotoPreviewDashboard,
  installDeterministicFeedBatchRoute,
  readFeedArticleClipState,
  readVisibleFeedArticleCount,
  selectArticleFilter,
} from "./helpers";
import { expect, test } from "./test";

async function clickMarkFullyVisibleArticlesAsRead(page: Page) {
  const markFullyVisibleArticlesAsReadButton = page.getByRole("button", {
    name: "Mark fully visible articles as read",
  });

  await expect(markFullyVisibleArticlesAsReadButton).toBeEnabled({
    timeout: 20_000,
  });

  try {
    await markFullyVisibleArticlesAsReadButton.click({ timeout: 20_000 });
  } catch {
    await markFullyVisibleArticlesAsReadButton.click({
      force: true,
      timeout: 20_000,
    });
  }
}

async function installDelayedReadStatusRoute(
  page: Page,
  readArticleIds: Set<number>,
) {
  let releaseStatusRequests!: () => void;
  const releasePromise = new Promise<void>((resolve) => {
    releaseStatusRequests = resolve;
  });
  const requestedArticleIds: number[] = [];

  await page.route("**/api/articles/status", async (route) => {
    const requestBody = route.request().postDataJSON() as {
      articleId?: number;
      isRead?: boolean;
    };

    if (typeof requestBody.articleId === "number") {
      requestedArticleIds.push(requestBody.articleId);
    }

    await releasePromise;

    if (typeof requestBody.articleId === "number") {
      if (requestBody.isRead === false) {
        readArticleIds.delete(requestBody.articleId);
      } else {
        readArticleIds.add(requestBody.articleId);
      }
    }

    await route.fulfill({
      body: JSON.stringify({ ok: true }),
      contentType: "application/json",
      status: 200,
    });
  });

  return {
    releaseStatusRequests,
    requestedArticleIds,
  };
}

async function installReadStatusRoute(page: Page, readArticleIds: Set<number>) {
  await page.route("**/api/articles/status", async (route) => {
    const requestBody = route.request().postDataJSON() as {
      articleId?: number;
      isRead?: boolean;
    };

    if (typeof requestBody.articleId === "number") {
      if (requestBody.isRead === false) {
        readArticleIds.delete(requestBody.articleId);
      } else {
        readArticleIds.add(requestBody.articleId);
      }
    }

    await route.fulfill({
      body: JSON.stringify({ ok: true }),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function readRenderedArticleReadActionLabels(
  page: Page,
  articleKeys: string[],
) {
  return await page.evaluate((keys) => {
    return Object.fromEntries(
      keys.map((articleKey) => {
        const articleElement = document.querySelector<HTMLElement>(
          `article[data-article-key="${CSS.escape(articleKey)}"]`,
        );
        const readActionLabel = articleElement
          ?.querySelector<HTMLButtonElement>(
            "button[aria-label='Mark as read'], button[aria-label='Mark as unread']",
          )
          ?.getAttribute("aria-label");

        return [articleKey, readActionLabel ?? null];
      }),
    );
  }, articleKeys);
}

async function selectLocalCategory(page: Page) {
  const localCategoryButton = page.getByRole("button", {
    exact: true,
    name: "Local",
  });

  await expect(localCategoryButton).toBeVisible({ timeout: 15_000 });
  await localCategoryButton.click();
}

async function selectSortOrder(page: Page, sortOrder: "newest" | "oldest") {
  const sortOrderButton = page.locator(
    "[data-dashboard-filter-bar-sort-order]",
  );

  await expect(sortOrderButton).toBeVisible({ timeout: 15_000 });

  for (const _attempt of Array.from({ length: 2 })) {
    if (
      (await sortOrderButton.getAttribute(
        "data-dashboard-filter-bar-sort-order",
      )) === sortOrder
    ) {
      return;
    }

    await sortOrderButton.click();
  }

  await expect(sortOrderButton).toHaveAttribute(
    "data-dashboard-filter-bar-sort-order",
    sortOrder,
  );
}

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

  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
    test(`keeps visible-read replacement bounded to the clipped overflow window on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await selectArticleFilter(page, "unread");
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await waitForInitialClippedWindow(page, 4);

      const initialSnapshot =
        await readStableDesktopMarkVisibleReadBaseline(page);

      await page
        .getByRole("button", { name: "Mark fully visible articles as read" })
        .click();

      const replacementSnapshot =
        await waitForStableDesktopMarkVisibleReadCycle(
          page,
          5,
          initialSnapshot.fullyVisibleArticleKeys,
        );

      expect(replacementSnapshot.renderedCount).toBeGreaterThanOrEqual(5);
      expect(replacementSnapshot.renderedCount).toBeLessThan(12);
      await expect
        .poll(async () => {
          const visibleCount = await readVisibleFeedArticleCount(page);

          return visibleCount >= 5 && visibleCount < 12;
        })
        .toBe(true);
    });

    test(`keeps repeated visible-read refills stable across available replacement pages on ${viewportCase.name}`, async ({
      page,
    }) => {
      test.slow();

      const repeatedCyclePageSize = 4;
      const repeatedCycleViewportHeight = Math.max(viewportCase.height, 780);
      const markViewportReadButton = page.getByRole("button", {
        name: "Mark fully visible articles as read",
      });

      await page.setViewportSize({
        height: repeatedCycleViewportHeight,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await selectArticleFilter(page, "unread");
      await configureArticlesPerPage(page, repeatedCyclePageSize);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect(markViewportReadButton).toBeEnabled({ timeout: 15_000 });

      const initialSnapshot =
        await readStableDesktopMarkVisibleReadBaseline(page);
      const minimumRenderedCount = repeatedCyclePageSize + 1;

      expect(
        initialSnapshot.fullyVisibleArticleKeys.length,
      ).toBeGreaterThanOrEqual(repeatedCyclePageSize);
      expect(initialSnapshot.renderedCount).toBeGreaterThanOrEqual(
        repeatedCyclePageSize + 1,
      );
      expect(initialSnapshot.renderedCount).toBeLessThan(
        repeatedCyclePageSize * 3,
      );

      await expect(markViewportReadButton).toBeEnabled();
      await clickMarkFullyVisibleArticlesAsRead(page);

      const calibratedSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
        page,
        minimumRenderedCount,
        initialSnapshot.fullyVisibleArticleKeys,
      );

      let previousSnapshot = calibratedSnapshot;

      for (const _cycleIndex of Array.from(
        { length: 3 },
        (_, index) => index,
      )) {
        await clickMarkFullyVisibleArticlesAsRead(page);

        previousSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
          page,
          minimumRenderedCount,
          previousSnapshot.fullyVisibleArticleKeys,
        );

        expect(previousSnapshot.renderedCount).toBeGreaterThanOrEqual(
          repeatedCyclePageSize + 1,
        );
        expect(previousSnapshot.renderedCount).toBeLessThan(
          repeatedCyclePageSize * 3,
        );
      }
    });
  }

  test("keeps the unread empty state true after every finite article is marked visible-read and the browser refreshes", async ({
    page,
  }) => {
    test.slow();

    const readArticleIds = new Set<number>();
    const requestedArticleLimits: number[] = [];
    const totalArticlesPerFeed = 6;
    const totalReadableArticles = totalArticlesPerFeed * 2;

    await installReadStatusRoute(page, readArticleIds);
    await page.unroute("**/api/feeds/batch");
    await installDeterministicFeedBatchRoute(page, {
      articleFeedCount: 2,
      readArticleIdsRef: readArticleIds,
      respectArticleLimit: true,
      totalArticlesPerFeed,
    });
    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route.request().postDataJSON() as {
        articleLimit?: unknown;
      };

      if (typeof requestBody.articleLimit === "number") {
        requestedArticleLimits.push(requestBody.articleLimit);
      }

      await route.fallback();
    });
    await page.setViewportSize({ height: 840, width: 1280 });

    await gotoAuthenticatedDashboard(page);
    await selectLocalCategory(page);
    await selectArticleFilter(page, "unread");
    await configureArticlesPerPage(page, 4);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    for (const _cycleIndex of Array.from({ length: 80 })) {
      if (
        readArticleIds.size >= totalReadableArticles ||
        (await page.locator("article[data-article-key]").count()) === 0
      ) {
        break;
      }

      const previousReadCount = readArticleIds.size;
      await clickMarkFullyVisibleArticlesAsRead(page);
      await expect
        .poll(() => readArticleIds.size, { timeout: 15_000 })
        .toBeGreaterThan(previousReadCount);
    }

    await expect
      .poll(() => readArticleIds.size, { timeout: 20_000 })
      .toBe(totalReadableArticles);
    expect(
      requestedArticleLimits.filter((articleLimit) => articleLimit % 4 !== 0),
      `Visible-read pagination must request exact page-size increments. Captured limits: ${JSON.stringify(
        requestedArticleLimits,
      )}`,
    ).toEqual([]);
    await expect(page.locator("article[data-article-key]")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByText("You're up to date")).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await selectArticleFilter(page, "unread");

    await expect(page.locator("article[data-article-key]")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByText("You're up to date")).toBeVisible();
  });

  test("continues visible-read unread refill after switching sort order", async ({
    page,
  }) => {
    test.slow();

    const readArticleIds = new Set<number>();
    const requestedArticleLimits: number[] = [];
    const requestedSortOrders: string[] = [];
    const totalArticlesPerFeed = 6;
    const totalReadableArticles = totalArticlesPerFeed * 2;

    await installReadStatusRoute(page, readArticleIds);
    await page.unroute("**/api/feeds/batch");
    await installDeterministicFeedBatchRoute(page, {
      articleFeedCount: 2,
      readArticleIdsRef: readArticleIds,
      respectArticleLimit: true,
      totalArticlesPerFeed,
    });
    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route.request().postDataJSON() as {
        articleLimit?: unknown;
        articleSortOrder?: unknown;
      };

      if (typeof requestBody.articleLimit === "number") {
        requestedArticleLimits.push(requestBody.articleLimit);
      }

      if (typeof requestBody.articleSortOrder === "string") {
        requestedSortOrders.push(requestBody.articleSortOrder);
      }

      await route.fallback();
    });
    await page.setViewportSize({ height: 840, width: 1280 });

    await gotoAuthenticatedDashboard(page);
    await selectLocalCategory(page);
    await selectArticleFilter(page, "unread");
    await configureArticlesPerPage(page, 4);
    await selectSortOrder(page, "oldest");
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    for (const _cycleIndex of Array.from({ length: 60 })) {
      if (
        readArticleIds.size >= totalReadableArticles ||
        (await page.locator("article[data-article-key]").count()) === 0
      ) {
        break;
      }

      const previousReadCount = readArticleIds.size;
      await clickMarkFullyVisibleArticlesAsRead(page);
      await expect
        .poll(() => readArticleIds.size, { timeout: 15_000 })
        .toBeGreaterThan(previousReadCount);
    }

    await expect
      .poll(() => readArticleIds.size, { timeout: 20_000 })
      .toBe(totalReadableArticles);
    expect(requestedSortOrders).toContain("oldest");
    expect(
      requestedArticleLimits.filter((articleLimit) => articleLimit % 4 !== 0),
      `Sorted visible-read pagination must request exact page-size increments. Captured limits: ${JSON.stringify(
        requestedArticleLimits,
      )}`,
    ).toEqual([]);
    await expect(page.locator("article[data-article-key]")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByText("You're up to date")).toBeVisible();
  });

  test("keeps delayed visible-read articles read after a sort switch", async ({
    page,
  }) => {
    test.slow();

    const readArticleIds = new Set<number>();
    const delayedReadStatus = await installDelayedReadStatusRoute(
      page,
      readArticleIds,
    );

    await page.unroute("**/api/feeds/batch");
    await installDeterministicFeedBatchRoute(page, {
      articleFeedCount: 2,
      readArticleIdsRef: readArticleIds,
      respectArticleLimit: true,
      totalArticlesPerFeed: 4,
    });
    await page.setViewportSize({ height: 840, width: 1280 });

    await gotoAuthenticatedDashboard(page);
    await selectLocalCategory(page);
    await selectArticleFilter(page, "all");
    await configureArticlesPerPage(page, 4);
    await selectSortOrder(page, "newest");
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    const initialSnapshot =
      await readStableDesktopMarkVisibleReadBaseline(page);
    const markedArticleKeys = initialSnapshot.fullyVisibleArticleKeys;

    expect(markedArticleKeys.length).toBeGreaterThanOrEqual(4);

    await clickMarkFullyVisibleArticlesAsRead(page);
    await expect
      .poll(() => delayedReadStatus.requestedArticleIds.length, {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(markedArticleKeys.length);

    await selectSortOrder(page, "oldest");
    await selectSortOrder(page, "newest");

    delayedReadStatus.releaseStatusRequests();

    await expect
      .poll(
        async () => {
          const readActionLabels = await readRenderedArticleReadActionLabels(
            page,
            markedArticleKeys,
          );

          return Object.values(readActionLabels).filter(
            (label): label is string => label !== null,
          ).length;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    await expect
      .poll(async () => {
        const readActionLabels = await readRenderedArticleReadActionLabels(
          page,
          markedArticleKeys,
        );
        const renderedLabels = Object.values(readActionLabels).filter(
          (label): label is string => label !== null,
        );

        return renderedLabels.filter((label) => label === "Mark as read");
      })
      .toEqual([]);
  });
});
