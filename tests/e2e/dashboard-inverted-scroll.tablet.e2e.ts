import { articleCard, waitForPreviewDashboardHydration } from "./helpers";
import { expect, test } from "./test";

const MOBILE_INVERTED_SCROLL_STORAGE_KEY = "librerss:mobileInvertedScroll";

test.describe("dashboard tablet inverted scroll", () => {
  test("applies the mobile inverted-scroll setting below desktop widths", async ({
    page,
  }) => {
    await page.addInitScript(
      ({ storageKey }) => {
        window.localStorage.setItem(storageKey, JSON.stringify(true));
      },
      { storageKey: MOBILE_INVERTED_SCROLL_STORAGE_KEY },
    );

    await page.setViewportSize({ height: 900, width: 900 });
    await page.goto("/dashboard?explore=1", { waitUntil: "domcontentloaded" });
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await waitForPreviewDashboardHydration(page);

    const invertedMetrics = await page.evaluate(() => {
      const feedSurface = document.querySelector<HTMLElement>(
        "[data-feed-surface-mode]",
      );
      const viewport = document.querySelector<HTMLElement>(
        "[data-feed-scroll-viewport='true'], [data-radix-scroll-area-viewport]",
      );

      if (!feedSurface || !viewport) {
        return null;
      }

      return {
        invertedAttr:
          feedSurface.getAttribute("data-inverted-scroll") ??
          document
            .querySelector("[data-inverted-scroll='true']")
            ?.getAttribute("data-inverted-scroll") ??
          null,
        remainingBottomGap: Math.round(
          viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight),
        ),
        width: window.innerWidth,
      };
    });

    expect(invertedMetrics).not.toBeNull();
    expect(invertedMetrics?.width ?? 0).toBeGreaterThanOrEqual(900);
    expect(invertedMetrics?.invertedAttr).toBe("true");
    expect(invertedMetrics?.remainingBottomGap ?? 999).toBeLessThanOrEqual(2);
  });
});
