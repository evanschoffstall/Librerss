import type { Page } from "@playwright/test";

import {
  expectArticleExpanded,
  installDeterministicArticleExtractRoute,
  installDeterministicFeedBatchRoute,
} from "./helpers";
import { expect, test } from "./test";

const BATCH_REFRESH_BUDGET_EXHAUSTED_MESSAGE =
  "Batch refresh budget exhausted before feed refresh started";

/** Captures a feed batch request body shape used by dashboard e2e routes. */
interface FeedBatchRequestBody {
  forceRefresh?: boolean;
  skipRefresh?: boolean;
  urls?: string[];
}

const ERROR_RECOVERY_FEEDS = [
  {
    category: "Science",
    enabled: true,
    extractionDisabled: false,
    id: 1,
    name: "Deterministic Science",
    proxyEnabled: false,
    url: "https://example.com/e2e/science.xml",
  },
  {
    category: "World",
    enabled: true,
    extractionDisabled: false,
    id: 2,
    name: "Deterministic World",
    proxyEnabled: false,
    url: "https://example.com/e2e/world.xml",
  },
  {
    category: "Local",
    enabled: true,
    extractionDisabled: false,
    id: 3,
    name: "Deterministic Local",
    proxyEnabled: false,
    url: "https://example.com/e2e/local.xml",
  },
] as const;

/**
 * Navigates to the authenticated dashboard and waits for the first article card
 * to render after any login or redirect work completes.
 */
async function gotoAuthenticatedDashboard(page: Page) {
  const visibleArticles = page.locator("article[data-article-key]:visible");

  await installDashboardShellRoutes(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard$/);
  await normalizeDashboardArticleVisibility(page);
  await expect
    .poll(async () => {
      return await page.locator("article[data-article-key]").count();
    })
    .toBeGreaterThan(0);
  await expect(visibleArticles.first()).toBeVisible({ timeout: 15_000 });
}

/** Installs deterministic dashboard shell routes used by feed recovery tests. */
async function installDashboardShellRoutes(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        allowSignup: false,
        authenticated: true,
        usePlaceholderData: false,
        user: { email: "feed-error-recovery@example.test", id: 1 },
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/feeds", async (route) => {
    await route.fulfill({
      body: JSON.stringify(ERROR_RECOVERY_FEEDS),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/feeds/category-order", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ orderedLabels: ["Science", "World", "Local"] }),
      contentType: "application/json",
      status: 200,
    });
  });
}

async function normalizeDashboardArticleVisibility(page: Page) {
  const searchInput = page.getByPlaceholder("Search...");
  await expect(searchInput).toBeVisible({ timeout: 15_000 });

  const allFilterButton = page.getByRole("button", {
    exact: true,
    name: "all",
  });
  await expect(allFilterButton).toBeVisible({ timeout: 15_000 });

  const allFeedsButton = page.getByRole("button", {
    exact: true,
    name: "All Feeds",
  });
  await expect(allFeedsButton).toBeVisible({ timeout: 15_000 });

  await searchInput.fill("");
  await allFilterButton.click();
  await allFeedsButton.click();
}

