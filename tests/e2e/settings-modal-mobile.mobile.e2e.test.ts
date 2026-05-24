import type { Locator, Page } from "@playwright/test";

import {
  expectNotClipped,
  gotoPreviewDashboard,
  installDeterministicFeedBatchRoute,
  openDashboardSettings,
  openDashboardSettingsTab,
} from "./helpers";
import { expect, test } from "./test";

interface MobileSettingsFeedRecord {
  category: string;
  enabled: boolean;
  extractionDisabled: boolean;
  id: number;
  name: string;
  proxyEnabled: boolean;
  url: string;
}

const MOBILE_SETTINGS_FEEDS: MobileSettingsFeedRecord[] = [
  {
    category: "News",
    enabled: true,
    extractionDisabled: false,
    id: 1,
    name: "Existing Feed",
    proxyEnabled: false,
    url: "https://example.com/e2e/mobile-existing.xml",
  },
];

/**
 * Open the mocked authenticated dashboard and wait for the mobile shell.
 * @param page - The page to navigate.
 */
async function gotoAuthenticatedMobileDashboard(page: Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard$/u);
  await expect(
    page.getByRole("button", { name: "Open actions menu" }),
  ).toBeVisible({
    timeout: 15_000,
  });
}

/** Injects a mounted Radix-style rail so the mobile CSS contract can be measured directly. */
async function injectMeasuredRadixScrollbar(dialog: Locator) {
  return await dialog.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(
      '[role="dialog"] [data-radix-scroll-area-viewport]',
    );
    const root = viewport?.parentElement;

    if (!viewport || !root) {
      throw new Error("Expected the mobile settings ScrollArea viewport.");
    }

    const scrollbar = document.createElement("div");
    scrollbar.dataset.orientation = "vertical";
    scrollbar.dataset.mobileScrollbarProbe = "true";
    root.append(scrollbar);

    const style = getComputedStyle(scrollbar);

    return {
      display: style.display,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
    };
  });
}

/**
 * Install deterministic authenticated shell routes for mobile settings coverage.
 * @param page - The page that should receive the dashboard route overrides.
 */
async function installAuthenticatedMobileSettingsRoutes(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        allowSignup: false,
        authenticated: true,
        canManageInvitations: false,
        invitationsEnabled: true,
        usePlaceholderData: false,
        user: { email: "mobile-settings@example.test", id: 1 },
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/feeds", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      body: JSON.stringify(MOBILE_SETTINGS_FEEDS),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/feeds/category-order", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ orderedLabels: ["News"] }),
      contentType: "application/json",
      status: 200,
    });
  });
}

/** Open settings and wait for the preview-safe Network tab shell to render. */
async function openSettingsAndWaitForNetworkPreview(page: Page) {
  await openDashboardSettingsTab(page, "Network");
  const dialog = page.getByRole("dialog", { name: "Reader Settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Not available in demo mode")).toBeVisible();
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

  test("keeps the preview Network overlay within the scroll viewport", async ({
    page,
  }) => {
    const dialog = await openSettingsAndWaitForNetworkPreview(page);

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
      dialog.getByText("Not available in demo mode"),
      settingsScrollViewport(dialog),
      "Preview overlay badge",
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

  test("keeps mounted shadcn ScrollArea rails completely hidden on mobile", async ({
    page,
  }) => {
    await openDashboardSettingsTab(page, "Display");
    const dialog = page.getByRole("dialog", { name: "Reader Settings" });
    await expect(dialog).toBeVisible();

    const measuredScrollbarStyle = await injectMeasuredRadixScrollbar(dialog);

    expect(measuredScrollbarStyle).toEqual({
      display: "none",
      opacity: "0",
      pointerEvents: "none",
    });
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

  test("keeps mobile feed-entry inputs at the non-zoom text size and renders a compact add button", async ({
    page,
  }) => {
    await installAuthenticatedMobileSettingsRoutes(page);
    await installDeterministicFeedBatchRoute(page, {
      articleFeedCount: 1,
      articlesPerFeed: 6,
      respectArticleLimit: true,
    });
    await gotoAuthenticatedMobileDashboard(page);
    await openDashboardSettingsTab(page, "Feeds");

    const dialog = page.getByRole("dialog", { name: "Reader Settings" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Add feed" }).first().click();

    const viewport = settingsScrollViewport(dialog);
    const categoryInput = dialog.getByPlaceholder("New category name...");
    const feedNameInput = dialog.getByPlaceholder("Feed name");
    const feedUrlInput = dialog.getByPlaceholder(
      "https://example.com/feed.xml",
    );
    const addFeedButton = dialog
      .getByRole("button", { name: "Add Feed" })
      .last();

    await expectNotClipped(categoryInput, viewport, "Category input");
    await expectNotClipped(feedNameInput, viewport, "Feed name input");
    await expectNotClipped(feedUrlInput, viewport, "Feed URL input");
    await expectNotClipped(addFeedButton, viewport, "Add feed button");

    const [categoryFontSize, feedNameFontSize, feedUrlFontSize, buttonText] =
      await Promise.all([
        categoryInput.evaluate((element) => getComputedStyle(element).fontSize),
        feedNameInput.evaluate((element) => getComputedStyle(element).fontSize),
        feedUrlInput.evaluate((element) => getComputedStyle(element).fontSize),
        addFeedButton.evaluate((element) =>
          (element as HTMLElement).innerText.trim(),
        ),
      ]);

    expect(categoryFontSize).toBe("16px");
    expect(feedNameFontSize).toBe("16px");
    expect(feedUrlFontSize).toBe("16px");
    expect(buttonText).toBe("+");
  });
});
