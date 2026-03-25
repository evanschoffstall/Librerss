import type { Locator, Page } from "@playwright/test";

import {
  expectNotClipped,
  gotoPreviewDashboard,
  openDashboardFeedsSidebar,
  readSidebarTrayViewportMetrics,
} from "./helpers";
import { expect, test } from "./test";

const INJECTED_TRAY_ROW_COUNT = 24;
const SIDEBAR_SCROLL_WHEEL_DELTA_Y = 720;

/** Appends enough rows into the live tray content to force a real Radix viewport scroll range. */
async function injectOverflowRowsIntoMobileFeedsTray(page: Page) {
  const trayDialog = mobileFeedsTrayDialog(page);
  const injectedLastRowName = `Injected mobile tray row ${INJECTED_TRAY_ROW_COUNT}`;

  await trayDialog.evaluate((dialog, rowCount: number) => {
    const viewport = dialog.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    const contentRoot = viewport?.firstElementChild as HTMLElement | null;

    if (!viewport || !contentRoot) {
      throw new Error("Expected the mobile feeds tray viewport content root.");
    }

    const existingInjection = contentRoot.querySelector(
      "[data-mobile-tray-overflow-test='true']",
    );
    existingInjection?.remove();

    const injectedSection = document.createElement("div");
    injectedSection.dataset.mobileTrayOverflowTest = "true";
    injectedSection.className = "space-y-2 px-2 pt-2";

    for (let index = 0; index < rowCount; index += 1) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = [
        "flex w-full items-center rounded-lg border border-border/40",
        "bg-card/40 px-3 py-2 text-left text-xs text-foreground/80",
      ].join(" ");
      row.textContent = `Injected mobile tray row ${index + 1}`;
      injectedSection.append(row);
    }

    contentRoot.append(injectedSection);
  }, INJECTED_TRAY_ROW_COUNT);

  return injectedLastRowName;
}

/** Returns the Radix viewport that belongs to the currently open mobile feeds tray. */
function mobileFeedsTrayDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Feeds" });
}

/** Returns the Radix viewport that belongs to the currently open mobile feeds tray. */
function mobileFeedsTrayViewport(page: Page): Locator {
  return mobileFeedsTrayDialog(page).locator("[data-radix-scroll-area-viewport]");
}

/** Wheels inside the mobile feeds tray viewport so the tray itself owns the scroll. */
async function wheelMobileFeedsTray(page: Page, deltaY: number) {
  const viewport = mobileFeedsTrayViewport(page);
  await expect(viewport).toBeVisible();
  const box = await viewport.boundingBox();

  if (!box) {
    throw new Error("Expected the mobile feeds tray viewport to have a bounding box.");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
}

test.describe("dashboard mobile feeds tray", () => {
  test.beforeEach(async ({ page }) => {
    await gotoPreviewDashboard(page);
  });

  test("scrolls from top to bottom inside the Radix viewport without falling back to the page or tray shell", async ({
    page,
  }) => {
    await openDashboardFeedsSidebar(page);
    const lastInjectedRowName = await injectOverflowRowsIntoMobileFeedsTray(page);

    const trayDialog = mobileFeedsTrayDialog(page);
    const trayViewport = mobileFeedsTrayViewport(page);
    const lastCategoryButton = trayDialog.getByRole("button", {
      name: lastInjectedRowName,
    });

    const initialMetrics = await readSidebarTrayViewportMetrics(page);
    expect(initialMetrics.scrollHeight).toBeGreaterThan(initialMetrics.clientHeight);
    expect(initialMetrics.scrollTop).toBe(0);
    expect(initialMetrics.dialogScrollTop).toBe(0);
    expect(initialMetrics.windowScrollY).toBe(0);

    await expect
      .poll(async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await wheelMobileFeedsTray(page, SIDEBAR_SCROLL_WHEEL_DELTA_Y);
          const metrics = await readSidebarTrayViewportMetrics(page);
          if (metrics.scrollTop > 0) {
            return metrics.scrollTop;
          }
        }

        return 0;
      })
      .toBeGreaterThan(0);

    await expect
      .poll(async () => {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await wheelMobileFeedsTray(page, SIDEBAR_SCROLL_WHEEL_DELTA_Y);
        }

        const metrics = await readSidebarTrayViewportMetrics(page);
        return metrics.scrollTop;
      })
      .toBeGreaterThan(120);

    const bottomMetrics = await readSidebarTrayViewportMetrics(page);
    const maxScrollTop = bottomMetrics.scrollHeight - bottomMetrics.clientHeight;
    expect(bottomMetrics.scrollTop).toBeGreaterThan(Math.max(0, maxScrollTop - 72));
    expect(bottomMetrics.dialogScrollTop).toBe(0);
    expect(bottomMetrics.windowScrollY).toBe(0);
    await expectNotClipped(
      lastCategoryButton,
      trayViewport,
      "last mobile feeds tray category",
    );

    await expect
      .poll(async () => {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await wheelMobileFeedsTray(page, -SIDEBAR_SCROLL_WHEEL_DELTA_Y);
        }

        const metrics = await readSidebarTrayViewportMetrics(page);
        return metrics.scrollTop;
      })
      .toBeLessThan(16);

    const resetMetrics = await readSidebarTrayViewportMetrics(page);
    expect(resetMetrics.dialogScrollTop).toBe(0);
    expect(resetMetrics.windowScrollY).toBe(0);
  });
});