test.describe("dashboard feed error recovery", () => {
  test("keeps the previous article list visible when one refresh invocation returns 504", async ({
    page,
  }) => {
    const shouldFailNextBatchRequest = { current: false };
    await installDeterministicArticleExtractRoute(page);
    await installDeterministicFeedBatchRoute(page, {
      articleHasFullContent: false,
      failNextBatchRequestRef: shouldFailNextBatchRequest,
    });

    await gotoAuthenticatedDashboard(page);

    const visibleArticles = page.locator("article[data-article-key]:visible");
    const firstArticle = visibleArticles.first();
    const firstArticleKey = await firstArticle.getAttribute("data-article-key");

    expect(firstArticleKey).toBeTruthy();

    const initialArticleCount = await page.evaluate(() => {
      return document.querySelectorAll("article[data-article-key]").length;
    });
    expect(initialArticleCount).toBeGreaterThan(0);

    shouldFailNextBatchRequest.current = true;

    await page
      .getByRole("button", { exact: true, name: "Refresh selected feed" })
      .last()
      .click();

    await expect(page.getByText("Some feeds failed to update")).toBeVisible({
      timeout: 10_000,
    });

    await expect(firstArticle).toBeVisible();
    await expect(visibleArticles).toHaveCount(initialArticleCount);
    await expect(
      page.locator(
        `article[data-article-key="${String(firstArticleKey)}"]:visible`,
      ),
    ).toBeVisible();

    await firstArticle.click();
    await expectArticleExpanded(firstArticle, true);
    await expect(firstArticle).toContainText("Deterministic extract", {
      timeout: 10_000,
    });
  });

  test("keeps successful refresh results when proxy credentials cannot be read", async ({
    page,
  }) => {
    const proxyFailureUrlRef = { current: "" };

    await installDeterministicArticleExtractRoute(page);
    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route
        .request()
        .postDataJSON() as FeedBatchRequestBody;
      const urls = Array.isArray(requestBody.urls) ? requestBody.urls : [];
      if (!requestBody.forceRefresh && urls.length > 1) {
        proxyFailureUrlRef.current = urls[1] ?? "";
      }

      const payload = urls.map((url, index) => {
        if (
          requestBody.forceRefresh === true &&
          !requestBody.skipRefresh &&
          url === proxyFailureUrlRef.current
        ) {
          return {
            articles: [],
            error:
              "Saved proxy password could not be read. Update it in settings and try again.",
            ok: false,
            statusCode: 504,
            url,
          };
        }

        return {
          articles: [
            {
              content:
                requestBody.forceRefresh === true
                  ? "Direct feed refreshed while proxy settings need attention."
                  : "Initial dashboard article.",
              feedId: index + 1,
              feedName: `Direct Feed ${index + 1}`,
              feedUrl: url,
              hasFullContent: true,
              id:
                requestBody.forceRefresh === true ? 12_000 + index : index + 1,
              isRead: false,
              isStarred: false,
              lastChecked: "2026-05-03T18:00:00.000Z",
              link: `https://example.com/proxy-recovery-${index + 1}`,
              publicationDate: "2026-05-03T17:59:00.000Z",
              title:
                requestBody.forceRefresh === true
                  ? `Direct refresh survived proxy error ${index + 1}`
                  : `Initial proxy recovery article ${index + 1}`,
            },
          ],
          lastFetchedAt: "2026-05-03T18:00:00.000Z",
          ok: true,
          url,
        };
      });

      await route.fulfill({
        body: JSON.stringify(payload),
        contentType: "application/json",
        status: requestBody.forceRefresh === true ? 207 : 200,
      });
    });

    await gotoAuthenticatedDashboard(page);

    await page
      .getByRole("button", { exact: true, name: "Refresh selected feed" })
      .last()
      .click();

    await expect(
      page.getByText(/Direct refresh survived proxy error/).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Some feeds failed to update")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Deterministic World (HTTP 504)")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.locator("article[data-article-key]:visible"),
    ).not.toHaveCount(0);
  });

  test("keeps successful all-feeds refresh results when one feed exhausts the refresh budget", async ({
    page,
  }) => {
    const batchRequestLog: FeedBatchRequestBody[] = [];
    const budgetFailureUrlRef = { current: "" };

    await installDeterministicArticleExtractRoute(page);
    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route
        .request()
        .postDataJSON() as FeedBatchRequestBody;
      batchRequestLog.push(requestBody);
      const urls = Array.isArray(requestBody.urls) ? requestBody.urls : [];
      if (!requestBody.forceRefresh && urls.length > 1) {
        budgetFailureUrlRef.current = urls[0] ?? "";
      }

      const payload = urls.map((url, index) => {
        if (
          requestBody.forceRefresh === true &&
          !requestBody.skipRefresh &&
          url === budgetFailureUrlRef.current
        ) {
          return {
            articles: [],
            error: BATCH_REFRESH_BUDGET_EXHAUSTED_MESSAGE,
            ok: false,
            url,
          };
        }

        return {
          articles: [
            {
              content: requestBody.forceRefresh
                ? "Recovered from mixed refresh."
                : "Initial dashboard article.",
              feedId: index + 1,
              feedName: `Feed ${index + 1}`,
              feedUrl: url,
              hasFullContent: true,
              id: requestBody.forceRefresh ? 10_000 + index : index + 1,
              isRead: false,
              isStarred: false,
              lastChecked: "2026-05-03T12:00:00.000Z",
              link: `https://example.com/mixed-refresh-${index + 1}`,
              publicationDate: "2026-05-03T11:59:00.000Z",
              title: requestBody.forceRefresh
                ? `Recovered refresh article ${index + 1}`
                : `Initial article ${index + 1}`,
            },
          ],
          lastFetchedAt: "2026-05-03T12:00:00.000Z",
          ok: true,
          url,
        };
      });

      await route.fulfill({
        body: JSON.stringify(payload),
        contentType: "application/json",
        status: requestBody.forceRefresh === true ? 207 : 200,
      });
    });

    await gotoAuthenticatedDashboard(page);

    await page
      .getByRole("button", { exact: true, name: "Refresh selected feed" })
      .last()
      .click();

    await expect(
      page.getByText(/Recovered refresh article/).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Unable to load this feed right now."),
    ).toHaveCount(0);
    await expect(page.getByText("Some feeds failed to update")).toBeVisible({
      timeout: 10_000,
    });

    const aggregateRefreshRead = batchRequestLog.find(
      (requestBody) =>
        requestBody.forceRefresh === true &&
        requestBody.skipRefresh === true &&
        Array.isArray(requestBody.urls) &&
        requestBody.urls.length > 1,
    );
    expect(
      aggregateRefreshRead,
      `Expected a multi-feed aggregate cache read after fan-out. Full log: ${JSON.stringify(
        batchRequestLog,
      )}`,
    ).toBeTruthy();

    const fanOutUrls = new Set(
      batchRequestLog
        .filter(
          (requestBody) =>
            requestBody.forceRefresh === true &&
            !requestBody.skipRefresh &&
            Array.isArray(requestBody.urls) &&
            requestBody.urls.length === 1,
        )
        .map((requestBody) => requestBody.urls?.[0]),
    );

    for (const url of aggregateRefreshRead?.urls ?? []) {
      expect(
        fanOutUrls.has(url),
        `Expected ${url} to refresh in its own request before the aggregate cache read. Full log: ${JSON.stringify(
          batchRequestLog,
        )}`,
      ).toBe(true);
    }
  });

  test("renders a live search result from a fresh searched batch window", async ({
    page,
  }) => {
    const searchedBatchBodies: unknown[] = [];

    await page.route("**/api/feeds/batch", async (route) => {
      const requestBody = route.request().postDataJSON() as {
        knownLastFetchedAtByUrl?: Record<string, string>;
        requestSource?: string;
        searchTerm?: string;
        urls?: string[];
      };
      const urls = Array.isArray(requestBody.urls) ? requestBody.urls : [];
      const isSearchRequest = requestBody.requestSource === "search-change";

      if (isSearchRequest) {
        searchedBatchBodies.push(requestBody);
      }

      const payload = urls.map((url, index) => ({
        articles:
          isSearchRequest && index === 0
            ? [
                {
                  content: "A searched batch article returned by the server.",
                  feedId: 9001,
                  feedName: "Livescience",
                  feedUrl: url,
                  hasFullContent: true,
                  id: 9001,
                  isRead: false,
                  isStarred: false,
                  lastChecked: "2026-04-27T02:00:00.000Z",
                  link: "https://example.com/livescience-search-result",
                  publicationDate: "2026-04-27T01:59:00.000Z",
                  title: "Livescience search result",
                },
              ]
            : [
                {
                  content: "Initial dashboard article.",
                  feedId: index + 1,
                  feedName: `Initial Feed ${index + 1}`,
                  feedUrl: url,
                  hasFullContent: true,
                  id: index + 1,
                  isRead: false,
                  isStarred: false,
                  lastChecked: "2026-04-27T01:55:00.000Z",
                  link: `https://example.com/initial-${index + 1}`,
                  publicationDate: "2026-04-27T01:54:00.000Z",
                  title: `Initial article ${index + 1}`,
                },
              ],
        lastFetchedAt: "2026-04-27T02:00:00.000Z",
        ok: true,
        url,
      }));

      await route.fulfill({
        body: JSON.stringify(payload),
        contentType: "application/json",
        status: 200,
      });
    });

    await gotoAuthenticatedDashboard(page);

    await page.getByPlaceholder("Search...").fill("livescience");
    await expect(page.getByText("Livescience search result")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "No results" })).toHaveCount(
      0,
    );

    await expect
      .poll(() => searchedBatchBodies.length)
      .toBeGreaterThanOrEqual(1);
    expect(
      (searchedBatchBodies.at(-1) as { knownLastFetchedAtByUrl?: unknown })
        .knownLastFetchedAtByUrl,
    ).toBeUndefined();
  });
});
