import type { Page } from "@playwright/test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  const visibleArticles = page.locator("article[data-article-key]:visible");
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

  await expect(page.locator("article[data-article-key]:visible").first()).toBeVisible({
    timeout: 15_000,
  });
}

function readEnvFileValue(fileContents: string, key: string) {
  const match = fileContents.match(new RegExp(`^${key}=(.*)$`, "mu"));

  return match?.[1]?.trim() ?? null;
}

test.describe("dashboard feed error recovery", () => {
  test("keeps the previous article list visible when a refresh batch returns 504", async ({
    page,
  }) => {
    await gotoAuthenticatedDashboard(page);

    const visibleArticles = page.locator("article[data-article-key]:visible");
    const firstArticle = visibleArticles.first();
    const firstArticleKey = await firstArticle.getAttribute("data-article-key");

    expect(firstArticleKey).toBeTruthy();

    const initialArticleCount = await visibleArticles.count();
    expect(initialArticleCount).toBeGreaterThan(0);

    await page.route(
      "**/api/feeds/batch",
      async (route) => {
        await route.fulfill({
          body: JSON.stringify({ error: "Gateway Timeout" }),
          contentType: "application/json",
          status: 504,
        });
      },
      { times: 1 },
    );

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