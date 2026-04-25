import type { Locator, Page } from "@playwright/test";

import {
  gotoPreviewDashboard,
  openDashboardSettings,
  openDashboardSettingsTab,
} from "./helpers";
import { expect, test } from "./test";

const MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY = "librerss:mobileUiGroupedLayout";

interface MobileToastPreferenceMatrixCase {
  expectedTop: {
    max: number;
    min: number;
  };
  mobileUiGroupedLayout: boolean;
  name: string;
}

/** Returns the latest visible Sonner toast rendered by the app. */
function latestToast(page: Page): Locator {
  return page.locator("[data-sonner-toast]").last();
}

/** Returns the settings switch that controls mobile toast placement. */
function mobileToastTopSwitch(page: Page): Locator {
  return page.locator("#mobile-ui-grouped-layout");
}

/** Reads the latest toast geometry relative to the current mobile viewport. */
async function readLatestToastMetrics(page: Page) {
  return await page.evaluate(async () => {
    const toast = Array.from(
      document.querySelectorAll<HTMLElement>("[data-sonner-toast]"),
    ).at(-1);

    if (!toast) {
      throw new Error("Expected a visible Sonner toast.");
    }

    const activeAnimations = toast
      .getAnimations({ subtree: true })
      .filter((animation) => animation.playState !== "finished");

    await Promise.allSettled(
      activeAnimations.map(async (animation) => {
        try {
          await animation.finished;
        } catch {
          // Ignore cancelled animation completions; they still mean the toast settled.
        }
      }),
    );
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });

    const rect = toast.getBoundingClientRect();
    return {
      bottomGap: Math.round((window.innerHeight - rect.bottom) * 100) / 100,
      rightGap: Math.round((window.innerWidth - rect.right) * 100) / 100,
      top: Math.round(rect.top * 100) / 100,
      viewportHeight: window.innerHeight,
    };
  });
}

/** Seeds the mobile toast and toolbar settings before the dashboard reads them. */
async function setMobileToastPreferences(
  page: Page,
  {
    mobileUiGroupedLayout,
  }: Omit<MobileToastPreferenceMatrixCase, "expectedTop" | "name">,
) {
  await page.addInitScript(
    ({
      mobileUiGroupedLayoutStorageKey,
      nextMobileUiGroupedLayout,
    }: {
      mobileUiGroupedLayoutStorageKey: string;
      nextMobileUiGroupedLayout: boolean;
    }) => {
      window.localStorage.setItem(
        mobileUiGroupedLayoutStorageKey,
        JSON.stringify(nextMobileUiGroupedLayout),
      );
    },
    {
      mobileUiGroupedLayoutStorageKey: MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
      nextMobileUiGroupedLayout: mobileUiGroupedLayout,
    },
  );
}

/** Opens the Add Feed form and submits an invalid URL to trigger a real app toast. */
async function triggerInvalidFeedToast(page: Page) {
  await openDashboardSettingsTab(page, "Feeds");
  await page.getByRole("button", { name: "Add feed" }).first().click();

  await page.getByPlaceholder("Feed name").fill("Toast position probe");
  await page
    .getByPlaceholder("https://example.com/feed.xml")
    .fill("not-a-valid-url");
  await page
    .getByRole("button", { name: /^Add Feed$/ })
    .last()
    .click();

  await expect(latestToast(page)).toBeVisible({ timeout: 10_000 });
}

test.describe("dashboard mobile toast placement", () => {
  test("shows the grouped mobile UI setting enabled by default and keeps toasts near the top", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await openDashboardSettings(page);

    const toastTopSwitch = mobileToastTopSwitch(page);
    await expect(toastTopSwitch).toBeVisible();
    await expect(toastTopSwitch).toBeChecked();

    await triggerInvalidFeedToast(page);

    const toastMetrics = await readLatestToastMetrics(page);
    expect(toastMetrics.top).toBeGreaterThanOrEqual(0);
    expect(toastMetrics.top).toBeLessThanOrEqual(32);
    expect(toastMetrics.rightGap).toBeLessThanOrEqual(24);
    expect(toastMetrics.bottomGap).toBeGreaterThan(120);
  });

  for (const matrixCase of [
    {
      expectedTop: { max: 32, min: 0 },
      mobileUiGroupedLayout: true,
      name: "uses a true top inset when grouped mobile UI layout is enabled",
    },
    {
      expectedTop: { max: 999, min: 120 },
      mobileUiGroupedLayout: false,
      name: "moves toasts away from the top when grouped mobile UI layout is disabled",
    },
  ] satisfies MobileToastPreferenceMatrixCase[]) {
    test(matrixCase.name, async ({ page }) => {
      await setMobileToastPreferences(page, matrixCase);
      await gotoPreviewDashboard(page);
      await openDashboardSettings(page);

      const toastTopSwitch = mobileToastTopSwitch(page);
      await expect(toastTopSwitch).toBeVisible();
      if (matrixCase.mobileUiGroupedLayout) {
        await expect(toastTopSwitch).toBeChecked();
      } else {
        await expect(toastTopSwitch).not.toBeChecked();
      }

      await triggerInvalidFeedToast(page);

      const toastMetrics = await readLatestToastMetrics(page);
      expect(toastMetrics.top).toBeGreaterThanOrEqual(
        matrixCase.expectedTop.min,
      );
      expect(toastMetrics.top).toBeLessThanOrEqual(matrixCase.expectedTop.max);
      expect(toastMetrics.rightGap).toBeLessThanOrEqual(24);
      if (matrixCase.mobileUiGroupedLayout) {
        expect(toastMetrics.bottomGap).toBeGreaterThan(120);
      } else {
        expect(toastMetrics.bottomGap).toBeLessThanOrEqual(48);
      }
    });
  }
});
