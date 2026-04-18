import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  readRenderedItemWindow,
  scrollFeedViewportToBottom,
} from "./helpers";
import { expect, test } from "./test";

/**
 * Uses a MutationObserver to detect skeleton DOM nodes appearing during
 * scroll-triggered pagination. Returns the peak skeleton count and
 * approximate duration in milliseconds.
 */
async function observeSkeletonVisibility(
  page: import("@playwright/test").Page,
) {
  return await page.evaluate(() => {
    return new Promise<{
      durationMs: "still visible" | number;
      peakSkeletonCount: number;
      skeletonsSeen: boolean;
    }>((resolve) => {
      let skeletonsSeen = false;
      let peakSkeletonCount = 0;
      let appearTime = 0;
      let disappearTime = 0;

      const observer = new MutationObserver(() => {
        const items = document.querySelectorAll(
          "[data-dashboard-feed-list-skeleton-item]",
        );

        if (items.length > 0) {
          if (!skeletonsSeen) {
            skeletonsSeen = true;
            appearTime = performance.now();
          }
          peakSkeletonCount = Math.max(peakSkeletonCount, items.length);
        } else if (skeletonsSeen && disappearTime === 0) {
          disappearTime = performance.now();
        }
      });

      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });

      window.setTimeout(() => {
        observer.disconnect();
        resolve({
          durationMs:
            disappearTime > 0 && appearTime > 0
              ? Math.round(disappearTime - appearTime)
              : skeletonsSeen
                ? "still visible"
                : 0,
          peakSkeletonCount,
          skeletonsSeen,
        });
      }, 4000);
    });
  });
}

test.describe("feed pagination skeleton visibility", () => {
  test("shows skeleton rows during scroll-triggered pagination", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 640, width: 1024 });
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await configureArticlesPerPage(page, 4);

    // Wait for initial articles to be present.
    await expect
      .poll(async () => {
        return await page.locator("article[data-article-key]").count();
      })
      .toBeGreaterThanOrEqual(4);

    // Start observing for skeletons, then trigger pagination.
    const [skeletonResult] = await Promise.all([
      observeSkeletonVisibility(page),
      scrollFeedViewportToBottom(page),
    ]);

    expect(skeletonResult.skeletonsSeen).toBe(true);
    expect(skeletonResult.peakSkeletonCount).toBeGreaterThanOrEqual(4);
  });

  test("continues pagination after reaching the scroll boundary", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 640, width: 1024 });
    await gotoPreviewDashboard(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();
    await configureArticlesPerPage(page, 4);

    // Wait for initial articles.
    await expect
      .poll(async () => {
        return await page.locator("article[data-article-key]").count();
      })
      .toBeGreaterThanOrEqual(4);

    // First scroll — triggers pagination.
    await scrollFeedViewportToBottom(page);

    // Wait for more articles to appear after the first pagination cycle.
    const firstWindowItemCount = await page.evaluate(() => {
      const viewport = document.querySelector(
        "[data-feed-scroll-viewport]",
      ) as HTMLElement | null;
      return viewport?.scrollHeight ?? 0;
    });

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          const viewport = document.querySelector(
            "[data-feed-scroll-viewport]",
          ) as HTMLElement | null;
          return viewport?.scrollHeight ?? 0;
        });
      })
      .toBeGreaterThanOrEqual(firstWindowItemCount);

    // Second scroll — the race condition fix must re-arm the boundary so
    // this scroll triggers another pagination round without deadlocking.
    await scrollFeedViewportToBottom(page);

    await expect
      .poll(async () => {
        const window = await readRenderedItemWindow(page);
        return window.maxIndex;
      })
      .toBeGreaterThanOrEqual(7);
  });
});
