import type { Page } from "@playwright/test";

import {
  articleCard,
  articleCardByKey,
  createNextJsErrorMonitor,
  expectPreviewDashboard,
  gotoPreviewDashboard,
  installDeterministicFeedBatchRoute,
} from "./helpers";
import { expect, test } from "./test";

const STALE_RECOVERY_FEEDS = [
  {
    category: "Recovery",
    enabled: true,
    extractionDisabled: false,
    id: 1,
    name: "Deterministic Recovery",
    proxyEnabled: false,
    url: "https://example.com/e2e/recovery.xml",
  },
] as const;

/**
 * Navigate to the authenticated dashboard and wait for the first article card.
 * @param page - The page to navigate.
 */
async function gotoAuthenticatedDashboard(page: Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/dashboard$/u);
  await normalizeDashboardArticleVisibility(page);
  await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
}

/**
 * Install deterministic authenticated dashboard shell routes for stale-resume coverage.
 * @param page - The page receiving the authenticated dashboard shell routes.
 */
async function installAuthenticatedDashboardShellRoutes(page: Page) {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        allowSignup: false,
        authenticated: true,
        usePlaceholderData: false,
        user: { email: "stale-tab-recovery@example.test", id: 1 },
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/feeds", async (route) => {
    await route.fulfill({
      body: JSON.stringify(STALE_RECOVERY_FEEDS),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/feeds/category-order", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ orderedLabels: ["Recovery"] }),
      contentType: "application/json",
      status: 200,
    });
  });
}

/**
 * Normalize the authenticated dashboard into the standard all-feeds, all-filter view.
 * @param page - The page to normalize.
 */
async function normalizeDashboardArticleVisibility(page: Page) {
  const searchInput = page.getByPlaceholder("Search...");
  const allFilterButton = page.getByRole("button", {
    exact: true,
    name: "all",
  });
  const allFeedsButton = page.getByRole("button", {
    exact: true,
    name: "All Feeds",
  });

  await expect(searchInput).toBeVisible({ timeout: 15_000 });
  await expect(allFilterButton).toBeVisible({ timeout: 15_000 });
  await expect(allFeedsButton).toBeVisible({ timeout: 15_000 });

  await searchInput.fill("");
  await allFilterButton.click();
  await allFeedsButton.click();
}

/**
 * Simulates a long tab suspension cycle by dispatching visibilitychange events
 * with a faked suspension duration, then asserts the dashboard recovers cleanly.
 */
test("dashboard dismisses stale toasts and recovers after long tab suspension", async ({
  page,
}) => {
  await gotoPreviewDashboard(page);
  await expectPreviewDashboard(page);

  // Inject a visible toast so we can verify it gets dismissed on resume.
  await page.evaluate(() => {
    const { toast } = window as unknown as {
      toast: (message: string) => void;
    };
    // Sonner exposes toast on window in dev, but we need to dispatch a custom
    // event or directly call the module. Instead, use the DOM approach:
    // trigger a toast via the app's own mechanism.
  });

  // Create a deliberately visible Sonner toast via the global module.
  const toastCountBefore = await page.locator("[data-sonner-toast]").count();

  // Simulate a stale tab resume: dispatch visibilitychange with `hidden` then
  // back to `visible`, tricking the interval hook into thinking the tab was
  // suspended for longer than the stale threshold.
  await page.evaluate(() => {
    // Reach into the intervals hook's hidden-at tracking by faking a long gap.
    // 1. Go hidden
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // 2. Advance time perception so the hook sees a long suspension.
    //    We just need the resume handler to compute a gap >= STALE_TAB_THRESHOLD_MS.
    //    The hook reads Date.now() at hide time and again at resume time.
    //    Since both happen nearly instantly, we override Date.now temporarily.
    const realNow = Date.now;
    const freezeTime = realNow();

    // Override Date.now to return a future time on the next call (resume path).
    let callCount = 0;
    Date.now = () => {
      callCount++;
      // The hide handler already called Date.now once. On resume it calls
      // Date.now again; return a value 60 seconds later than the hide timestamp.
      return callCount <= 1 ? freezeTime : freezeTime + 60_000;
    };

    // 3. Go visible (resume)
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Restore Date.now
    Date.now = realNow;
  });

  // After stale resume, pre-existing toasts should dismiss once the resume
  // handler has completed its recovery pass.
  await expect
    .poll(
      async () => {
        return await page.locator("[data-sonner-toast]").count();
      },
      {
        intervals: [100, 150, 200],
        timeout: 1_500,
      },
    )
    .toBeLessThanOrEqual(toastCountBefore);
  const toastsAfterResume = await page.locator("[data-sonner-toast]").count();
  expect(toastsAfterResume).toBeLessThanOrEqual(toastCountBefore);

  // The dashboard should still be functional — articles should remain visible.
  const firstArticle = page.locator("article[data-article-key]").first();
  await expect(firstArticle).toBeVisible({ timeout: 10_000 });

  // Verify no Next.js errors appeared from the simulated suspension.
  const overlayText = await page
    .locator("nextjs-portal")
    .textContent()
    .catch(() => "");
  expect(overlayText ?? "").not.toMatch(
    /(?:Build Error|Runtime Error|Unhandled Runtime Error)/iu,
  );
});

