import {
    enterPreviewFromLogin,
    expectDashboardLogin,
    expectPreviewDashboard,
    firstArticleCard,
    openDashboardSettings,
    readClientStateSentinel,
    readPreviewPersistence,
    seedClientStateSentinel,
} from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard preview safety", () => {
  test("accepts the preview query alias and persists local preview mode", async ({
    page,
  }) => {
    await page.goto("/dashboard?preview=1");
    await expectPreviewDashboard(page);

    const previewPersistence = await readPreviewPersistence(page);

    expect(previewPersistence.previewCookieValue).toBe("1");
    expect(previewPersistence.previewStorageValue).toBe("true");
  });

  test("keeps preview mode active across direct dashboard navigation and reload", async ({
    page,
  }) => {
    await enterPreviewFromLogin(page);
    await page.goto("/dashboard");
    await expectPreviewDashboard(page);

    await page.reload();
    await expectPreviewDashboard(page);

    const previewPersistence = await readPreviewPersistence(page);

    expect(previewPersistence.previewCookieValue).toBe("1");
    expect(previewPersistence.previewStorageValue).toBe("true");
  });

  test("signing out from preview clears persisted preview state and origin storage", async ({
    page,
  }) => {
    await enterPreviewFromLogin(page);
    await page.goto("/dashboard");
    await expectPreviewDashboard(page);
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

  test("reset app state clears local browser storage without persisting preview mode", async ({
    page,
  }) => {
    await enterPreviewFromLogin(page);
    await page.goto("/dashboard");
    await expectPreviewDashboard(page);
    await seedClientStateSentinel(page, "reset-me");

    await page.getByRole("button", { name: "Reset app state" }).click();
    await expectDashboardLogin(page);

    const previewPersistence = await readPreviewPersistence(page);
    const storageSentinel = await readClientStateSentinel(page);

    expect(previewPersistence.previewCookieValue).toBeNull();
    expect(previewPersistence.previewStorageValue).toBeNull();
    expect(storageSentinel.localStorageValue).toBeNull();
    expect(storageSentinel.sessionStorageValue).toBeNull();
  });

  test("preview settings hide destructive account actions while leaving safe controls visible", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
    await openDashboardSettings(page);

    await expect(page.getByText("Privacy and Account")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Export Data" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete Account" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Terms of Use" })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Show favicons" })).toBeVisible();
    await expect(page.getByText("Not available in demo mode")).toHaveCount(2);
  });

  test("preview display preferences persist locally across reloads", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
    await openDashboardSettings(page);

    const faviconSwitch = page.getByRole("switch", { name: "Show favicons" });
    const initialCheckedState = await faviconSwitch.getAttribute("aria-checked");
    const nextCheckedState = initialCheckedState === "true" ? "false" : "true";

    await faviconSwitch.click();
    await expect(faviconSwitch).toHaveAttribute("aria-checked", nextCheckedState);

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Reader Settings" }),
    ).toHaveCount(0);

    await page.reload();
    await page.waitForURL(/\/dashboard\?(?:explore|preview)=1/);
    await expect(page.getByText("demo", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(firstArticleCard(page)).toBeVisible({ timeout: 15_000 });
    await openDashboardSettings(page);
    await expect(
      page.getByRole("switch", { name: "Show favicons" }),
    ).toHaveAttribute("aria-checked", nextCheckedState);
  });
});