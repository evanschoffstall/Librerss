import type { Locator, Page } from "@playwright/test";

import {
  expectPreviewDashboard,
  openDashboardSettings,
} from "./helpers";
import { expect, test } from "./test";

/**
 * Scrolls a locator into view, then asserts its bounding box fits entirely
 * within the dialog's visible scroll viewport — both horizontally AND
 * vertically. This catches clipping that `toBeInViewport` and `toBeVisible`
 * silently miss.
 */
async function expectFullyContained(
  locator: Locator,
  dialog: Locator,
  label: string,
) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, `${label}: no bounding box`).not.toBeNull();

  const containerBounds = await dialog.evaluate((el) => {
    const vp = el.querySelector("[data-radix-scroll-area-viewport]");
    if (!vp) return null;
    const r = vp.getBoundingClientRect();
    return { bottom: r.bottom, left: r.left, right: r.right, top: r.top };
  });
  expect(containerBounds, "scroll viewport not found").not.toBeNull();

  const b = box!;
  const c = containerBounds!;

  expect(
    b.x >= c.left - 1,
    `${label}: clipped on LEFT (el.left=${b.x.toFixed(1)}, container.left=${c.left.toFixed(1)})`,
  ).toBe(true);
  expect(
    b.x + b.width <= c.right + 1,
    `${label}: clipped on RIGHT (el.right=${(b.x + b.width).toFixed(1)}, container.right=${c.right.toFixed(1)})`,
  ).toBe(true);
  expect(
    b.y >= c.top - 1,
    `${label}: clipped on TOP (el.top=${b.y.toFixed(1)}, container.top=${c.top.toFixed(1)})`,
  ).toBe(true);
  expect(
    b.y + b.height <= c.bottom + 1,
    `${label}: clipped on BOTTOM (el.bottom=${(b.y + b.height).toFixed(1)}, container.bottom=${c.bottom.toFixed(1)})`,
  ).toBe(true);
}

/** Open settings and wait for the proxy form to finish loading. */
async function openSettingsAndWaitForProxy(page: Page) {
  await openDashboardSettings(page);
  const dialog = page.getByRole("dialog", { name: "Reader Settings" });
  await expect(dialog).toBeVisible();
  // Wait for the proxy skeleton to resolve (API call takes ~2s in demo mode)
  await expect(dialog.getByPlaceholder(/proxy.*8080/)).toBeVisible({
    timeout: 10_000,
  });
  return dialog;
}

test.describe("settings modal mobile tray", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
  });

  test("no element in the dialog overflows the scroll viewport horizontally", async ({
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
  });

  test("every display control fits within the scroll viewport bounds", async ({
    page,
  }) => {
    await openDashboardSettings(page);
    const dialog = page.getByRole("dialog", { name: "Reader Settings" });
    await expect(dialog).toBeVisible();

    await expectFullyContained(
      dialog.getByRole("heading", { name: "Display" }),
      dialog,
      "Display heading",
    );
    await expectFullyContained(
      dialog.getByRole("spinbutton", { name: "Auto refresh" }),
      dialog,
      "Auto refresh input",
    );
    await expectFullyContained(
      dialog.getByText("min", { exact: true }),
      dialog,
      "min label",
    );
    await expectFullyContained(
      dialog.getByRole("switch", { name: "Show favicons" }),
      dialog,
      "Show favicons switch",
    );
    // All three comboboxes (Background, Articles per page, Readable article mode)
    const comboboxes = dialog.getByRole("combobox");
    const count = await comboboxes.count();
    for (let i = 0; i < count; i++) {
      await expectFullyContained(
        comboboxes.nth(i),
        dialog,
        `combobox[${i}]`,
      );
    }
  });

  test("every feed management control fits within the scroll viewport bounds", async ({
    page,
  }) => {
    await openDashboardSettings(page);
    const dialog = page.getByRole("dialog", { name: "Reader Settings" });
    await expect(dialog).toBeVisible();

    await expectFullyContained(
      dialog.getByRole("heading", { exact: true, name: "Feeds" }),
      dialog,
      "Feeds heading",
    );
    await expectFullyContained(
      dialog.getByRole("button", { name: "Export OPML" }),
      dialog,
      "Export OPML button",
    );
    await expectFullyContained(
      dialog.getByRole("button", { name: "Import OPML" }),
      dialog,
      "Import OPML button",
    );
    await expectFullyContained(
      dialog.getByRole("button", { name: /^Placeholder Feeds\s*3$/ }),
      dialog,
      "Placeholder Feeds accordion",
    );
  });

  test("every proxy / connection routing control fits within the scroll viewport bounds", async ({
    page,
  }) => {
    const dialog = await openSettingsAndWaitForProxy(page);

    await expectFullyContained(
      dialog.getByRole("heading", { name: "Connection Routing" }),
      dialog,
      "Connection Routing heading",
    );
    await expectFullyContained(
      dialog.getByPlaceholder(/proxy.*8080/),
      dialog,
      "Proxy URL input",
    );
    await expectFullyContained(
      dialog.getByRole("button", { name: "Save" }),
      dialog,
      "Save button",
    );
    await expectFullyContained(
      dialog.getByLabel("Username"),
      dialog,
      "Username input",
    );
    await expectFullyContained(
      dialog.getByLabel(/^Password/),
      dialog,
      "Password input",
    );
    await expectFullyContained(
      dialog.getByRole("switch", { name: "Allow insecure TLS" }),
      dialog,
      "Allow insecure TLS switch",
    );
    await expectFullyContained(
      dialog.getByRole("button", { name: "Run Check" }),
      dialog,
      "Run Check button",
    );
  });

  test("scroll container allows full-range vertical scrolling to the last element", async ({
    page,
  }) => {
    const dialog = await openSettingsAndWaitForProxy(page);

    const scrollMetrics = await dialog.evaluate((el) => {
      const vp = el.querySelector("[data-radix-scroll-area-viewport]");
      if (!vp) return null;
      return {
        clientHeight: vp.clientHeight,
        scrollHeight: vp.scrollHeight,
      };
    });

    expect(scrollMetrics).not.toBeNull();
    expect(scrollMetrics!.scrollHeight).toBeGreaterThan(
      scrollMetrics!.clientHeight,
    );

    // The very last interactive element must be reachable
    await expectFullyContained(
      dialog.getByRole("button", { name: "Run Check" }),
      dialog,
      "Run Check (scroll bottom)",
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
