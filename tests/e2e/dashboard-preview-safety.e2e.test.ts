import type { Page } from "@playwright/test";

import {
  configureArticlesPerPage,
  expectDashboardLogin,
  expectPreviewDashboard,
  gotoPreviewDashboard,
  installDeterministicFeedBatchRoute,
  openDashboardSettings,
  openDashboardSettingsTab,
  readClientStateSentinel,
  readPreviewPersistence,
  readVisibleFeedArticleCount,
  seedClientStateSentinel,
  waitForPreviewDashboardHydration,
} from "./helpers";
import { expect, test } from "./test";

function previewSourceButton(
  page: Parameters<typeof gotoPreviewDashboard>[0],
  sourceName: string,
) {
  return page.locator("button").filter({ hasText: sourceName }).first();
}

async function readDashboardPersistence(
  page: Parameters<typeof gotoPreviewDashboard>[0],
) {
  return await page.evaluate(() => ({
    articleFilter: window.localStorage.getItem("librerss:articleFilter"),
    articlesPerPage: window.localStorage.getItem("librerss:articlesPerPage"),
    selectedCategory: window.localStorage.getItem("librerss:selectedCategory"),
  }));
}

async function readMaybeFeedViewportMetrics(page: Page) {
  return await page.evaluate(() => {
    const viewport =
      document.querySelector<HTMLElement>('[data-feed-scroll-viewport="true"]') ??
      document.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      );

    if (!viewport) {
      return null;
    }

    return {
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
    };
  });
}

test.describe("dashboard preview safety", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicFeedBatchRoute(page);
  });

  test("requires the explore query and avoids preview persistence", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page, "/dashboard?explore=1");

    const previewPersistence = await readPreviewPersistence(page);

    expect(previewPersistence.previewCookieValue).toBeNull();
    expect(previewPersistence.previewStorageValue).toBeNull();
  });

  test("returns to the normal dashboard route when the explore query is removed", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page, "/dashboard?explore=1");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expectDashboardLogin(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectDashboardLogin(page);

    const previewPersistence = await readPreviewPersistence(page);

    expect(previewPersistence.previewCookieValue).toBeNull();
    expect(previewPersistence.previewStorageValue).toBeNull();
  });

  test("signing out from preview clears persisted preview state and origin storage", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page, "/dashboard?explore=1");
    await seedClientStateSentinel(page);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/landing$/);
    await expect(
      page.getByRole("link", { name: /Open Dashboard/i }),
    ).toBeVisible();

    const previewPersistence = await readPreviewPersistence(page);
    const storageSentinel = await readClientStateSentinel(page);

    expect(previewPersistence.previewCookieValue).toBeNull();
    expect(previewPersistence.previewStorageValue).not.toBe("true");
    expect(storageSentinel.localStorageValue).toBeNull();
    expect(storageSentinel.sessionStorageValue).toBeNull();

    await page.goto("/dashboard");
    await expectDashboardLogin(page);
  });

  test("reset app state preserves the selected feed, quick token filter, and page-size setting", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page, "/dashboard?explore=1");
    await seedClientStateSentinel(page, "reset-me");
    await previewSourceButton(page, "Placeholder Feeds").click();
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await page.getByPlaceholder("Search...").fill("mars");
    await openDashboardSettings(page);
    await page.getByRole("switch", { name: "Show favicons" }).click();
    await page.keyboard.press("Escape");
    await configureArticlesPerPage(page, 4);
    const expandedCount = await readVisibleFeedArticleCount(page);
    const persistedSelection = await readDashboardPersistence(page);

    await page.getByRole("button", { name: "Reset app state" }).click();
    await expectPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    const previewPersistence = await readPreviewPersistence(page);
    const storageSentinel = await readClientStateSentinel(page);

    expect(previewPersistence.previewCookieValue).toBeNull();
    expect(previewPersistence.previewStorageValue).toBeNull();
    expect(storageSentinel.localStorageValue).toBeNull();
    expect(storageSentinel.sessionStorageValue).toBeNull();
    expect(await readDashboardPersistence(page)).toEqual(persistedSelection);
    await expect(
      page.getByRole("button", { exact: true, name: "all" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByPlaceholder("Search...")).toHaveValue("");
    await openDashboardSettings(page);
    await expect(
      page.getByRole("switch", { name: "Show favicons" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page
        .getByRole("dialog", { name: "Reader Settings" })
        .getByRole("combobox")
        .nth(1),
    ).toContainText("4");
    await page.keyboard.press("Escape");
    if (expandedCount > 0) {
      await expect
        .poll(async () => {
          return await readVisibleFeedArticleCount(page);
        })
        .toBeLessThanOrEqual(expandedCount);
    }
  });

  test("preview settings hide destructive account actions while leaving safe controls visible", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await openDashboardSettings(page);
    await openDashboardSettingsTab(page, "Display");

    await expect(page.getByText("Privacy and Account")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Export Data" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Delete Account" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Terms of Use" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("switch", { name: "Show favicons" }),
    ).toBeVisible();

    await openDashboardSettingsTab(page, "Feeds");
    await expect(page.getByText("Not available in demo mode")).toHaveCount(1);
  });

  test("page reload preserves the selected feed, quick token filter, and page-size setting", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await previewSourceButton(page, "Placeholder Feeds").click();
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await page.getByPlaceholder("Search...").fill("mars");
    await openDashboardSettings(page);
    await page.getByRole("switch", { name: "Show favicons" }).click();
    await page.keyboard.press("Escape");
    await configureArticlesPerPage(page, 4);
    const persistedSelection = await readDashboardPersistence(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);
    expect(await readDashboardPersistence(page)).toEqual(persistedSelection);
    await expect(
      page.getByRole("button", { exact: true, name: "all" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByPlaceholder("Search...")).toHaveValue("");
    await openDashboardSettings(page);
    await expect(
      page.getByRole("switch", { name: "Show favicons" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      page
        .getByRole("dialog", { name: "Reader Settings" })
        .getByRole("combobox")
        .nth(1),
    ).toContainText("4");
    await page.keyboard.press("Escape");
  });
});
