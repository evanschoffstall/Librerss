import type { Page } from "@playwright/test";

import {
  installDeterministicFeedBatchRoute,
  openDashboardSettingsTab,
} from "./helpers";
import { expect, test } from "./test";

interface MockFeedRecord {
  category: string;
  enabled: boolean;
  extractionDisabled: boolean;
  id: number;
  name: string;
  proxyEnabled: boolean;
  url: string;
}

const INITIAL_FEEDS: MockFeedRecord[] = [
  {
    category: "News",
    enabled: true,
    extractionDisabled: false,
    id: 1,
    name: "Existing Feed",
    proxyEnabled: false,
    url: "https://example.com/e2e/existing.xml",
  },
];

/**
 * Navigate to the authenticated dashboard backed by deterministic shell routes.
 * @param page - The page to navigate.
 */
async function gotoMockAuthenticatedDashboard(page: Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard$/u);
  await expect(
    page.getByRole("button", { name: "Open dashboard settings" }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: /^Existing Feed\s+example\.com$/u }),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Install deterministic authenticated shell routes for add-feed coverage.
 * @param page - The page that should receive the dashboard route overrides.
 */
async function installAuthenticatedAddFeedRoutes(page: Page) {
  let nextFeedId = INITIAL_FEEDS.length + 1;
  let feedRecords = [...INITIAL_FEEDS];

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        allowSignup: false,
        authenticated: true,
        canManageInvitations: false,
        invitationsEnabled: true,
        usePlaceholderData: false,
        user: { email: "add-feed@example.test", id: 1 },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/api/feeds/category-order", async (route) => {
    const orderedLabels = [
      ...new Set(feedRecords.map((feed) => feed.category)),
    ];

    await route.fulfill({
      body: JSON.stringify({ orderedLabels }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.route("**/api/feeds", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill({
        body: JSON.stringify(feedRecords),
        contentType: "application/json",
        status: 200,
      });
      return;
    }

    if (method === "POST") {
      const requestBody = route.request().postDataJSON() as {
        category?: string;
        name?: string;
        url?: string;
      };
      const createdFeed: MockFeedRecord = {
        category: requestBody.category ?? "News",
        enabled: true,
        extractionDisabled: false,
        id: nextFeedId,
        name: requestBody.name ?? `Feed ${nextFeedId}`,
        proxyEnabled: false,
        url:
          requestBody.url ?? `https://example.com/e2e/feed-${nextFeedId}.xml`,
      };

      nextFeedId += 1;
      feedRecords = [...feedRecords, createdFeed];

      await route.fulfill({
        body: JSON.stringify(createdFeed),
        contentType: "application/json",
        status: 200,
      });
      return;
    }

    await route.continue();
  });
}

test.describe("dashboard add-feed visibility", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedAddFeedRoutes(page);
    await installDeterministicFeedBatchRoute(page, {
      articleFeedCount: 2,
      articlesPerFeed: 6,
      respectArticleLimit: true,
    });
  });

  test("keeps a newly added feed visible in settings and the sidebar without a full reload", async ({
    page,
  }) => {
    await gotoMockAuthenticatedDashboard(page);
    await openDashboardSettingsTab(page, "Feeds");

    const dialog = page.getByRole("dialog", { name: "Reader Settings" });
    await dialog.getByRole("button", { name: "Add feed" }).first().click();

    await dialog.getByPlaceholder("Feed name").fill("Created Feed");
    await dialog
      .getByPlaceholder("https://example.com/feed.xml")
      .fill("https://example.com/e2e/created.xml");
    await dialog.getByRole("button", { name: "Add Feed" }).last().click();

    await expect(dialog.getByText("Created Feed", { exact: true })).toBeVisible(
      {
        timeout: 15_000,
      },
    );

    await dialog.getByRole("button", { name: "Close" }).click();

    await expect(
      page.getByRole("button", { name: /^Created Feed\s+example\.com$/u }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
