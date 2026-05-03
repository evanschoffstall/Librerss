import type { Page } from "@playwright/test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  expectArticleExpanded,
  installDeterministicArticleExtractRoute,
  installDeterministicFeedBatchRoute,
} from "./helpers";
import { expect, test } from "./test";

const BATCH_REFRESH_BUDGET_EXHAUSTED_MESSAGE =
  "Batch refresh budget exhausted before feed refresh started";

interface E2ECredentials {
  email: string;
  password: string;
}

/**
 * Resolves login credentials for the real dashboard sign-in flow.
 *
 * Playwright runtime intentionally disables the automatic dev-login redirect,
 * so this test signs in through the normal UI using credentials provided by
 * explicit e2e env vars or the local development env file.
 */
function getDashboardLoginCredentials(): E2ECredentials {
  const explicitEmail = process.env.LIBRERSS_E2E_EMAIL?.trim();
  const explicitPassword = process.env.LIBRERSS_E2E_PASSWORD?.trim();

  if (explicitEmail && explicitPassword) {
    return { email: explicitEmail, password: explicitPassword };
  }

  const localEnvFilePath = join(process.cwd(), ".env.local");
  const localEnvFile = readFileSync(localEnvFilePath, "utf8");
  const email = readEnvFileValue(localEnvFile, "DEV_AUTO_LOGIN_EMAIL");
  const password = readEnvFileValue(localEnvFile, "DEV_AUTO_LOGIN_PASSWORD");

  if (!email || !password) {
    throw new Error(
      "Missing dashboard e2e credentials. Set LIBRERSS_E2E_EMAIL and LIBRERSS_E2E_PASSWORD, or provide DEV_AUTO_LOGIN_EMAIL and DEV_AUTO_LOGIN_PASSWORD in .env.local.",
    );
  }

  return { email, password };
}

/**
 * Navigates to the authenticated dashboard and waits for the first article card
 * to render after any login or redirect work completes.
 */
