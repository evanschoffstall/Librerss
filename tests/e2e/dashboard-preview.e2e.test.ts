import { PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources";

import {
  enterPreviewFromLogin,
  gotoPreviewDashboard,
  locateViewportArticle,
  openDashboardSettings,
  openDashboardSettingsTab,
  readArticleKey,
  readFeedViewportMetrics,
  setFeedViewportScrollTop,
} from "./helpers";
import { expect, test } from "./test";

/**
 * Selects a feed source button while preserving the test's fallback path for
 * suite-load flakes where Playwright finishes the pointer action as the source
 * list rerenders.
 */
async function clickPreviewSourceButton(
  button: ReturnType<typeof previewFeedButton>,
) {
  await expect(button).toBeVisible({ timeout: 15_000 });

  try {
    await button.click();
    return;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Timeout")) {
      throw error;
    }
  }

  await button.evaluate((buttonElement) => {
    if (!(buttonElement instanceof HTMLElement)) {
      throw new Error("Expected preview source button element.");
    }

    buttonElement.click();
  });
}

function createPreviewSearchTerm(title: string) {
  const candidate = title
    .split(/[^A-Za-z0-9]+/u)
    .map((token) => token.trim())
    .find((token) => token.length >= 5);

  if (!candidate) {
    throw new Error(
      "Expected the preview article title to include a searchable token.",
    );
  }

  return candidate;
}

async function measureVisibleToolbarButton(
  page: Parameters<typeof gotoPreviewDashboard>[0],
  label: string,
) {
  const button = page.locator(`button[aria-label="${label}"]:visible`).first();
  await expect(button).toBeVisible({ timeout: 15_000 });
  const box = await button.boundingBox();

  if (!box) {
    throw new Error(
      `Expected ${label} to resolve to a visible toolbar button.`,
    );
  }

  return { height: box.height, width: box.width };
}

async function openPreviewFeeds(
  page: Parameters<typeof gotoPreviewDashboard>[0],
) {
  const openFeedsButton = page.getByRole("button", { name: "Open feeds" });
  if (await openFeedsButton.isVisible()) {
    await openFeedsButton.click();
  }
}

