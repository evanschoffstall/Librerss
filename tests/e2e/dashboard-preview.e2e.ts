import {
    enterPreviewFromLogin,
    expectPreviewDashboard,
    firstArticleCard,
    firstArticleTitle,
    openDashboardSettings,
} from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard preview mode", () => {
  test("enters preview from the login view and signs out back to landing", async ({
    page,
  }) => {
    await enterPreviewFromLogin(page);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/landing$/);
    await expect(
      page.getByRole("link", { name: /Open Dashboard/i }),
    ).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByText("Sign in to LibreRSS")).toBeVisible();
  });

  test("supports safe local article interactions and filtering in preview", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);

    const firstTitle = (await firstArticleTitle(page).textContent())?.trim();
    if (!firstTitle) {
      throw new Error("Expected the first preview article to have a title.");
    }

    await page.getByPlaceholder("Search...").fill("interbred");
    await expect(
      page.getByRole("heading", {
        name: firstTitle,
      }),
    ).toBeVisible();

    await page.getByPlaceholder("Search...").fill("");
    await expect(firstArticleCard(page)).toBeVisible({ timeout: 15_000 });
    await firstArticleCard(page)
      .getByRole("button", { name: "Star article" })
      .click();
    await page.getByRole("button", { exact: true, name: "starred" }).click();
    await expect(firstArticleCard(page)).toContainText(firstTitle);

    await page.getByRole("button", { exact: true, name: "all" }).click();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await page.getByRole("button", { exact: true, name: "read" }).click();
    await expect(firstArticleCard(page)).toContainText(firstTitle);
  });

  test("opens settings and shows demo safeguards in preview mode", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);

    await openDashboardSettings(page);
    await expect(page.getByText("Not available in demo mode")).toHaveCount(2);
    await expect(page.getByLabel("Show favicons")).toBeVisible();
    await expect(page.getByLabel("Auto refresh")).toBeVisible();
  });
});