async function gotoAuthenticatedDashboard(page: Page) {
  const credentials = getDashboardLoginCredentials();
  const visibleArticles = page.locator("article[data-article-key]:visible");

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  if ((await visibleArticles.count()) > 0) {
    await expect(visibleArticles.first()).toBeVisible({ timeout: 15_000 });
    return;
  }

  await expect(page.getByText("Sign in to LibreRSS")).toBeVisible();

  const loginResponse = await page.evaluate(async ({ email, password }) => {
    const response = await fetch("/api/auth/login", {
      body: JSON.stringify({ email, password }),
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
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
  await normalizeDashboardArticleVisibility(page);
  await expect
    .poll(async () => {
      return await page.locator("article[data-article-key]").count();
    })
    .toBeGreaterThan(0);
  await expect(visibleArticles.first()).toBeVisible({ timeout: 15_000 });
}

async function normalizeDashboardArticleVisibility(page: Page) {
  const searchInput = page.getByPlaceholder("Search...");
  await expect(searchInput).toBeVisible({ timeout: 15_000 });

  const allFilterButton = page.getByRole("button", {
    exact: true,
    name: "all",
  });
  await expect(allFilterButton).toBeVisible({ timeout: 15_000 });

  const allFeedsButton = page.getByRole("button", {
    exact: true,
    name: "All Feeds",
  });
  await expect(allFeedsButton).toBeVisible({ timeout: 15_000 });

  await searchInput.fill("");
  await allFilterButton.click();
  await allFeedsButton.click();
}

function readEnvFileValue(fileContents: string, key: string) {
  const match = fileContents.match(new RegExp(`^${key}=(.*)$`, "mu"));

  return match?.[1]?.trim() ?? null;
}

test.describe("dashboard feed error recovery", () => {
  test("keeps the previous article list visible when a refresh batch returns 504", async ({
    page,
  }) => {
    const shouldFailNextBatchRequest = { current: false };
    await installDeterministicArticleExtractRoute(page);
    await installDeterministicFeedBatchRoute(page, {
      articleHasFullContent: false,
      failNextBatchRequestRef: shouldFailNextBatchRequest,
    });

    await gotoAuthenticatedDashboard(page);

    const visibleArticles = page.locator("article[data-article-key]:visible");
    const firstArticle = visibleArticles.first();
    const firstArticleKey = await firstArticle.getAttribute("data-article-key");

    expect(firstArticleKey).toBeTruthy();

    const initialArticleCount = await page.evaluate(() => {
      return document.querySelectorAll("article[data-article-key]").length;
    });
    expect(initialArticleCount).toBeGreaterThan(0);

    shouldFailNextBatchRequest.current = true;

    await page
      .getByRole("button", { exact: true, name: "Refresh selected feed" })
      .last()
      .click();

    await expect(
      page.getByText("Unable to load this feed right now."),
    ).toBeVisible({ timeout: 10_000 });

    await expect(firstArticle).toBeVisible();
    await expect(visibleArticles).toHaveCount(initialArticleCount);
    await expect(
      page.locator(
        `article[data-article-key="${String(firstArticleKey)}"]:visible`,
      ),
    ).toBeVisible();

    await firstArticle.click();
    await expectArticleExpanded(firstArticle, true);
    await expect(firstArticle).toContainText("Deterministic extract", {
      timeout: 10_000,
    });
  });

  test("keeps the previous article list visible when proxy credentials cannot be read", async ({
    page,
  }) => {
    const shouldFailNextBatchRequest = { current: false };
    await installDeterministicArticleExtractRoute(page);
    await installDeterministicFeedBatchRoute(page);
    await page.route("**/api/feeds/batch", async (route) => {
      if (!shouldFailNextBatchRequest.current) {
        await route.fallback();
        return;
      }

      shouldFailNextBatchRequest.current = false;
      await route.fulfill({
        body: JSON.stringify({
          error:
            "Saved proxy password could not be read. Update it in settings and try again.",
          reason: "proxy-password-unreadable",
        }),
        contentType: "application/json",
        status: 500,
      });
    });

    await gotoAuthenticatedDashboard(page);

    const visibleArticles = page.locator("article[data-article-key]:visible");
    const firstArticle = visibleArticles.first();
    const firstArticleKey = await firstArticle.getAttribute("data-article-key");

    expect(firstArticleKey).toBeTruthy();

    const initialArticleCount = await page.evaluate(() => {
      return document.querySelectorAll("article[data-article-key]").length;
    });
    expect(initialArticleCount).toBeGreaterThan(0);

    shouldFailNextBatchRequest.current = true;

    await page
      .getByRole("button", { exact: true, name: "Refresh selected feed" })
      .last()
      .click();

    await expect(page.getByText("Proxy credentials unavailable.")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(
        "Re-enter your proxy password in Settings to restore feed access.",
      ),
    ).toBeVisible();

    await expect(firstArticle).toBeVisible();
    await expect(visibleArticles).toHaveCount(initialArticleCount);
    await expect(
      page.locator(
        `article[data-article-key="${String(firstArticleKey)}"]:visible`,
      ),
    ).toBeVisible();
  });

  test("keeps successful all-feeds refresh results when one feed exhausts the refresh budget", async ({
    page,
  }) => {
    await installDeterministicArticleExtractRoute(page);
    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route.request().postDataJSON() as {
        forceRefresh?: boolean;
        urls?: string[];
      };
      const urls = Array.isArray(requestBody.urls) ? requestBody.urls : [];
      const payload = urls.map((url, index) => {
        if (requestBody.forceRefresh === true && index === 0) {
          return {
            articles: [],
            error: BATCH_REFRESH_BUDGET_EXHAUSTED_MESSAGE,
            ok: false,
            url,
          };
        }

        return {
          articles: [
            {
              content: requestBody.forceRefresh
                ? "Recovered from mixed refresh."
                : "Initial dashboard article.",
              feedId: index + 1,
              feedName: `Feed ${index + 1}`,
              feedUrl: url,
              hasFullContent: true,
              id: requestBody.forceRefresh ? 10_000 + index : index + 1,
              isRead: false,
              isStarred: false,
              lastChecked: "2026-05-03T12:00:00.000Z",
              link: `https://example.com/mixed-refresh-${index + 1}`,
              publicationDate: "2026-05-03T11:59:00.000Z",
              title: requestBody.forceRefresh
                ? `Recovered refresh article ${index + 1}`
                : `Initial article ${index + 1}`,
            },
          ],
          lastFetchedAt: "2026-05-03T12:00:00.000Z",
          ok: true,
          url,
        };
      });

      await route.fulfill({
        body: JSON.stringify(payload),
        contentType: "application/json",
        status: requestBody.forceRefresh === true ? 207 : 200,
      });
    });

    await gotoAuthenticatedDashboard(page);

    await page
      .getByRole("button", { exact: true, name: "Refresh selected feed" })
      .last()
      .click();

    await expect(
      page.getByText(/Recovered refresh article/).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Unable to load this feed right now."),
    ).toHaveCount(0);
    await expect(page.getByText("Some feeds failed to update")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("renders a live search result from a fresh searched batch window", async ({
    page,
  }) => {
    const searchedBatchBodies: unknown[] = [];

    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route.request().postDataJSON() as {
        knownLastFetchedAtByUrl?: Record<string, string>;
        requestSource?: string;
        searchTerm?: string;
        urls?: string[];
      };
      const urls = Array.isArray(requestBody.urls) ? requestBody.urls : [];
      const isSearchRequest = requestBody.requestSource === "search-change";

      if (isSearchRequest) {
        searchedBatchBodies.push(requestBody);
      }

      const payload = urls.map((url, index) => ({
        articles:
          isSearchRequest && index === 0
            ? [
                {
                  content: "A searched batch article returned by the server.",
                  feedId: 9001,
                  feedName: "Livescience",
                  feedUrl: url,
                  hasFullContent: true,
                  id: 9001,
                  isRead: false,
                  isStarred: false,
                  lastChecked: "2026-04-27T02:00:00.000Z",
                  link: "https://example.com/livescience-search-result",
                  publicationDate: "2026-04-27T01:59:00.000Z",
                  title: "Livescience search result",
                },
              ]
            : [
                {
                  content: "Initial dashboard article.",
                  feedId: index + 1,
                  feedName: `Initial Feed ${index + 1}`,
                  feedUrl: url,
                  hasFullContent: true,
                  id: index + 1,
                  isRead: false,
                  isStarred: false,
                  lastChecked: "2026-04-27T01:55:00.000Z",
                  link: `https://example.com/initial-${index + 1}`,
                  publicationDate: "2026-04-27T01:54:00.000Z",
                  title: `Initial article ${index + 1}`,
                },
              ],
        lastFetchedAt: "2026-04-27T02:00:00.000Z",
        ok: true,
        url,
      }));

      await route.fulfill({
        body: JSON.stringify(payload),
        contentType: "application/json",
        status: 200,
      });
    });

    await gotoAuthenticatedDashboard(page);

    await page.getByPlaceholder("Search...").fill("livescience");
    await expect(page.getByText("Livescience search result")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "No results" })).toHaveCount(
      0,
    );

    await expect
      .poll(() => searchedBatchBodies.length)
      .toBeGreaterThanOrEqual(1);
    expect(
      (searchedBatchBodies.at(-1) as { knownLastFetchedAtByUrl?: unknown })
        .knownLastFetchedAtByUrl,
    ).toBeUndefined();
  });
});
