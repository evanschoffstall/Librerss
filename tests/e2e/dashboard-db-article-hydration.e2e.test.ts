import type { Page } from "@playwright/test";

import { and, asc, desc, eq } from "drizzle-orm";

import {
  ALL_FEEDS_NODE_KEY,
  DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
  DASHBOARD_ARTICLE_SORT_ORDER_STORAGE_KEY,
  DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
  DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
} from "@/app/dashboard/services/dashboard";
import {
  articles,
  articleStatuses,
  feeds,
  feedSources,
  getDb,
  users,
} from "@/lib/db";

import {
  getDashboardLoginCredentials,
  gotoAuthenticatedDashboard,
  readFeedViewportMetrics,
  readVisibleFeedArticleCount,
  setFeedViewportScrollTop,
} from "./helpers";
import { expect, test } from "./test";

const DASHBOARD_DB_HYDRATION_WINDOW_SIZE = 50;

interface DbHydrationArticle {
  id: number;
  isRead: boolean;
  isStarred: boolean;
  link: string;
  title: string;
}

type DbHydrationSortOrder = "newest" | "oldest";

interface DbHydrationWindow {
  articles: DbHydrationArticle[];
  feedUrls: string[];
}

interface DomHydrationArticle {
  articleKey: string;
  index: number;
  title: string;
}

test.describe("dashboard DB article hydration", () => {
  for (const sortOrder of ["newest", "oldest"] as const) {
    test(`hydrates the ${sortOrder} 50-article DB window exactly`, async ({
      page,
    }) => {
      test.setTimeout(60_000);

      const expectedWindow = await readExpectedDbHydrationWindow(sortOrder);
      await gotoAuthenticatedDashboard(page);
      const backendPayload = await fetchBackendHydrationPayload(
        page,
        expectedWindow.feedUrls,
        sortOrder,
      );
      const backendWindow = extractBackendHydrationWindow(
        backendPayload,
        sortOrder,
      );

      expect(backendWindow.map((article) => article.link)).toEqual(
        expectedWindow.articles.map((article) => article.link),
      );
      expect(backendWindow.map((article) => article.title)).toEqual(
        expectedWindow.articles.map((article) => article.title),
      );

      await renderDashboardHydrationWindow(page, sortOrder, backendPayload);
      const actualWindow = await collectRenderedHydrationWindow(page);

      expect(actualWindow.map((article) => article.articleKey)).toEqual(
        expectedWindow.articles.map((article) => article.link),
      );
      expect(actualWindow.map((article) => article.title)).toEqual(
        expectedWindow.articles.map((article) => article.title),
      );
    });
  }
});

interface DbHydrationArticleWithDate extends DbHydrationArticle {
  publicationDate: string;
}

/**
 * Collects the exact 50-card dashboard window from the virtualized feed by
 * walking the active viewport until every logical row index has mounted.
 * @param page - Active Playwright page.
 * @returns The rendered article keys and titles ordered by virtual row index.
 */
async function collectRenderedHydrationWindow(page: Page) {
  const articlesByIndex = new Map<number, DomHydrationArticle>();

  await setFeedViewportScrollTop(page, 0);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    for (const article of await readMountedHydrationArticles(page)) {
      if (
        article.index >= 0 &&
        article.index < DASHBOARD_DB_HYDRATION_WINDOW_SIZE
      ) {
        articlesByIndex.set(article.index, article);
      }
    }

    if (articlesByIndex.size === DASHBOARD_DB_HYDRATION_WINDOW_SIZE) {
      break;
    }

    const metrics = await readFeedViewportMetrics(page);
    const maxScrollTop = Math.max(
      0,
      metrics.scrollHeight - metrics.clientHeight,
    );
    const nextScrollTop = Math.min(
      maxScrollTop,
      metrics.scrollTop + Math.max(120, Math.floor(metrics.clientHeight * 0.8)),
    );

    if (nextScrollTop === metrics.scrollTop) {
      break;
    }

    await setFeedViewportScrollTop(page, nextScrollTop);
  }

  const missingIndexes = Array.from(
    { length: DASHBOARD_DB_HYDRATION_WINDOW_SIZE },
    (_ignored, index) => index,
  ).filter((index) => !articlesByIndex.has(index));

  expect(
    missingIndexes,
    "Expected every article row index to hydrate.",
  ).toEqual([]);

  return Array.from(articlesByIndex.entries())
    .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
    .map(([, article]) => article);
}

/**
 * Compares backend articles by the dashboard's global chronological order.
 * @param left - Left article.
 * @param right - Right article.
 * @param sortOrder - Chronological order under test.
 * @returns Standard array-sort comparison result.
 */
function compareBackendHydrationArticles(
  left: DbHydrationArticleWithDate,
  right: DbHydrationArticleWithDate,
  sortOrder: DbHydrationSortOrder,
) {
  const leftTime = new Date(left.publicationDate).getTime();
  const rightTime = new Date(right.publicationDate).getTime();
  const ascendingDelta = leftTime - rightTime || left.id - right.id;

  return sortOrder === "oldest" ? ascendingDelta : -ascendingDelta;
}

