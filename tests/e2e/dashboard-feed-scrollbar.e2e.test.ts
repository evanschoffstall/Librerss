import {
  articleCard,
  expectArticleExpanded,
  gotoPreviewDashboard,
  waitForPreviewDashboardHydration,
} from "./helpers";
import { expect, test } from "./test";

async function readFeedScrollbarState(
  page: Parameters<typeof gotoPreviewDashboard>[0],
) {
  return await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>(
      '[data-feed-scroll-viewport="true"]',
    );
    const thumb = document.querySelector<HTMLElement>(
      '[data-dashboard-feed-scrollbar-thumb="true"]',
    );

    if (!viewport || !thumb) {
      throw new Error("Expected the feed viewport and scrollbar thumb.");
    }

    return {
      thumbHeight: Number.parseFloat(thumb.style.height || "0"),
      thumbOffsetTop: Number.parseFloat(
        thumb.style.transform.match(/translateY\(([-\d.]+)px\)/u)?.[1] ?? "0",
      ),
      totalListHeight: Number.parseFloat(
        viewport.querySelector<HTMLElement>("[data-feed-total-list-height]")
          ?.dataset.feedTotalListHeight ?? "0",
      ),
      viewportClientHeight: viewport.clientHeight,
      viewportScrollHeight: viewport.scrollHeight,
    };
  });
}

test.describe("dashboard feed scrollbar", () => {
  test("shrinks the overlay thumb after article expansion increases the live scroll range", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = articleCard(page, 0);
    await expect(article).toBeVisible({ timeout: 15_000 });

    const initialState = await readFeedScrollbarState(page);
    expect(initialState.thumbHeight).toBeGreaterThan(0);
    expect(initialState.viewportScrollHeight).toBeGreaterThan(
      initialState.viewportClientHeight,
    );

    await article.click();
    await expectArticleExpanded(article, true);
    await expect
      .poll(async () => {
        return await article
          .locator('[data-article-hydration-state="loading"]')
          .count();
      })
      .toBe(0);

    await expect
      .poll(async () => {
        const nextState = await readFeedScrollbarState(page);

        return {
          thumbHeight: nextState.thumbHeight,
          viewportScrollHeight: nextState.viewportScrollHeight,
        };
      })
      .toMatchObject({
        thumbHeight: expect.any(Number),
        viewportScrollHeight: expect.any(Number),
      });

    const expandedState = await readFeedScrollbarState(page);

    expect(expandedState.viewportScrollHeight).toBeGreaterThan(
      initialState.viewportScrollHeight,
    );
    expect(expandedState.thumbHeight).toBeLessThan(initialState.thumbHeight);
  });
});
