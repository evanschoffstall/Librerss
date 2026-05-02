/**
 * Desktop dashboard feed pagination regressions focused on visible-read refill
 * thresholds and repeated unread-window replacement cycles.
 */

import type { Page } from "@playwright/test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DESKTOP_VIEWPORT_CASES,
  readStableDesktopMarkVisibleReadBaseline,
  waitForStableDesktopMarkVisibleReadCycle,
} from "./dashboard-feed-pagination-support";
import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  installDeterministicFeedBatchRoute,
  readFeedArticleClipState,
  readVisibleFeedArticleCount,
  selectArticleFilter,
} from "./helpers";
import { expect, test } from "./test";

interface E2ECredentials {
  email: string;
  password: string;
}

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

function getDashboardLoginCredentials(): E2ECredentials {
  const explicitEmail = process.env.LIBRERSS_E2E_EMAIL?.trim();
  const explicitPassword = process.env.LIBRERSS_E2E_PASSWORD?.trim();

  if (explicitEmail && explicitPassword) {
    return { email: explicitEmail, password: explicitPassword };
  }

  const localEnvFile = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  const email = readEnvFileValue(localEnvFile, "DEV_AUTO_LOGIN_EMAIL");
  const password = readEnvFileValue(localEnvFile, "DEV_AUTO_LOGIN_PASSWORD");

  if (!email || !password) {
    throw new Error(
      "Missing dashboard e2e credentials. Set LIBRERSS_E2E_EMAIL and LIBRERSS_E2E_PASSWORD, or provide DEV_AUTO_LOGIN_EMAIL and DEV_AUTO_LOGIN_PASSWORD in .env.local.",
    );
  }

  return { email, password };
}

async function gotoAuthenticatedDashboard(page: Page) {
  const credentials = getDashboardLoginCredentials();

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  if ((await page.locator("article[data-article-key]").count()) > 0) {
    return;
  }

  await expect(page.getByText("Sign in to LibreRSS")).toBeVisible();
  const loginResponse = await page.evaluate(async ({ email, password }) => {
    const response = await fetch("/api/auth/login", {
      body: JSON.stringify({ email, password }),
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };
  }, credentials);

  expect(
    loginResponse.ok,
    `Expected browser-context /api/auth/login to succeed, received ${loginResponse.status} ${loginResponse.statusText}`,
  ).toBe(true);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard$/);
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

function readEnvFileValue(fileContents: string, key: string) {
  const match = fileContents.match(new RegExp(`^${key}=(.*)$`, "mu"));

  return match?.[1]?.trim() ?? null;
}

async function selectLocalCategory(page: Page) {
  const localCategoryButton = page.getByRole("button", {
    exact: true,
    name: "Local",
  });

  await expect(localCategoryButton).toBeVisible({ timeout: 15_000 });
  await localCategoryButton.click();
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
    const totalArticlesPerFeed = 10;
    const totalReadableArticles = totalArticlesPerFeed * 2;

    await installReadStatusRoute(page, readArticleIds);
    await page.unroute("**/api/feeds/batch");
    await installDeterministicFeedBatchRoute(page, {
      articleFeedCount: 2,
      readArticleIdsRef: readArticleIds,
      respectArticleLimit: true,
      totalArticlesPerFeed,
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
});