/**
 * Extracts and sorts the backend batch payload the same way the dashboard does
 * before comparing it with the separate DB query.
 * @param payload - Raw `/api/feeds/batch` JSON payload.
 * @param sortOrder - Chronological order under test.
 * @returns The first 50 backend articles in global dashboard order.
 */
function extractBackendHydrationWindow(
  payload: unknown,
  sortOrder: DbHydrationSortOrder,
): DbHydrationArticle[] {
  if (!Array.isArray(payload)) {
    throw new Error("Expected the backend batch payload to be an array.");
  }

  return payload
    .flatMap((feedResult): DbHydrationArticleWithDate[] => {
      if (!isRecord(feedResult) || !Array.isArray(feedResult.articles)) {
        return [];
      }

      return feedResult.articles.map((article) => {
        if (!isRecord(article)) {
          throw new Error("Expected every backend article to be an object.");
        }

        return toBackendHydrationArticle(article);
      });
    })
    .sort((left, right) =>
      compareBackendHydrationArticles(left, right, sortOrder),
    )
    .slice(0, DASHBOARD_DB_HYDRATION_WINDOW_SIZE)
    .map(({ publicationDate: _publicationDate, ...article }) => article);
}

/**
 * Requests the exact 50-row article window through the browser session so the
 * route runs with the same cookies and origin as the dashboard.
 * @param page - Active Playwright page.
 * @param feedUrls - Enabled feed URLs from the separate DB pull.
 * @param sortOrder - Chronological backend order under test.
 * @returns The raw batch payload returned by the real backend route.
 */
async function fetchBackendHydrationPayload(
  page: Page,
  feedUrls: string[],
  sortOrder: DbHydrationSortOrder,
): Promise<unknown> {
  const response = await page.evaluate(
    async ({ articleLimit, articleSortOrder, urls }) => {
      const backendResponse = await fetch("/api/feeds/batch", {
        body: JSON.stringify({
          articleFilter: "all",
          articleLimit,
          articleSortOrder,
          requestSource: "dashboard-db-hydration-e2e",
          skipRefresh: true,
          urls,
        }),
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      return {
        ok: backendResponse.ok,
        payload: await backendResponse.json(),
        status: backendResponse.status,
        statusText: backendResponse.statusText,
      };
    },
    {
      articleLimit: DASHBOARD_DB_HYDRATION_WINDOW_SIZE,
      articleSortOrder: sortOrder,
      urls: feedUrls,
    },
  );

  expect(
    response.ok,
    `Expected browser-context /api/feeds/batch to return the 50-row ${sortOrder} window, received ${response.status} ${response.statusText}`,
  ).toBe(true);

  return response.payload;
}

/**
 * Narrows unknown JSON into a plain object with string keys.
 * @param value - Unknown value from Playwright request parsing.
 * @returns Whether the value can be inspected as a request body object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns whether a batch response belongs to the exact hydration request this
 * regression covers rather than a background prefetch for a larger window.
 * @param response - Playwright network response to inspect.
 * @param sortOrder - Chronological dashboard order under test.
 * @returns Whether the response is the target first-page hydration request.
 */
/**
 * Reads every DB article available to the authenticated dashboard, then slices
 * the requested 50-row edge window after verifying the corpus is large enough.
 * @param sortOrder - Chronological DB order under test.
 * @returns The expected dashboard article window and the enabled feed URLs used by the backend request.
 */
async function readExpectedDbHydrationWindow(
  sortOrder: DbHydrationSortOrder,
): Promise<DbHydrationWindow> {
  const credentials = getDashboardLoginCredentials();
  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, credentials.email))
    .limit(1);

  if (!user) {
    throw new Error(
      "Expected the dashboard e2e user to exist in the database.",
    );
  }

  const orderBy =
    sortOrder === "oldest"
      ? [asc(articles.publicationDate), asc(articles.id)]
      : [desc(articles.publicationDate), desc(articles.id)];
  const completeArticles = await db
    .select({
      id: articles.id,
      isRead: articleStatuses.isRead,
      isStarred: articleStatuses.isStarred,
      link: articles.link,
      title: articles.title,
      url: feeds.url,
    })
    .from(articles)
    .innerJoin(feeds, eq(articles.feedId, feeds.id))
    .innerJoin(
      feedSources,
      and(
        eq(feedSources.url, feeds.url),
        eq(feedSources.userId, user.id),
        eq(feedSources.enabled, true),
      ),
    )
    .leftJoin(
      articleStatuses,
      and(
        eq(articleStatuses.articleId, articles.id),
        eq(articleStatuses.userId, user.id),
      ),
    )
    .orderBy(...orderBy);

  expect(
    completeArticles.length,
    "Expected the DB-backed dashboard corpus to contain at least 50 articles.",
  ).toBeGreaterThanOrEqual(DASHBOARD_DB_HYDRATION_WINDOW_SIZE);

  return {
    articles: completeArticles
      .slice(0, DASHBOARD_DB_HYDRATION_WINDOW_SIZE)
      .map((article) => ({
        id: article.id,
        isRead: article.isRead ?? false,
        isStarred: article.isStarred ?? false,
        link: article.link,
        title: article.title,
      })),
    feedUrls: Array.from(
      new Set(completeArticles.map((article) => article.url)),
    ),
  };
}

