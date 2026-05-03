import type { Locator } from "@playwright/test";

import { gotoPreviewDashboard, openDashboardSettingsTab } from "./helpers";
import { expect, test } from "./test";

/**
 * Assert that the settings dialog has delegated panel visibility to Radix Tabs.
 * @param dialog - The open settings dialog being inspected.
 * @param headingName - The heading that must be present in the single active tab panel.
 */
async function expectOnlyVisibleSettingsPanel(
  dialog: Locator,
  headingName: string,
) {
  const visiblePanels = dialog.locator('[role="tabpanel"]:visible');
  await expect(visiblePanels).toHaveCount(1);
  await expect(
    visiblePanels.first().getByRole("heading", {
      exact: true,
      name: headingName,
    }),
  ).toBeVisible();
}

test.describe("settings modal desktop tabs", () => {
  test.beforeEach(async ({ page }) => {
    await gotoPreviewDashboard(page);
  });

  test("shows only the selected tab panel instead of stacking all settings", async ({
    page,
  }) => {
    await openDashboardSettingsTab(page, "Display");

    const dialog = page.getByRole("dialog", { name: "Reader Settings" });
    await expect(dialog).toBeVisible();
    await expectOnlyVisibleSettingsPanel(dialog, "Display");
    await expect(
      dialog.getByRole("heading", { exact: true, name: "Feeds" }),
    ).toHaveCount(0);

    await openDashboardSettingsTab(page, "Feeds");

    await expectOnlyVisibleSettingsPanel(dialog, "Feeds");
    await expect(
      dialog.getByText("Customize how articles are displayed in the list."),
    ).toHaveCount(0);
    await expect(dialog.getByText("Not available in demo mode")).toBeVisible();

    await openDashboardSettingsTab(page, "Network");

    await expectOnlyVisibleSettingsPanel(dialog, "Connection Routing");
    await expect(
      dialog.getByRole("heading", { exact: true, name: "Feeds" }),
    ).toHaveCount(0);
  });
});