function previewFeedButton(
  page: Parameters<typeof gotoPreviewDashboard>[0],
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

/**
 * Switches into the aggregate placeholder source even when a prior persisted
 * preview source already left that source selected for this browser context.
 */
async function selectPreviewSource(
  page: Parameters<typeof gotoPreviewDashboard>[0],
) {
  const openFeedsButton = page.getByRole("button", { name: "Open feeds" });
  if (await openFeedsButton.isVisible()) {
    await openFeedsButton.click();
  }

  const dashboardHeading = page.getByRole("heading", { level: 1 });
  const placeholderFeedsButton = page.getByRole("button", {
    name: "Placeholder Feeds",
  });

  if ((await dashboardHeading.textContent())?.includes("Placeholder Feeds")) {
    await clickPreviewSourceButton(
      page.getByRole("button", { exact: true, name: "All Feeds" }),
    );
    await expect(dashboardHeading).toContainText("All Feeds", {
      timeout: 15_000,
    });
  }

  await clickPreviewSourceButton(placeholderFeedsButton);
  await expect(dashboardHeading).toContainText("Placeholder Feeds", {
    timeout: 15_000,
  });
}

test.describe("dashboard preview mode", () => {
  test("keeps preview articles mounted during a scheduled auto refresh", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const nativeSetInterval = window.setInterval.bind(window);
      let dashboardAutoRefreshCallback: (() => void) | undefined;

      window.setInterval = ((handler: TimerHandler, timeout?: number) => {
        if (timeout === 1_800_000 && typeof handler === "function") {
          dashboardAutoRefreshCallback = handler as () => void;
        }

        return nativeSetInterval(handler, timeout);
      }) as typeof window.setInterval;

      Object.defineProperty(window, "__runDashboardAutoRefreshInterval", {
        configurable: true,
        value: () => {
          dashboardAutoRefreshCallback?.();
        },
      });
    });

    await gotoPreviewDashboard(page);
    const firstArticle = await locateViewportArticle(page, 0);
    const firstArticleKey = await readArticleKey(firstArticle);

    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __runDashboardAutoRefreshInterval?: () => void;
      };

      testWindow.__runDashboardAutoRefreshInterval?.();
    });

    await expect(
      page.locator("article[data-article-key]:visible"),
    ).not.toHaveCount(0);
    await expect(
      page.locator(`article[data-article-key="${firstArticleKey}"]`),
    ).toBeVisible();
  });

  test("keeps preview articles mounted during a resume-triggered auto refresh", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const nativeDateNow = Date.now.bind(Date);
      const nativeSetTimeout = window.setTimeout.bind(window);
      let currentNow = nativeDateNow();
      let dashboardResumeRefreshCallback: (() => void) | undefined;

      Date.now = () => currentNow;
      window.setTimeout = ((
        handler: TimerHandler,
        timeout?: number,
        ...args: unknown[]
      ) => {
        const timerId = nativeSetTimeout(handler, timeout, ...args);

        if (
          (timeout === 1_500 || timeout === 4_000) &&
          typeof handler === "function"
        ) {
          dashboardResumeRefreshCallback = () => {
            handler(...args);
          };
        }

        return timerId;
      }) as typeof window.setTimeout;

      Object.defineProperties(window, {
        __advanceDashboardNow: {
          configurable: true,
          value: (durationMs: number) => {
            currentNow += durationMs;
          },
        },
        __hasDashboardResumeRefresh: {
          configurable: true,
          value: () => dashboardResumeRefreshCallback !== undefined,
        },
        __runDashboardResumeRefresh: {
          configurable: true,
          value: () => {
            dashboardResumeRefreshCallback?.();
          },
        },
      });
    });

    await gotoPreviewDashboard(page);
    const firstArticle = await locateViewportArticle(page, 0);
    const firstArticleKey = await readArticleKey(firstArticle);

    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __advanceDashboardNow?: (durationMs: number) => void;
      };

      testWindow.__advanceDashboardNow?.(1_000);
      document.dispatchEvent(new Event("freeze"));
      testWindow.__advanceDashboardNow?.(1_800_000);
      window.dispatchEvent(new Event("pageshow"));
    });

    await expect
      .poll(() =>
        page.evaluate(() => {
          const testWindow = window as typeof window & {
            __hasDashboardResumeRefresh?: () => boolean;
          };

          return testWindow.__hasDashboardResumeRefresh?.() ?? false;
        }),
      )
      .toBe(true);

    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __runDashboardResumeRefresh?: () => void;
      };

      testWindow.__runDashboardResumeRefresh?.();
    });

    await expect(
      page.locator("article[data-article-key]:visible"),
    ).not.toHaveCount(0);
    await expect(
      page.locator(`article[data-article-key="${firstArticleKey}"]`),
    ).toBeVisible();
  });

  test("unlocks refresh controls when a suspended refresh never sends an end event", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      let shouldCaptureNextRefreshTimer = false;
      let dashboardRefreshFailsafeCallback: (() => void) | undefined;

      window.setTimeout = ((
        handler: TimerHandler,
        timeout?: number,
        ...args: unknown[]
      ) => {
        const timerId = nativeSetTimeout(handler, timeout, ...args);

        if (shouldCaptureNextRefreshTimer && typeof handler === "function") {
          shouldCaptureNextRefreshTimer = false;
          dashboardRefreshFailsafeCallback = () => {
            handler(...args);
          };
        }

        return timerId;
      }) as typeof window.setTimeout;

      Object.defineProperties(window, {
        __captureNextDashboardRefreshTimer: {
          configurable: true,
          value: () => {
            dashboardRefreshFailsafeCallback = undefined;
            shouldCaptureNextRefreshTimer = true;
          },
        },
        __hasDashboardRefreshFailsafe: {
          configurable: true,
          value: () => dashboardRefreshFailsafeCallback !== undefined,
        },
        __runDashboardRefreshFailsafe: {
          configurable: true,
          value: () => {
            dashboardRefreshFailsafeCallback?.();
          },
        },
      });
    });

    await gotoPreviewDashboard(page);
    const refreshButton = page
      .locator('button[aria-label="Refresh selected feed"]:visible')
      .first();
    await expect(refreshButton).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __captureNextDashboardRefreshTimer?: () => void;
      };

      testWindow.__captureNextDashboardRefreshTimer?.();
      window.dispatchEvent(new CustomEvent("dashboard:refresh-start"));
    });

    await expect(refreshButton.locator(".animate-pulse")).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const testWindow = window as typeof window & {
            __hasDashboardRefreshFailsafe?: () => boolean;
          };

          return testWindow.__hasDashboardRefreshFailsafe?.() ?? false;
        }),
      )
      .toBe(true);

    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __runDashboardRefreshFailsafe?: () => void;
      };

      testWindow.__runDashboardRefreshFailsafe?.();
    });

    await expect(refreshButton.locator(".animate-pulse")).toHaveCount(0);
  });

  test("opens the mobile actions popup from the three-dots toolbar button", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 820, width: 390 });
    await gotoPreviewDashboard(page);

    const actionsTrigger = page.getByRole("button", {
      name: "Open actions menu",
    });
    await expect(actionsTrigger).toBeVisible({ timeout: 15_000 });

    await actionsTrigger.click();

    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("keeps mobile toolbar button footprints aligned with the desktop uncondensed buttons", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1280 });
    await gotoPreviewDashboard(page);

    const desktopActionFootprint = await measureVisibleToolbarButton(
      page,
      "Refresh selected feed",
    );
    const desktopIconFootprint = await measureVisibleToolbarButton(
      page,
      "Open dashboard settings",
    );

    await page.setViewportSize({ height: 820, width: 390 });
    await gotoPreviewDashboard(page);

    expect(
      await measureVisibleToolbarButton(page, "Refresh selected feed"),
    ).toEqual(desktopActionFootprint);
    expect(
      await measureVisibleToolbarButton(
        page,
        "Mark fully visible articles as read",
      ),
    ).toEqual(desktopActionFootprint);
    expect(await measureVisibleToolbarButton(page, "Open feeds")).toEqual(
      desktopIconFootprint,
    );
    expect(
      await measureVisibleToolbarButton(page, "Open actions menu"),
    ).toEqual(desktopIconFootprint);
  });

  test("enters preview from the login view and signs out back to landing", async ({
    page,
  }) => {
    await enterPreviewFromLogin(page);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/landing$/);
    await expect(
      page.getByRole("link", { name: /Open Dashboard/i }),
    ).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByText("Sign in to LibreRSS")).toBeVisible();
  });

  test("supports safe local article interactions and filtering in preview", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    const firstArticle = await locateViewportArticle(page, 0);

    const firstTitle = (
      await firstArticle.getByRole("heading").first().textContent()
    )?.trim();
    if (!firstTitle) {
      throw new Error("Expected the first preview article to have a title.");
    }

    await page
      .getByPlaceholder("Search...")
      .fill(createPreviewSearchTerm(firstTitle));
    await expect(
      page.getByRole("heading", {
        name: firstTitle,
      }),
    ).toBeVisible();

    await page.getByPlaceholder("Search...").fill("");
    const restoredArticle = await locateViewportArticle(page, 0);
    await expect(restoredArticle).toContainText(firstTitle);
    await expect(restoredArticle).toBeVisible({ timeout: 15_000 });
    await restoredArticle.getByRole("button", { name: "Star article" }).click();
    await page.getByRole("button", { exact: true, name: "starred" }).click();
    const starredArticle = await locateViewportArticle(page, 0);
    await expect(starredArticle).toBeVisible({
      timeout: 15_000,
    });
    await expect(starredArticle).toContainText(firstTitle);

    await page.getByRole("button", { exact: true, name: "all" }).click();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(
      (await locateViewportArticle(page, 0)).getByRole("button", {
        name: "Mark as unread",
      }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "read" }).click();
    const readArticle = await locateViewportArticle(page, 0);
    await expect(readArticle).toBeVisible({
      timeout: 15_000,
    });
    await expect(readArticle).toContainText(firstTitle);
  });

  test("keeps the selected token and resets the viewport when switching preview sources", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);

    const allButton = page.getByRole("button", { exact: true, name: "all" });
    const unreadButton = page.getByRole("button", {
      exact: true,
      name: "unread",
    });

    await allButton.click();
    await expect(allButton).toHaveAttribute("aria-pressed", "true");

    const { clientHeight, scrollHeight } = await readFeedViewportMetrics(page);
    const targetScrollTop = Math.max(
      0,
      Math.min(900, scrollHeight - clientHeight - 24),
    );

    if (targetScrollTop > 0) {
      await setFeedViewportScrollTop(page, targetScrollTop);
    }

    await selectPreviewSource(page);
    await expect(await locateViewportArticle(page, 0)).toBeVisible({
      timeout: 15_000,
    });
    await expect(allButton).toHaveAttribute("aria-pressed", "true");
    await expect(unreadButton).toHaveAttribute("aria-pressed", "false");

    await unreadButton.click();
    await expect(await locateViewportArticle(page, 0)).toBeVisible({
      timeout: 15_000,
    });
    await expect(unreadButton).toHaveAttribute("aria-pressed", "true");
  });

  test("opens settings and shows demo safeguards in preview mode", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);

    await openDashboardSettings(page);
    await expect(page.getByLabel("Show favicons")).toBeVisible();
    await expect(page.getByLabel("Auto refresh")).toBeVisible();
    await openDashboardSettingsTab(page, "Feeds");
    await expect(page.getByText("Not available in demo mode")).toHaveCount(1);
  });

  test("shows the expanded placeholder feed catalog in preview mode", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await openPreviewFeeds(page);
    await selectPreviewSource(page);

    const sourceWithArticle = PLACEHOLDER_SOURCE_DEFINITIONS.find(
      (definition) => definition.seeds.length > 0,
    );

    if (!sourceWithArticle) {
      throw new Error(
        "Expected at least one placeholder source with articles.",
      );
    }

    const selectedSeed = sourceWithArticle.seeds[0];

    if (!selectedSeed) {
      throw new Error(
        "Expected selected placeholder source to include an article.",
      );
    }

    for (const definition of PLACEHOLDER_SOURCE_DEFINITIONS) {
      await expect(
        previewFeedButton(page, definition.source.name),
      ).toBeVisible();
    }

    const selectedFeedButton = previewFeedButton(
      page,
      sourceWithArticle.source.name,
    );
    await expect(selectedFeedButton).toBeVisible();
    await selectedFeedButton.evaluate((button) => {
      if (!(button instanceof HTMLElement)) {
        throw new Error("Expected a feed button element.");
      }

      button.click();
    });
    await expect(
      page.getByRole("heading", {
        name: selectedSeed.title,
      }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("page reload keeps the selected preview source aligned with visible results", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await openPreviewFeeds(page);

    const sourceWithArticle = PLACEHOLDER_SOURCE_DEFINITIONS.find(
      (definition) => definition.seeds.length > 0,
    );

    if (!sourceWithArticle) {
      throw new Error(
        "Expected at least one placeholder source with articles.",
      );
    }

    const selectedSeed = sourceWithArticle.seeds[0];

    if (!selectedSeed) {
      throw new Error(
        "Expected selected placeholder source to include an article.",
      );
    }

    const selectedFeedButton = previewFeedButton(
      page,
      sourceWithArticle.source.name,
    );
    await expect(selectedFeedButton).toBeVisible();
    await selectedFeedButton.evaluate((button) => {
      if (!(button instanceof HTMLElement)) {
        throw new Error("Expected a feed button element.");
      }

      button.click();
    });

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      sourceWithArticle.source.name,
    );
    await expect(
      page.getByRole("heading", {
        name: selectedSeed.title,
      }),
    ).toBeVisible({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      sourceWithArticle.source.name,
    );
    await expect(
      page.getByRole("heading", {
        name: selectedSeed.title,
      }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
