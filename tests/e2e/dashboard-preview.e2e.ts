import {
    enterPreviewFromLogin,
    expectPreviewDashboard,
    firstArticleCard,
    firstArticleTitle,
    openDashboardSettings,
  readFeedViewportMetrics,
  setFeedViewportScrollTop,
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
    await expect(firstArticleCard(page)).toContainText(firstTitle);
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

  test("keeps the selected token and resets the viewport when switching preview sources", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);

    const allButton = page.getByRole("button", { exact: true, name: "all" });
    const unreadButton = page.getByRole("button", {
      exact: true,
      name: "unread",
    });

    await allButton.click();
    await expect(allButton).toHaveAttribute("aria-pressed", "true");

    const { clientHeight, scrollHeight } = await readFeedViewportMetrics(page);
    const targetScrollTop = Math.max(
      0,
      Math.min(900, scrollHeight - clientHeight - 24),
    );

    await setFeedViewportScrollTop(page, targetScrollTop);
    await expect
      .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
      .toBeGreaterThan(0);

    const openFeedsButton = page.getByRole("button", { name: "Open feeds" });
    if (await openFeedsButton.isVisible()) {
      await openFeedsButton.click();
    }
    await page
      .getByRole("button", { name: "NASA www.nasa.gov" })
      .click();

    await expect
      .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
      .toBe(0);
    await expect(allButton).toHaveAttribute("aria-pressed", "true");
    await expect(unreadButton).toHaveAttribute("aria-pressed", "false");

    await expect
      .poll(async () => {
        const m = await readFeedViewportMetrics(page);
        return m.scrollHeight - m.clientHeight;
      })
      .toBeGreaterThan(24);

    const nasaViewportMetrics = await readFeedViewportMetrics(page);
    const nasaTargetScrollTop = Math.max(
      0,
      Math.min(900, nasaViewportMetrics.scrollHeight - nasaViewportMetrics.clientHeight - 24),
    );

    await setFeedViewportScrollTop(page, nasaTargetScrollTop);
    await expect
      .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
      .toBeGreaterThan(0);

    await unreadButton.click();

    await expect
      .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
      .toBe(0);
    await expect(unreadButton).toHaveAttribute("aria-pressed", "true");
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
