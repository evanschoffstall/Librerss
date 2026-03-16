import { expect, test } from "./test";

test.describe("public app routes", () => {
  test("landing links to the privacy and terms pages", async ({ page }) => {
    await page.goto("/landing");

    await expect(
      page.getByRole("heading", { name: "Your reading," }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Privacy Policy" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();

    await page.getByRole("link", { name: "Privacy Policy" }).click();
    await page.waitForURL(/\/privacy$/);
    await expect(page.getByText("Privacy Policy").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("link", { name: "Back to landing" }).first(),
    ).toBeVisible();
  });

  test("privacy page exposes account-control language and returns to landing", async ({
    page,
  }) => {
    await page.goto("/privacy");

    await expect(page.getByText("Privacy Policy").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "Your controls" }),
    ).toBeVisible();
    await expect(
      page.getByText(/back to landing/i).first(),
    ).toBeVisible();

    await page.getByRole("link", { name: "Back to landing" }).first().click();
    await page.waitForURL(/\/landing$/);
    await expect(page.getByRole("link", { name: "Open Dashboard" })).toBeVisible();
  });

  test("terms page links back to privacy policy", async ({ page }) => {
    await page.goto("/terms");

    await expect(page.getByText("Terms of Use").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "Limitation of liability" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Privacy Policy" }).click();
    await page.waitForURL(/\/privacy$/);
    await expect(page.getByText("Privacy Policy").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "Your controls" }),
    ).toBeVisible();
  });
});