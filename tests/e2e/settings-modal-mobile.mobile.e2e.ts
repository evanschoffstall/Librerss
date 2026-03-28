import type { Locator, Page } from "@playwright/test";

import {
  expectNotClipped,
  gotoPreviewDashboard,
  openDashboardSettings,
  openDashboardSettingsTab,
} from "./helpers";
import { expect, test } from "./test";

/** Open settings and wait for the proxy form to finish loading. */
async function openSettingsAndWaitForProxy(page: Page) {
  await openDashboardSettingsTab(page, "Network");
  const dialog = page.getByRole("dialog", { name: "Reader Settings" });
  await expect(dialog).toBeVisible();
  // Wait for the proxy skeleton to resolve (API call takes ~2s in demo mode)
  await expect(dialog.getByPlaceholder(/proxy.*8080/)).toBeVisible({
    timeout: 10_000,
  });
  return dialog;
}

/** Scroll viewport locator within the settings dialog. */
function settingsScrollViewport(dialog: Locator) {
  return dialog.locator("[data-radix-scroll-area-viewport]");
}

test.describe("settings modal mobile tray", () => {
  test.beforeEach(async ({ page }) => {
    await gotoPreviewDashboard(page);
  });

  test("keeps the full settings dialog, including proxy controls, within the scroll viewport", async ({
    page,
  }) => {
    const dialog = await openSettingsAndWaitForProxy(page);

    // Scan every visible child of the dialog for horizontal overflow
    const overflows = await dialog.evaluate((el) => {
      const vp = el.querySelector("[data-radix-scroll-area-viewport]");
      if (!vp) return [{ detail: "not found", element: "viewport" }];
      const vpRect = vp.getBoundingClientRect();
      const children = vp.querySelectorAll("*");
      const violations: { detail: string; element: string }[] = [];
      for (const child of children) {
        const r = child.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.right > vpRect.right + 1) {
          const tag = child.tagName.toLowerCase();
          const text = child.textContent?.trim().substring(0, 40) ?? "";
          const role = child.getAttribute("role") ?? "";
          violations.push({
            detail: `right=${r.right.toFixed(1)} exceeds viewport.right=${vpRect.right.toFixed(1)} by ${(r.right - vpRect.right).toFixed(1)}px`,
            element: `<${tag}${role ? ` role="${role}"` : ""}> "${text}"`,
          });
        }
        if (r.left < vpRect.left - 1) {
          const tag = child.tagName.toLowerCase();
          const text = child.textContent?.trim().substring(0, 40) ?? "";
          violations.push({
            detail: `left=${r.left.toFixed(1)} exceeds viewport.left=${vpRect.left.toFixed(1)} by ${(vpRect.left - r.left).toFixed(1)}px`,
            element: `<${tag}> "${text}"`,
          });
        }
      }
      return violations;
    });

    expect(overflows, "Elements overflow the scroll viewport").toHaveLength(0);

    const scrollMetrics = await dialog.evaluate((el) => {
      const vp = el.querySelector("[data-radix-scroll-area-viewport]");
      if (!vp) return null;
      return {
        clientHeight: vp.clientHeight,
        scrollHeight: vp.scrollHeight,
      };
    });

    expect(scrollMetrics).not.toBeNull();
    expect(scrollMetrics!.scrollHeight).toBeGreaterThanOrEqual(
      scrollMetrics!.clientHeight,
    );

    await expectNotClipped(
      dialog.getByRole("heading", { name: "Connection Routing" }),
      settingsScrollViewport(dialog),
      "Connection Routing heading",
    );
    await expectNotClipped(
      dialog.getByPlaceholder(/proxy.*8080/),
      settingsScrollViewport(dialog),
      "Proxy URL input",
    );
    await expectNotClipped(
      dialog.getByRole("button", { name: "Save" }),
      settingsScrollViewport(dialog),
      "Save button",
    );
    await expectNotClipped(
      dialog.getByLabel("Username"),
      settingsScrollViewport(dialog),
      "Username input",
    );
    await expectNotClipped(
      dialog.getByLabel(/^Password/),
      settingsScrollViewport(dialog),
      "Password input",
    );
    await expectNotClipped(
      dialog.getByRole("switch", { name: "Allow insecure TLS" }),
      settingsScrollViewport(dialog),
      "Allow insecure TLS switch",
    );
    await expectNotClipped(
      dialog.getByRole("button", { name: "Run Check" }),
      settingsScrollViewport(dialog),
      "Run Check button",
    );
  });

  test("every display control fits within the scroll viewport bounds", async ({
    page,
  }) => {
    await openDashboardSettingsTab(page, "Display");
    const dialog = page.getByRole("dialog", { name: "Reader Settings" });
    await expect(dialog).toBeVisible();

    await expectNotClipped(
      dialog.getByRole("heading", { name: "Display" }),
      settingsScrollViewport(dialog),
      "Display heading",
    );
    await expectNotClipped(
      dialog.getByRole("spinbutton", { name: "Auto refresh" }),
      settingsScrollViewport(dialog),
      "Auto refresh input",
    );
    await expectNotClipped(
      dialog.getByText("min", { exact: true }),
      settingsScrollViewport(dialog),
      "min label",
    );
    await expectNotClipped(
      dialog.getByRole("switch", { name: "Show favicons" }),
      settingsScrollViewport(dialog),
      "Show favicons switch",
    );
    // All three comboboxes (Background, Articles per page, Readable article mode)
    const comboboxes = dialog.getByRole("combobox");
    const count = await comboboxes.count();
    for (let i = 0; i < count; i++) {
      await expectNotClipped(
        comboboxes.nth(i),
        settingsScrollViewport(dialog),
        `combobox[${i}]`,
      );
    }
  });

  test("every feed management control fits within the scroll viewport bounds", async ({
    page,
  }) => {
    await openDashboardSettingsTab(page, "Feeds");
    const dialog = page.getByRole("dialog", { name: "Reader Settings" });
    await expect(dialog).toBeVisible();

    await expectNotClipped(
      dialog.getByRole("heading", { exact: true, name: "Feeds" }),
      settingsScrollViewport(dialog),
      "Feeds heading",
    );
    await expectNotClipped(
      dialog.getByRole("button", { name: "Export OPML" }),
      settingsScrollViewport(dialog),
      "Export OPML button",
    );
    await expectNotClipped(
      dialog.getByRole("button", { name: "Import OPML" }),
      settingsScrollViewport(dialog),
      "Import OPML button",
    );
    await expectNotClipped(
      dialog.getByRole("button", { name: /^Placeholder Feeds\s*\d+$/ }),
      settingsScrollViewport(dialog),
      "Placeholder Feeds accordion",
    );
  });

  test("closes the drawer via the close button", async ({ page }) => {
    await openDashboardSettings(page);

    const dialog = page.getByRole("dialog", { name: "Reader Settings" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });
});
