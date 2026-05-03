import { expect, type Page, test } from "@playwright/test";

import {
  gotoPreviewDashboard,
  waitForPreviewDashboardHydration,
} from "./helpers";

interface SearchInputVisualStyle {
  fontSize: number;
  scale: string;
  transform: string;
}

interface VisualViewportSnapshot {
  height: number;
  offsetLeft: number;
  offsetTop: number;
  scale: number;
  width: number;
}

/**
 * Reads the search input styles that balance mobile focus safety with the
 * compact toolbar presentation.
 * @param page - The Playwright page under test.
 * @returns The current computed font size and scale for the search input.
 */
async function readSearchInputVisualStyle(
  page: Page,
): Promise<SearchInputVisualStyle> {
  return await searchInput(page).evaluate((element) => {
    const style = window.getComputedStyle(element);

    return {
      fontSize: Number.parseFloat(style.fontSize),
      scale: style.scale,
      transform: style.transform,
    };
  });
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

    const visualStyle = await readSearchInputVisualStyle(page);

    expect(visualStyle.fontSize).toBeGreaterThanOrEqual(16);
    expect([visualStyle.scale, visualStyle.transform].join(" ")).toContain(
      "0.875",
    );
    expect(afterTap.scale).toBe(beforeTap.scale);
    expect(afterTap.width).toBeCloseTo(beforeTap.width, 1);
    expect(afterTap.height).toBeCloseTo(beforeTap.height, 1);
    expect(afterTap.offsetLeft).toBeCloseTo(beforeTap.offsetLeft, 1);
    expect(afterTap.offsetTop).toBeCloseTo(beforeTap.offsetTop, 1);
  });
});
