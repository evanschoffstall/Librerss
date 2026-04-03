import { firstArticleCard, waitForPreviewDashboardHydration } from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard toolbar loading", () => {
  test("keeps the toolbar skeletal until the initial article surface hydrates", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1", { waitUntil: "domcontentloaded" });

    await expect(
      page.locator('[data-dashboard-toolbar-skeleton="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-dashboard-feed-list-skeleton="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toBeVisible();
    await expect(page.getByPlaceholder("Search...")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "unread" })).toHaveCount(0);

    await page
      .locator('[data-dashboard-feed-list-skeleton="true"]')
      .waitFor({ state: "detached", timeout: 15_000 });
    await expect(firstArticleCard(page)).toBeVisible({ timeout: 250 });

    await waitForPreviewDashboardHydration(page);

    await expect(
      page.locator('[data-dashboard-toolbar-skeleton="true"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toHaveCount(0);
    await expect(page.getByPlaceholder("Search...")).toBeVisible();
    await expect(page.getByRole("button", { name: "unread" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh selected feed" }).first(),
    ).toBeVisible();
  });
});