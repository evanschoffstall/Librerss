import { waitForPreviewDashboardHydration } from "./helpers";
import { expect, test } from "./test";

const MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY = "librerss:mobileUiGroupedLayout";

test.describe("dashboard toolbar tablet placement", () => {
  test("renders the token toolbar shell with symmetric pill caps", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 900 });
    await page.goto("/dashboard?explore=1", { waitUntil: "domcontentloaded" });
    await waitForPreviewDashboardHydration(page);

    const pillMetrics = await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>(
        '[data-dashboard-filter-bar-surface="true"]',
      );
      const article = document.querySelector<HTMLElement>(
        "article[data-article-key]",
      );
      const articleHeader = article?.querySelector<HTMLElement>(
        '[data-article-swipe-zone="header"]',
      );
      const status = surface?.querySelector<HTMLElement>(
        '[data-dashboard-filter-bar-status="true"]',
      );

      if (!surface || !article || !articleHeader || !status) {
        return null;
      }

      const rect = surface.getBoundingClientRect();
      const articleRect = article.getBoundingClientRect();
      const statusRect = status.getBoundingClientRect();
      const articleHeaderStyle = getComputedStyle(articleHeader);
      const articleStyle = getComputedStyle(article);
      const style = getComputedStyle(surface);
      const radius = Number.parseFloat(style.borderTopLeftRadius);
      return {
        articleBackgroundColor: articleHeaderStyle.backgroundColor,
        articleBorderColor: articleStyle.borderColor,
        articleLeft: articleRect.left,
        articleRight: articleRect.right,
        articleWidth: articleRect.width,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        height: rect.height,
        left: rect.left,
        radius,
        right: rect.right,
        statusRightInset: rect.right - statusRect.right,
        width: rect.width,
      };
    });

    expect(pillMetrics).not.toBeNull();
    expect(pillMetrics?.radius ?? 0).toBeGreaterThanOrEqual(
      (pillMetrics?.height ?? 0) / 2 - 1,
    );
    expect(pillMetrics?.height ?? 0).toBe(32);
    expect(
      Math.abs((pillMetrics?.left ?? 0) - (pillMetrics?.articleLeft ?? 999)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((pillMetrics?.right ?? 0) - (pillMetrics?.articleRight ?? 999)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((pillMetrics?.width ?? 0) - (pillMetrics?.articleWidth ?? 999)),
    ).toBeLessThanOrEqual(1);
    expect(pillMetrics?.backgroundColor).toBe(
      pillMetrics?.articleBackgroundColor,
    );
    expect(pillMetrics?.borderColor).toBe(pillMetrics?.articleBorderColor);
    expect(pillMetrics?.statusRightInset ?? 999).toBeLessThanOrEqual(12);
    expect(pillMetrics?.statusRightInset ?? 0).toBeGreaterThanOrEqual(8);
  });

  test("keeps the bottom toolbar from adding a tablet top gap", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ mobileUiGroupedLayoutStorageKey }) => {
        window.localStorage.setItem(
          mobileUiGroupedLayoutStorageKey,
          JSON.stringify(true),
        );
      },
      {
        mobileUiGroupedLayoutStorageKey: MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
      },
    );

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
        "article[data-article-key]",
      );
      const firstArticleRect = firstArticle?.getBoundingClientRect();

      const toolbarRect = toolbar.getBoundingClientRect();
      const filterBarRect = filterBar.getBoundingClientRect();

      return {
        filterBarBottom: filterBarRect.bottom,
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
    expect(layoutMetrics?.filterBarBottom ?? 999).toBeLessThanOrEqual(
      layoutMetrics?.toolbarTop ?? 0,
    );
    expect(layoutMetrics?.firstArticleTop ?? 999).toBeLessThan(120);
  });
});
