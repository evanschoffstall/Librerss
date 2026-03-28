import {
    expectDashboardLogin,
    expectPreviewDashboard,
  gotoPreviewDashboard,
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
    await gotoPreviewDashboard(page, "/dashboard?preview=1");

    const previewPersistence = await readPreviewPersistence(page);

    expect(previewPersistence.previewCookieValue).toBe("1");
    expect(previewPersistence.previewStorageValue).toBe("true");
  });

  test("keeps preview mode active across direct dashboard navigation and reload", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page, "/dashboard?preview=1");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expectPreviewDashboard(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectPreviewDashboard(page);

    const previewPersistence = await readPreviewPersistence(page);

    expect(previewPersistence.previewCookieValue).toBe("1");
    expect(previewPersistence.previewStorageValue).toBe("true");
  });

  test("signing out from preview clears persisted preview state and origin storage", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page, "/dashboard?preview=1");
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

  test("reset app state clears local browser storage and reloads the active preview URL", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page, "/dashboard?preview=1");
    await seedClientStateSentinel(page, "reset-me");

    await page.getByRole("button", { name: "Reset app state" }).click();
    await expectPreviewDashboard(page);

    const previewPersistence = await readPreviewPersistence(page);
    const storageSentinel = await readClientStateSentinel(page);

    expect(previewPersistence.previewCookieValue).toBe("1");
    expect(previewPersistence.previewStorageValue).toBe("true");
    expect(storageSentinel.localStorageValue).toBeNull();
    expect(storageSentinel.sessionStorageValue).toBeNull();
  });

  test("preview settings hide destructive account actions while leaving safe controls visible", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
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
    await gotoPreviewDashboard(page);
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

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectPreviewDashboard(page);
    await openDashboardSettings(page);
    await expect(
      page.getByRole("switch", { name: "Show favicons" }),
    ).toHaveAttribute("aria-checked", nextCheckedState);
  });
});