/**
 * Reads mounted virtualized article cards with their logical feed indexes.
 * @param page - Active Playwright page.
 * @returns Mounted article cards from the active feed surface.
 */
async function readMountedHydrationArticles(
  page: Page,
): Promise<DomHydrationArticle[]> {
  return await page.evaluate(() => {
    const feedSurface = Array.from(
      document.querySelectorAll<HTMLElement>("[data-feed-surface-mode]"),
    ).find((candidate) => {
      const rect = candidate.getBoundingClientRect();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        window.getComputedStyle(candidate).visibility !== "hidden" &&
        candidate.querySelector("article[data-article-key]") !== null
      );
    });

    if (!feedSurface) {
      throw new Error("Expected the active feed surface to contain articles.");
    }

    return Array.from(feedSurface.querySelectorAll<HTMLElement>("[data-index]"))
      .map((row) => {
        const article = row.querySelector<HTMLElement>(
          "article[data-article-key]",
        );
        const title = article?.querySelector("h3")?.textContent?.trim() ?? "";
        const index = Number.parseInt(row.dataset.index ?? "", 10);

        return article && Number.isFinite(index)
          ? {
              articleKey: article.dataset.articleKey ?? "",
              index,
              title,
            }
          : null;
      })
      .filter((article): article is DomHydrationArticle => article !== null);
  });
}

/**
 * Configures persisted dashboard preferences, reloads the live authenticated
 * dashboard, and pages forward until the first 50 all-feeds articles hydrate.
 * @param page - Active Playwright page.
 * @param sortOrder - Chronological dashboard order under test.
 */
async function renderDashboardHydrationWindow(
  page: Page,
  sortOrder: DbHydrationSortOrder,
  backendPayload: unknown,
) {
  await page.route("**/api/feeds/batch", async (route) => {
    await route.fulfill({
      body: JSON.stringify(backendPayload),
      contentType: "application/json",
      status: 200,
    });
  });

  await seedHydrationWindowPreferences(page, sortOrder);

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect
    .poll(async () => readVisibleFeedArticleCount(page), { timeout: 15_000 })
    .toBe(DASHBOARD_DB_HYDRATION_WINDOW_SIZE);
  await expect(
    page.locator('[data-article-hydration-state="loading"]'),
  ).toHaveCount(0);
  await setFeedViewportScrollTop(page, 0);
}

/**
 * Stores the exact dashboard preferences needed for an all-feeds DB hydration
 * request before reloading the app shell.
 * @param page - Active Playwright page.
 * @param sortOrder - Chronological dashboard order under test.
 */
async function seedHydrationWindowPreferences(
  page: Page,
  sortOrder: DbHydrationSortOrder,
) {
  await page.evaluate(
    ({ keys, sortOrder: nextSortOrder, values, windowSize }) => {
      window.localStorage.setItem(
        keys.selectedCategory,
        JSON.stringify(values.allFeedsNodeKey),
      );
      window.localStorage.setItem(keys.articleFilter, JSON.stringify("all"));
      window.localStorage.setItem(
        keys.articleSortOrder,
        JSON.stringify(nextSortOrder),
      );
      window.localStorage.setItem(
        keys.articlesPerPage,
        JSON.stringify(windowSize),
      );
    },
    {
      keys: {
        articleFilter: DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
        articleSortOrder: DASHBOARD_ARTICLE_SORT_ORDER_STORAGE_KEY,
        articlesPerPage: DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
        selectedCategory: DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
      },
      sortOrder,
      values: { allFeedsNodeKey: ALL_FEEDS_NODE_KEY },
      windowSize: DASHBOARD_DB_HYDRATION_WINDOW_SIZE,
    },
  );
}

/**
 * Converts backend article JSON into the narrow comparison shape.
 * @param article - Backend article object.
 * @returns Normalized article comparison fields.
 */
function toBackendHydrationArticle(
  article: Record<string, unknown>,
): DbHydrationArticleWithDate {
  const id = article.id;
  const link = article.link;
  const publicationDate = article.publicationDate;
  const title = article.title;

  if (
    typeof id !== "number" ||
    typeof link !== "string" ||
    typeof publicationDate !== "string" ||
    typeof title !== "string"
  ) {
    throw new Error(
      "Expected backend article id, link, publicationDate, and title fields.",
    );
  }

  return {
    id,
    isRead: article.isRead === true,
    isStarred: article.isStarred === true,
    link,
    publicationDate,
    title,
  };
}
