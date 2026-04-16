import { waitForPreviewDashboardHydration } from "./helpers";
import { expect, test } from "./test";

const MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY = "librerss:mobileToolbarBottom";

test.describe("dashboard toolbar tablet placement", () => {
  test("keeps the bottom toolbar from adding a tablet top gap", async ({
    page,
  }) => {
    await page.addInitScript(({ mobileToolbarBottomStorageKey }) => {
      window.localStorage.setItem(
        mobileToolbarBottomStorageKey,
        JSON.stringify(true),
      );
    }, { mobileToolbarBottomStorageKey: MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY });

    await page.setViewportSize({ height: 900, width: 900 });
    await page.goto("/dashboard?explore=1", { waitUntil: "domcontentloaded" });
    await waitForPreviewDashboardHydration(page);

    await expect(page.locator('[data-dashboard-toolbar="true"]')).toBeVisible();
    await expect(
      page.locator('[data-dashboard-filter-bar-root="true"]'),
    ).toBeVisible();

    const layoutMetrics = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>(
        '[data-dashboard-toolbar="true"]',
      );
      const filterBar = document.querySelector<HTMLElement>(
        '[data-dashboard-filter-bar-root="true"]',
      );

      if (!toolbar || !filterBar) {
        return null;
      }

      const firstArticle = document.querySelector<HTMLElement>(
        'article[data-article-key]',
      );
      const firstArticleRect = firstArticle?.getBoundingClientRect();

      const toolbarRect = toolbar.getBoundingClientRect();
      const filterBarRect = filterBar.getBoundingClientRect();

      return {
        filterBarTop: filterBarRect.top,
        firstArticleTop: firstArticleRect?.top ?? null,
        toolbarBottomGap: window.innerHeight - toolbarRect.bottom,
        toolbarTop: toolbarRect.top,
      };
    });

    expect(layoutMetrics).not.toBeNull();
    expect(layoutMetrics?.toolbarBottomGap ?? 999).toBeLessThanOrEqual(24);
    expect(layoutMetrics?.toolbarTop ?? 0).toBeGreaterThan(700);
    expect(layoutMetrics?.filterBarTop ?? 999).toBeGreaterThan(700);
    expect(layoutMetrics?.firstArticleTop ?? 999).toBeLessThan(120);
  });
});
