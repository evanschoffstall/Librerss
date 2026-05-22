import type { Locator, Page } from "@playwright/test";

import { gotoPreviewDashboard, openDashboardSettingsTab } from "./helpers";
import { expect, test } from "./test";

const HTML_INSTEAD_OF_FEED_XML_ERROR_MESSAGE =
  "Upstream returned HTML instead of RSS or Atom feed XML";

/** Returns the latest visible Sonner toast rendered by the dashboard. */
function latestToast(page: Page): Locator {
  return page.locator("[data-sonner-toast]").last();
}

/** Opens the add-feed form, submits a valid URL, and waits for the result toast. */
async function submitFeedSource(page: Page) {
  await openDashboardSettingsTab(page, "Feeds");
  await page.getByRole("button", { name: "Add feed" }).first().click();

  await page.getByPlaceholder("Feed name").fill("Assigned Media");
  await page
    .getByPlaceholder("https://example.com/feed.xml")
    .fill("https://assignedmedia.org/?format=rss");
  await page
    .getByRole("button", { name: /^Add Feed$/ })
    .last()
    .click();

  await expect(latestToast(page)).toBeVisible({ timeout: 10_000 });
}

test.describe("dashboard add-feed upstream error handling", () => {
  test("shows the normalized HTML-instead-of-feed message from the server", async ({
    page,
  }) => {
    let createFeedRequestCount = 0;

    await page.route("**/api/feeds", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }

      createFeedRequestCount += 1;
      await route.fulfill({
        body: JSON.stringify({
          error: HTML_INSTEAD_OF_FEED_XML_ERROR_MESSAGE,
        }),
        contentType: "application/json",
        status: 502,
      });
    });

    await gotoPreviewDashboard(page);
    await submitFeedSource(page);

    await expect(latestToast(page)).toContainText(
      HTML_INSTEAD_OF_FEED_XML_ERROR_MESSAGE,
    );
    expect(createFeedRequestCount).toBe(1);
  });
});
