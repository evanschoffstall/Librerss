import {
  articleCard,
  articleCardByKey,
  expectArticleExpanded,
  gotoPreviewDashboard,
} from "./helpers";
import { expect, test } from "./test";

/** Returns a visible preview-feed button by its displayed source name. */
function previewFeedButton(
  page: Parameters<typeof articleCard>[0],
  feedName: string,
) {
  const escapedFeedName = feedName.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return page
    .locator("button:visible")
    .filter({
      has: page.locator("p", {
        hasText: new RegExp(`^${escapedFeedName}$`),
      }),
    })
    .first();
}

/** Selects a named placeholder preview source from the feed picker. */
async function selectPreviewFeed(
  page: Parameters<typeof articleCard>[0],
  feedName: string,
) {
  const openFeedsButton = page.getByRole("button", { name: "Open feeds" });
  if (await openFeedsButton.isVisible().catch(() => false)) {
    await openFeedsButton.click();
  }

  await page.getByRole("button", { name: "Placeholder Feeds" }).click();
  const feedButton = previewFeedButton(page, feedName);
  await expect(feedButton).toBeVisible({ timeout: 15_000 });
  await feedButton.evaluate((button) => {
    if (!(button instanceof HTMLElement)) {
      throw new Error("Expected a feed button element.");
    }

    button.click();
  });
}

/** Waits until the browser has painted at least one frame. */
async function waitForBrowserPaint(page: Parameters<typeof articleCard>[0]) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      }),
  );
}

test.describe("dashboard article hydration", () => {
  test("hydrates extraction-disabled explore feed excerpts from bundled snapshots", async ({
    page,
  }) => {
    let extractRequests = 0;
    await page.route("**/api/articles/extract", async (route) => {
      extractRequests += 1;
      await route.fulfill({
        body: JSON.stringify({
          content: "<article>Unexpected extract</article>",
        }),
        contentType: "application/json",
        status: 200,
      });
    });

    await gotoPreviewDashboard(page);
    await selectPreviewFeed(page, "ESA Top News");

    const article = articleCardByKey(
      page,
      "https://www.esa.int/Science_Exploration/Human_and_Robotic_Exploration/epsilon",
    );
    await expect(article).toContainText("ESA highlights epsilon", {
      timeout: 15_000,
    });
    await article.evaluate((node) => {
      if (!(node instanceof HTMLElement)) {
        throw new Error("Expected an article card element.");
      }

      node.click();
    });

    await expectArticleExpanded(article, true);
    await waitForBrowserPaint(page);
    await waitForBrowserPaint(page);
    await expect(
      article.locator('[data-article-hydration-state="loading"]'),
    ).toHaveCount(0);
    await expect(article).toContainText("Unexpected extract");
    expect(extractRequests).toBe(1);
  });
});
