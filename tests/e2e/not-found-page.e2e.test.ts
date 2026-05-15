import { expect } from "@playwright/test";

import { test } from "./test";

/**
 * Playwright end-to-end tests for the app-wide `not-found` route.
 *
 * These tests prove the dedicated 404 surface keeps the same intentional dark
 * presentation even when the browser has a persisted light-theme preference.
 */
test.describe("app not-found page", () => {
  test("forces the dedicated dark status-page styling even when the stored theme is light", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("theme", "light");
    });

    await page.goto("/this-route-does-not-exist");

    await expect(page.locator("[data-status-page='404']")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.locator("[data-status-page='404']")).toHaveClass(
      /\bdark\b/u,
    );

    const backgroundColor = await page.locator("main").evaluate((element) => {
      return window.getComputedStyle(element).backgroundColor;
    });

    expect(backgroundColor).toBe("rgb(10, 10, 10)");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /back to home/i }),
    ).toBeVisible();
  });
});
