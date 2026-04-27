import { articleCard, gotoPreviewDashboard, readArticleKey } from "./helpers";
import { expect, test } from "./test";

const SORT_TOGGLE_NAME = /sort by date/i;

test.describe("dashboard article sort order", () => {
  test("defaults to newest-first and renders the sort toggle in the filter bar", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);

    const sortToggle = page.getByRole("button", { name: SORT_TOGGLE_NAME });

    await expect(sortToggle).toBeVisible({ timeout: 15_000 });
    await expect(sortToggle).toHaveAttribute(
      "data-dashboard-filter-bar-sort-order",
      "newest",
    );
    await expect(sortToggle).toHaveAttribute("aria-pressed", "false");
    await expect(sortToggle).toContainText("Newest");
  });

  test("toggling the sort order reverses the visible article order and persists across reloads", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);

    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await expect(articleCard(page, 1)).toBeVisible({ timeout: 15_000 });

    const initialFirstKey = await readArticleKey(articleCard(page, 0));
    const initialSecondKey = await readArticleKey(articleCard(page, 1));

    expect(initialFirstKey).not.toBe(initialSecondKey);

    const sortToggle = page.getByRole("button", { name: SORT_TOGGLE_NAME });
    await expect(sortToggle).toBeVisible({ timeout: 15_000 });
    await sortToggle.click();

    await expect(sortToggle).toHaveAttribute(
      "data-dashboard-filter-bar-sort-order",
      "oldest",
    );
    await expect(sortToggle).toHaveAttribute("aria-pressed", "true");
    await expect(sortToggle).toContainText("Oldest");

    await expect
      .poll(async () => readArticleKey(articleCard(page, 0)), {
        timeout: 15_000,
      })
      .not.toBe(initialFirstKey);

    const persistedOrder = await page.evaluate(() =>
      window.localStorage.getItem("librerss:articleSortOrder"),
    );
    expect(persistedOrder).toContain("oldest");

    await page.reload();

    const reloadedToggle = page.getByRole("button", { name: SORT_TOGGLE_NAME });
    await expect(reloadedToggle).toBeVisible({ timeout: 15_000 });
    await expect(reloadedToggle).toHaveAttribute(
      "data-dashboard-filter-bar-sort-order",
      "oldest",
    );
    await expect(reloadedToggle).toContainText("Oldest");
  });

  test("clicking the sort toggle a second time restores the newest-first order", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);

    const sortToggle = page.getByRole("button", { name: SORT_TOGGLE_NAME });
    await expect(sortToggle).toBeVisible({ timeout: 15_000 });

    await sortToggle.click();
    await expect(sortToggle).toHaveAttribute(
      "data-dashboard-filter-bar-sort-order",
      "oldest",
    );

    await sortToggle.click();
    await expect(sortToggle).toHaveAttribute(
      "data-dashboard-filter-bar-sort-order",
      "newest",
    );
    await expect(sortToggle).toContainText("Newest");
  });

  test("renders the mobile sort toggle as icon-only while keeping its accessible state", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 820, width: 390 });
    await gotoPreviewDashboard(page);

    const sortToggle = page.getByRole("button", { name: SORT_TOGGLE_NAME });
    const sortLabel = page.locator(
      '[data-dashboard-filter-bar-sort-label="true"]',
    );

    await expect(sortToggle).toBeVisible({ timeout: 15_000 });
    await expect(sortToggle).toHaveAttribute(
      "data-dashboard-filter-bar-sort-order",
      "newest",
    );
    await expect(sortLabel).toHaveCSS("display", "none");

    const mobileSortMetrics = await sortToggle.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const icons = button.querySelectorAll("svg");
      return {
        iconCount: icons.length,
        width: rect.width,
      };
    });

    expect(mobileSortMetrics.iconCount).toBe(1);
    expect(mobileSortMetrics.width).toBeLessThan(42);
  });
});
