import type { Page } from "@playwright/test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { installDeterministicFeedBatchRoute } from "./helpers";
import { expect, test } from "./test";

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

  const allFilterButton = page.getByRole("button", { exact: true, name: "all" });
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
    await installDeterministicFeedBatchRoute(page, {
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
  });
});
