import type { Locator, Page } from "@playwright/test";

import { gotoPreviewDashboard, openDashboardSettings } from "./helpers";
import { expect, test } from "./test";

const MOBILE_TOAST_TOP_STORAGE_KEY = "librerss:mobileToastTop";
const MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY = "librerss:mobileToolbarBottom";
const MOBILE_TOOLBAR_MIRROR_STORAGE_KEY = "librerss:mobileToolbarMirror";

interface MobileToastPreferenceMatrixCase {
  expectedTop: {
    max: number;
    min: number;
  };
  mobileToastTop: boolean;
  mobileToolbarBottom: boolean;
  mobileToolbarMirror: boolean;
  name: string;
}

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
    mobileToastTop,
    mobileToolbarBottom,
    mobileToolbarMirror,
  }: Omit<MobileToastPreferenceMatrixCase, "expectedTop" | "name">,
) {
  await page.addInitScript(
    ({
      mobileToastTopStorageKey,
      mobileToolbarBottomStorageKey,
      mobileToolbarMirrorStorageKey,
      nextMobileToastTop,
      nextMobileToolbarBottom,
      nextMobileToolbarMirror,
    }: {
      mobileToastTopStorageKey: string;
      mobileToolbarBottomStorageKey: string;
      mobileToolbarMirrorStorageKey: string;
      nextMobileToastTop: boolean;
      nextMobileToolbarBottom: boolean;
      nextMobileToolbarMirror: boolean;
    }) => {
      window.localStorage.setItem(
        mobileToastTopStorageKey,
        JSON.stringify(nextMobileToastTop),
      );
      window.localStorage.setItem(
        mobileToolbarBottomStorageKey,
        JSON.stringify(nextMobileToolbarBottom),
      );
      window.localStorage.setItem(
        mobileToolbarMirrorStorageKey,
        JSON.stringify(nextMobileToolbarMirror),
      );
    },
    {
      mobileToastTopStorageKey: MOBILE_TOAST_TOP_STORAGE_KEY,
      mobileToolbarBottomStorageKey: MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY,
      mobileToolbarMirrorStorageKey: MOBILE_TOOLBAR_MIRROR_STORAGE_KEY,
      nextMobileToastTop: mobileToastTop,
      nextMobileToolbarBottom: mobileToolbarBottom,
      nextMobileToolbarMirror: mobileToolbarMirror,
    },
  );
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
    await setMobileToastPreferences(page, {
      mobileToastTop: false,
      mobileToolbarBottom: true,
      mobileToolbarMirror: true,
    });
    await gotoPreviewDashboard(page);
    await openDashboardSettings(page);

    const toastTopSwitch = mobileToastTopSwitch(page);
    await expect(toastTopSwitch).toBeVisible();
    await expect(toastTopSwitch).not.toBeChecked();

    await triggerInvalidFeedToast(page);

    const toastMetrics = await readLatestToastMetrics(page);
    expect(toastMetrics.bottomGap).toBeLessThanOrEqual(40);
    expect(toastMetrics.rightGap).toBeLessThanOrEqual(24);
    expect(toastMetrics.top).toBeGreaterThan(toastMetrics.viewportHeight / 2);
  });

  for (const matrixCase of [
    {
      expectedTop: { max: 32, min: 0 },
      mobileToastTop: true,
      mobileToolbarBottom: true,
      mobileToolbarMirror: true,
      name:
        "uses a true top inset when top toasts are enabled and the mirrored mobile toolbar stays at the bottom",
    },
    {
      expectedTop: { max: 32, min: 0 },
      mobileToastTop: true,
      mobileToolbarBottom: true,
      mobileToolbarMirror: false,
      name:
        "keeps the same true top inset when top toasts are enabled and the bottom toolbar is not mirrored",
    },
    {
      expectedTop: { max: 96, min: 56 },
      mobileToastTop: true,
      mobileToolbarBottom: false,
      mobileToolbarMirror: true,
      name:
        "keeps a toolbar clearance when top toasts are enabled and the mirrored mobile toolbar is pinned to the top",
    },
    {
      expectedTop: { max: 96, min: 56 },
      mobileToastTop: true,
      mobileToolbarBottom: false,
      mobileToolbarMirror: false,
      name:
        "keeps a toolbar clearance when top toasts are enabled and the top toolbar is not mirrored",
    },
  ] satisfies MobileToastPreferenceMatrixCase[]) {
    test(matrixCase.name, async ({ page }) => {
      await setMobileToastPreferences(page, matrixCase);
      await gotoPreviewDashboard(page);
      await openDashboardSettings(page);

      const toastTopSwitch = mobileToastTopSwitch(page);
      await expect(toastTopSwitch).toBeVisible();
      await expect(toastTopSwitch).toBeChecked();

      await triggerInvalidFeedToast(page);

      const toastMetrics = await readLatestToastMetrics(page);
      expect(toastMetrics.top).toBeGreaterThanOrEqual(matrixCase.expectedTop.min);
      expect(toastMetrics.top).toBeLessThanOrEqual(matrixCase.expectedTop.max);
      expect(toastMetrics.rightGap).toBeLessThanOrEqual(24);
      expect(toastMetrics.bottomGap).toBeGreaterThan(120);
    });
  }
});