import { expect, type Page, test } from "@playwright/test";

import {
  gotoPreviewDashboard,
  waitForPreviewDashboardHydration,
} from "./helpers";

interface VisualViewportSnapshot {
  height: number;
  offsetLeft: number;
  offsetTop: number;
  scale: number;
  width: number;
}

/**
 * Reads the viewport values that expose mobile browser focus zoom.
 * @param page - The Playwright page under test.
 * @returns The current visual viewport dimensions, offsets, and scale.
 */
async function readVisualViewportSnapshot(
  page: Page,
): Promise<VisualViewportSnapshot> {
  return page.evaluate(() => {
    const viewport = window.visualViewport;

    return {
      height: viewport?.height ?? window.innerHeight,
      offsetLeft: viewport?.offsetLeft ?? 0,
      offsetTop: viewport?.offsetTop ?? 0,
      scale: viewport?.scale ?? 1,
      width: viewport?.width ?? window.innerWidth,
    };
  });
}

/** Returns the search input in the dashboard toolbar. */
function searchInput(page: Page) {
  return page
    .getByRole("textbox", { name: /search/i })
    .or(page.locator("input[placeholder*='Search']"));
}

test.describe("dashboard mobile search viewport behavior", () => {
  test("tapping the search field does not zoom or shift the viewport", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);

    const input = searchInput(page);
    await expect(input).toBeVisible();

    const beforeTap = await readVisualViewportSnapshot(page);
    await input.tap();
    await expect(input).toBeFocused();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(resolve)),
    );
    const afterTap = await readVisualViewportSnapshot(page);

    await expect
      .poll(async () =>
        input.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
      )
      .toBeGreaterThanOrEqual(16);
    expect(afterTap.scale).toBe(beforeTap.scale);
    expect(afterTap.width).toBeCloseTo(beforeTap.width, 1);
    expect(afterTap.height).toBeCloseTo(beforeTap.height, 1);
    expect(afterTap.offsetLeft).toBeCloseTo(beforeTap.offsetLeft, 1);
    expect(afterTap.offsetTop).toBeCloseTo(beforeTap.offsetTop, 1);
  });
});