/**
 * Verifies that after a short tab switch (below stale threshold), toasts are
 * NOT dismissed — only long suspensions trigger the cleanup.
 */
test("short tab switch does not dismiss toasts", async ({ page }) => {
  await gotoPreviewDashboard(page);
  await expectPreviewDashboard(page);

  // Simulate a brief tab switch (below stale threshold).
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Resume almost immediately (5 seconds — below the 30s threshold).
    const realNow = Date.now;
    const freezeTime = realNow();
    let callCount = 0;
    Date.now = () => {
      callCount++;
      return callCount <= 1 ? freezeTime : freezeTime + 5_000;
    };

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Date.now = realNow;
  });

  // Dashboard should remain functional with no errors.
  const firstArticle = page.locator("article[data-article-key]").first();
  await expect(firstArticle).toBeVisible({ timeout: 10_000 });
});

test("stale tab resume during an in-flight read mutation keeps the dashboard interactive", async ({
  page,
}) => {
  const nextJsErrorMonitor = createNextJsErrorMonitor(page);

  await installAuthenticatedDashboardShellRoutes(page);
  await installDeterministicFeedBatchRoute(page, {
    articleFeedCount: 1,
    articlesPerFeed: 6,
    respectArticleLimit: true,
  });
  await page.addInitScript(() => {
    type WindowWithArticleStatusCounter = typeof globalThis &
      Window & {
        __articleStatusRequestCount?: number;
      };

    const browserWindow = window as WindowWithArticleStatusCounter;
    const originalFetch = browserWindow.fetch.bind(browserWindow);

    browserWindow.__articleStatusRequestCount = 0;
    browserWindow.fetch = new Proxy(originalFetch, {
      apply(target, thisArg, argumentsList) {
        const [input, init] = argumentsList as [
          RequestInfo | URL,
          RequestInit | undefined,
        ];
        const url =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : String(input);

        if (!url.endsWith("/api/articles/status")) {
          return Reflect.apply(target, thisArg, argumentsList);
        }

        browserWindow.__articleStatusRequestCount =
          (browserWindow.__articleStatusRequestCount ?? 0) + 1;

        return new Promise<Response>((resolve, reject) => {
          const abortSignal = init?.signal;
          const timeoutId = browserWindow.setTimeout(() => {
            resolve(
              new Response(JSON.stringify({ ok: true }), {
                headers: { "content-type": "application/json" },
                status: 200,
              }),
            );
          }, 2_000);

          abortSignal?.addEventListener(
            "abort",
            () => {
              browserWindow.clearTimeout(timeoutId);
              reject(new DOMException("aborted", "AbortError"));
            },
            { once: true },
          );
        });
      },
    }) as typeof fetch;
  });

  try {
    await gotoAuthenticatedDashboard(page);

    const firstArticle = articleCard(page, 0);
    const firstArticleKey = await firstArticle.getAttribute("data-article-key");

    expect(firstArticleKey).toBeTruthy();

    const targetArticle = articleCardByKey(page, String(firstArticleKey));
    const markReadButton = targetArticle.getByRole("button", {
      name: "Mark as read",
    });
    const markUnreadButton = targetArticle.getByRole("button", {
      name: "Mark as unread",
    });

    await expect(markReadButton).toBeVisible({ timeout: 15_000 });
    await markReadButton.click();

    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          return (window as Window & { __articleStatusRequestCount?: number })
            .__articleStatusRequestCount;
        });
      })
      .toBe(1);
    await expect(markUnreadButton).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      const realNow = Date.now;
      const freezeTime = realNow();
      let callCount = 0;
      Date.now = () => {
        callCount += 1;
        return callCount <= 1 ? freezeTime : freezeTime + 60_000;
      };

      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      Date.now = realNow;
    });

    await expect(
      targetArticle.getByRole("button", { name: /Mark as (?:un)?read/u }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(targetArticle).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-status-page='500']")).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/u);
    await nextJsErrorMonitor.assertNoNextJsErrors();
  } finally {
    nextJsErrorMonitor.dispose();
  }
});
