import {
  articleCard,
  gotoPreviewDashboardWithPreferences,
  installDeterministicFeedBatchRoute,
} from "./helpers";
import { expect, test } from "./test";

async function readArticleHeight(page: Parameters<typeof articleCard>[0]) {
  const box = await articleCard(page, 0).boundingBox();

  if (!box) {
    throw new Error("Expected the first article card to have a bounding box.");
  }

  return box.height;
}

test.describe("dashboard article view mode", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicFeedBatchRoute(page);
  });

  test("toggles to compact mode, reduces collapsed article height, and persists across reloads", async ({
    page,
  }) => {
    await gotoPreviewDashboardWithPreferences(page, {
      articleFilter: "all",
    });

    const compactToggle = page.getByRole("button", {
      name: "Switch article list to compact view",
    });

    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await expect(compactToggle).toBeVisible({ timeout: 15_000 });
    await expect(compactToggle).toHaveAttribute("aria-pressed", "false");

    const initialHeight = await readArticleHeight(page);

    await compactToggle.click();

    const cardToggle = page.getByRole("button", {
      name: "Switch article list to card view",
    });

    await expect(cardToggle).toHaveAttribute("aria-pressed", "true");
    await expect(articleCard(page, 0)).toHaveAttribute(
      "data-article-collapsed-view-mode",
      "compact",
    );

    await expect
      .poll(() => readArticleHeight(page), { timeout: 15_000 })
      .toBeLessThan(initialHeight - 12);

    const compactStorageValue = await page.evaluate(
      (storageKey) => window.localStorage.getItem(storageKey),
      "librerss:articleViewMode",
    );
    expect(compactStorageValue).toContain("compact");

    await page.reload();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", {
        name: "Switch article list to card view",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(articleCard(page, 0)).toHaveAttribute(
      "data-article-collapsed-view-mode",
      "compact",
    );
    await expect
      .poll(() => readArticleHeight(page), { timeout: 15_000 })
      .toBeLessThan(initialHeight - 12);
  });
});
