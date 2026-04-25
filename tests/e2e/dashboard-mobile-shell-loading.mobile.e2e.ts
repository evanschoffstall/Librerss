import { expect, test } from "./test";

const MOBILE_INVERTED_SCROLL_STORAGE_KEY = "librerss:mobileInvertedScroll";

test.describe("dashboard mobile shell loading", () => {
  test("anchors inverted feed skeletons from bottom to top during the initial load", async ({
    page,
  }) => {
    await page.addInitScript((storageKey) => {
      window.localStorage.setItem(storageKey, JSON.stringify(true));
    }, MOBILE_INVERTED_SCROLL_STORAGE_KEY);

    await page.goto("/dashboard?explore=1", { waitUntil: "domcontentloaded" });

    const feedSkeleton = page.locator(
      '[data-dashboard-feed-list-skeleton="true"]',
    );

    await expect(feedSkeleton).toBeVisible();

    const skeletonGeometry = await page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>(
        '[data-feed-scroll-viewport="true"]',
      );
      const skeletonSurface = document.querySelector<HTMLElement>(
        '[data-dashboard-feed-list-skeleton="true"]',
      );
      const skeletonRows = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-dashboard-feed-list-skeleton-item="true"]',
        ),
      );

      if (!viewport || !skeletonSurface || skeletonRows.length === 0) {
        return null;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const firstRowRect = skeletonRows[0]?.getBoundingClientRect();
      const lastRowRect = skeletonRows.at(-1)?.getBoundingClientRect();

      if (!firstRowRect || !lastRowRect) {
        return null;
      }

      return {
        firstRowTopOffset:
          Math.round((firstRowRect.top - viewportRect.top) * 100) / 100,
        lastRowBottomOffset:
          Math.round((viewportRect.bottom - lastRowRect.bottom) * 100) / 100,
        rowCount: skeletonRows.length,
      };
    });

    expect(skeletonGeometry).not.toBeNull();
    expect(skeletonGeometry?.rowCount ?? 0).toBeGreaterThan(0);
    expect(
      skeletonGeometry?.lastRowBottomOffset ?? Number.POSITIVE_INFINITY,
    ).toBeLessThanOrEqual(10);
    expect(skeletonGeometry?.firstRowTopOffset ?? 0).toBeGreaterThan(10);
  });
});
