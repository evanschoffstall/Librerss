import { firstArticleCard, waitForPreviewDashboardHydration } from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard toolbar loading", () => {
  test("keeps the toolbar skeletal until the initial article surface hydrates", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1", { waitUntil: "domcontentloaded" });

    await expect(
      page.locator('[data-dashboard-toolbar-skeleton="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-dashboard-feed-list-skeleton="true"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toBeVisible();

    const skeletonViewportFit = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>(
        '[data-feed-scroll-viewport="true"]',
      );
      const skeletonRows = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-dashboard-feed-list-skeleton-item="true"]',
        ),
      );

      if (!viewport || skeletonRows.length === 0) {
        return null;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const firstRowRect = skeletonRows[0]?.getBoundingClientRect();
      const lastRowRect = skeletonRows.at(-1)?.getBoundingClientRect();
      const secondRowRect = skeletonRows[1]?.getBoundingClientRect();
      const scrollbarThumb = document.querySelector(
        '[data-dashboard-feed-scrollbar-thumb="true"]',
      );

      if (!firstRowRect || !lastRowRect) {
        return null;
      }

      const rowGap = secondRowRect ? secondRowRect.top - firstRowRect.bottom : 0;

      return {
        count: skeletonRows.length,
        lastRowBottom: lastRowRect.bottom,
        lastRowTop: lastRowRect.top,
        rowGap,
        rowHeight: firstRowRect.height,
        scrollbarThumbVisible: scrollbarThumb !== null,
        viewportBottom: viewportRect.bottom,
        viewportHeight: viewportRect.height,
      };
    });

    expect(skeletonViewportFit).not.toBeNull();
    expect(skeletonViewportFit?.count).toBeGreaterThan(0);
    expect(
      (skeletonViewportFit?.viewportBottom ?? 0) -
        (skeletonViewportFit?.lastRowBottom ?? 0) <
        (skeletonViewportFit?.rowHeight ?? 0) +
          (skeletonViewportFit?.rowGap ?? 0) +
          4,
    ).toBe(true);
    expect(skeletonViewportFit?.scrollbarThumbVisible).toBe(false);

    await expect(page.getByPlaceholder("Search...")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "unread" })).toHaveCount(0);

    await page
      .locator('[data-dashboard-feed-list-skeleton="true"]')
      .waitFor({ state: "detached", timeout: 15_000 });
    await expect(firstArticleCard(page)).toBeVisible({ timeout: 250 });

    await waitForPreviewDashboardHydration(page);

    await expect(
      page.locator('[data-dashboard-toolbar-skeleton="true"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toHaveCount(0);
    await expect(page.getByPlaceholder("Search...")).toBeVisible();
    await expect(page.getByRole("button", { name: "unread" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh selected feed" }).first(),
    ).toBeVisible();
  });
});