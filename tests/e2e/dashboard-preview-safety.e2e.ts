import {
  configureArticlesPerPage,
  expectDashboardLogin,
  expectPreviewDashboard,
  gotoPreviewDashboard,
  openDashboardSettings,
  openDashboardSettingsTab,
  readClientStateSentinel,
  readFeedViewportMetrics,
  readPreviewPersistence,
  readRenderedArticleCount,
  scrollFeedViewportToBottom,
  seedClientStateSentinel,
  setFeedViewportScrollTop,
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

test.describe("dashboard preview safety", () => {
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
    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(8);
    await scrollFeedViewportToBottom(page);
    await scrollFeedViewportToBottom(page);
    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(20);
    const expandedCount = await readRenderedArticleCount(page);
    const expandedMetrics = await readFeedViewportMetrics(page);
    const targetScrollTop = Math.max(
      0,
      Math.min(900, expandedMetrics.scrollHeight - expandedMetrics.clientHeight - 24),
    );
    await setFeedViewportScrollTop(page, targetScrollTop);
    await expect
      .poll(async () => {
        return (await readFeedViewportMetrics(page)).scrollTop;
      })
      .toBeGreaterThan(0);
    const persistedSelection = await readDashboardPersistence(page);

    await page.getByRole("button", { name: "Reset app state" }).click();
    await expectPreviewDashboard(page);

    const previewPersistence = await readPreviewPersistence(page);
    const storageSentinel = await readClientStateSentinel(page);

    expect(previewPersistence.previewCookieValue).toBeNull();
    expect(previewPersistence.previewStorageValue).toBeNull();
    expect(storageSentinel.localStorageValue).toBeNull();
    expect(storageSentinel.sessionStorageValue).toBeNull();
    expect(await readDashboardPersistence(page)).toEqual(persistedSelection);
    await expect(page.getByRole("button", { exact: true, name: "all" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeLessThan(expandedCount);
    await expect
      .poll(async () => {
        return (await readFeedViewportMetrics(page)).scrollTop;
      })
      .toBeLessThanOrEqual(1);
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
    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(8);
    await scrollFeedViewportToBottom(page);
    await scrollFeedViewportToBottom(page);
    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThanOrEqual(20);
    const expandedCount = await readRenderedArticleCount(page);
    const expandedMetrics = await readFeedViewportMetrics(page);
    const targetScrollTop = Math.max(
      0,
      Math.min(900, expandedMetrics.scrollHeight - expandedMetrics.clientHeight - 24),
    );
    await setFeedViewportScrollTop(page, targetScrollTop);
    await expect
      .poll(async () => {
        return (await readFeedViewportMetrics(page)).scrollTop;
      })
      .toBeGreaterThan(0);
    const persistedSelection = await readDashboardPersistence(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectPreviewDashboard(page);
    expect(await readDashboardPersistence(page)).toEqual(persistedSelection);
    await expect(page.getByRole("button", { exact: true, name: "all" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeLessThan(expandedCount);
    await expect
      .poll(async () => {
        return (await readFeedViewportMetrics(page)).scrollTop;
      })
      .toBeLessThanOrEqual(1);
  });
});
