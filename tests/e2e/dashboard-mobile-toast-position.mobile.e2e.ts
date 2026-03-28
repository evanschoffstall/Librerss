import type { Locator, Page } from "@playwright/test";

import { gotoPreviewDashboard, openDashboardSettings } from "./helpers";
import { expect, test } from "./test";

/** Returns the latest visible Sonner toast rendered by the app. */
function latestToast(page: Page): Locator {
  return page.locator("[data-sonner-toast]").last();
}

/** Returns the settings switch that controls mobile toast placement. */
function mobileToastTopSwitch(page: Page): Locator {
  return page.locator("#mobile-toast-top");
}

/** Reads the latest toast geometry relative to the current mobile viewport. */
async function readLatestToastMetrics(page: Page) {
  return await page.evaluate(() => {
    const toast = Array.from(
      document.querySelectorAll<HTMLElement>("[data-sonner-toast]"),
    ).at(-1);

    if (!toast) {
      throw new Error("Expected a visible Sonner toast.");
    }

    const rect = toast.getBoundingClientRect();
    return {
      bottomGap: Math.round((window.innerHeight - rect.bottom) * 100) / 100,
      top: Math.round(rect.top * 100) / 100,
      viewportHeight: window.innerHeight,
    };
  });
}

/** Opens the Add Feed form and submits an invalid URL to trigger a real app toast. */
async function triggerInvalidFeedToast(page: Page) {
  await page.getByRole("button", { name: "Add feed" }).first().click();

  await page.getByPlaceholder("Feed name").fill("Toast position probe");
  await page
    .getByPlaceholder("https://example.com/feed.xml")
    .fill("not-a-valid-url");
  await page.getByRole("button", { name: /^Add Feed$/ }).last().click();

  await expect(latestToast(page)).toBeVisible({ timeout: 10_000 });
}

test.describe("dashboard mobile toast placement", () => {
  test("shows toasts near the bottom when the mobile top-toast setting is off", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await openDashboardSettings(page);

    const toastTopSwitch = mobileToastTopSwitch(page);
    await expect(toastTopSwitch).toBeVisible();
    if (await toastTopSwitch.isChecked()) {
      await toastTopSwitch.click();
      await expect(toastTopSwitch).not.toBeChecked();
    }

    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "domcontentloaded" });
    await openDashboardSettings(page);

    await triggerInvalidFeedToast(page);

    const toastMetrics = await readLatestToastMetrics(page);
    expect(toastMetrics.bottomGap).toBeLessThanOrEqual(40);
    expect(toastMetrics.top).toBeGreaterThan(toastMetrics.viewportHeight / 2);
  });

  test("shows toasts near the top after enabling the mobile top-toast setting", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await openDashboardSettings(page);

    const toastTopSwitch = mobileToastTopSwitch(page);
    await expect(toastTopSwitch).toBeVisible();
    if (!(await toastTopSwitch.isChecked())) {
      await toastTopSwitch.click();
    }
    await expect(toastTopSwitch).toBeChecked();

    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "domcontentloaded" });
    await openDashboardSettings(page);

    await triggerInvalidFeedToast(page);

    const toastMetrics = await readLatestToastMetrics(page);
    expect(toastMetrics.top).toBeLessThanOrEqual(96);
    expect(toastMetrics.bottomGap).toBeGreaterThan(120);
  });
});