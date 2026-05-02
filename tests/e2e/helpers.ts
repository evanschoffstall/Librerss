import {
  type ConsoleMessage,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

const DASHBOARD_PREVIEW_COOKIE_NAME = "librerss_dashboard_preview";
const DASHBOARD_PREVIEW_STORAGE_KEY = "librerss:dashboardPreviewMode";
const KNOWN_NON_RUNTIME_CONSOLE_ERROR_PATTERNS = [
  /Cross-Origin-Opener-Policy header has been ignored/iu,
  /va\.vercel-scripts\.com\/v1\/script\.debug\.js/iu,
];
const NEXT_JS_CONSOLE_ERROR_PATTERN =
  /(?:Build Error|ChunkLoadError|Failed to compile|Runtime Error|Unhandled Runtime Error)/iu;
const NEXT_JS_OVERLAY_ERROR_PATTERN =
  /(?:Build Error|Runtime Error|Unhandled Runtime Error)/iu;
const PLAYWRIGHT_SENTINEL_STORAGE_KEY = "librerss:playwright-sentinel";
export interface NextJsErrorMonitor {
  assertNoNextJsErrors: () => Promise<void>;
  dispose: () => void;
}

interface DeterministicFeedBatchRouteOptions {
  articlesPerFeed?: number;
  failNextBatchRequestRef?: { current: boolean };
}

const DETERMINISTIC_PREVIEW_PARAGRAPH = [
  "Deterministic preview coverage keeps the feed surface stable under parallel Playwright load.",
  "Each mock article includes enough text to preserve the expected collapsed card height and pagination thresholds.",
  "This avoids accidental viewport auto-fill expansion caused by unrealistically short placeholder content.",
].join(" ");

interface NextJsErrorSignal {
  source: "console" | "overlay" | "pageerror";
  text: string;
}

/** Returns the indexed rendered article card within the explore feed. */
export function articleCard(page: Page, index: number): Locator {
  return page.locator("article[data-article-key]:visible").nth(index);
}

/** Returns the rendered article card matching a previously captured article key. */
export function articleCardByKey(page: Page, articleKey: string): Locator {
  return page.locator(
    `article[data-article-key="${escapeCssAttributeValue(articleKey)}"]:visible`,
  );
}

/** Returns the feed row wrapper that owns a given article card. */
export function articleRow(article: Locator): Locator {
  return article.locator("xpath=ancestor::*[@data-scroll-restore-key][1]");
}

/** Updates the reader setting that controls how many articles each page adds. */
export async function configureArticlesPerPage(page: Page, pageSize: number) {
  await openDashboardSettings(page);

  const settingsDialog = page.getByRole("dialog", { name: "Reader Settings" });
  const articlesPerPageCombobox = settingsDialog.getByRole("combobox").nth(1);

  await clickVisibleControl(articlesPerPageCombobox);
  await clickVisibleControl(
    page.getByRole("option", { exact: true, name: String(pageSize) }),
  );
  await expect(articlesPerPageCombobox).toContainText(String(pageSize));
  await page.keyboard.press("Escape");
  await expect(settingsDialog).not.toBeVisible();
}

/**
 * Captures actual Next.js build/runtime failures without failing on expected
 * local-development browser noise like HTTP COOP warnings.
 */
export function createNextJsErrorMonitor(page: Page): NextJsErrorMonitor {
  const runtimeSignals: NextJsErrorSignal[] = [];

  const handleConsoleMessage = (message: ConsoleMessage) => {
    if (!shouldCaptureNextJsConsoleError(message)) {
      return;
    }

    runtimeSignals.push({
      source: "console",
      text: normalizeRuntimeSignalText(message.text()),
    });
  };
  const handlePageError = (error: Error) => {
    runtimeSignals.push({
      source: "pageerror",
      text: normalizeRuntimeSignalText(error.stack ?? error.message),
    });
  };

  page.on("console", handleConsoleMessage);
  page.on("pageerror", handlePageError);

  return {
    async assertNoNextJsErrors() {
      const nextJsPortalText = await readNextJsPortalText(page);
      const collectedSignals = [...runtimeSignals];

      if (NEXT_JS_OVERLAY_ERROR_PATTERN.test(nextJsPortalText)) {
        collectedSignals.push({
          source: "overlay",
          text: nextJsPortalText,
        });
      }

      expect(
        collectedSignals,
        collectedSignals.length === 0
          ? undefined
          : collectedSignals
              .map((signal) => `[${signal.source}] ${signal.text}`)
              .join("\n\n"),
      ).toEqual([]);
    },
    dispose() {
      page.off("console", handleConsoleMessage);
      page.off("pageerror", handlePageError);
    },
  };
}

/** Opens the unauthenticated dashboard and enters preview mode through the UI. */
export async function enterPreviewFromLogin(page: Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Sign in to LibreRSS")).toBeVisible();
  await expect(
    page.getByText("Access your saved feeds and reading preferences."),
  ).toBeVisible();
  await page.waitForLoadState("load", { timeout: 15_000 });
  const exploreWithoutAccountButton = page.getByRole("button", {
    name: "Explore without an account",
  });
  await expect(exploreWithoutAccountButton).toBeEnabled();
  await clickVisibleControl(exploreWithoutAccountButton);

  await expectPreviewDashboard(page);
}

/** Waits for an article card to reach the expected expanded state. */
export async function expectArticleExpanded(
  article: Locator,
  expanded: boolean,
) {
  await expect(article).toHaveAttribute(
    "aria-expanded",
    expanded ? "true" : "false",
  );
}

/** Waits for the unauthenticated dashboard login shell to become visible. */
export async function expectDashboardLogin(page: Page) {
  await expect(page.getByText("Sign in to LibreRSS")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText("Access your saved feeds and reading preferences."),
  ).toBeVisible();
}

/**
 * Asserts a locator's bounding box fits entirely within a container's visible
 * bounds — both horizontally AND vertically. Catches clipping that
 * `toBeInViewport` and `toBeVisible` silently miss.
 */
export async function expectNotClipped(
  locator: Locator,
  container: Locator,
  label: string,
) {
  await expect(locator, `${label}: not visible`).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, `${label}: no bounding box`).not.toBeNull();

  const containerBox = await container.boundingBox();
  expect(
    containerBox,
    `${label}: container has no bounding box`,
  ).not.toBeNull();

  const b = box!;
  const c = containerBox!;

  expect(
    b.x >= c.x - 1,
    `${label}: clipped on LEFT (el.left=${b.x.toFixed(1)}, container.left=${c.x.toFixed(1)})`,
  ).toBe(true);
  expect(
    b.x + b.width <= c.x + c.width + 1,
    `${label}: clipped on RIGHT (el.right=${(b.x + b.width).toFixed(1)}, container.right=${(c.x + c.width).toFixed(1)})`,
  ).toBe(true);
  expect(
    b.y >= c.y - 1,
    `${label}: clipped on TOP (el.top=${b.y.toFixed(1)}, container.top=${c.y.toFixed(1)})`,
  ).toBe(true);
  expect(
    b.y + b.height <= c.y + c.height + 1,
    `${label}: clipped on BOTTOM (el.bottom=${(b.y + b.height).toFixed(1)}, container.bottom=${(c.y + c.height).toFixed(1)})`,
  ).toBe(true);
}

/** Waits for the preview dashboard shell to become interactive. */
export async function expectPreviewDashboard(page: Page) {
  await expect
    .poll(
      () => {
        const currentUrl = new URL(page.url());

        return currentUrl.pathname === "/dashboard"
          ? currentUrl.searchParams.get("explore")
          : "__non_dashboard_route__";
      },
      { timeout: 20_000 },
    )
    .toBe("1");
  await expect(firstArticleCard(page)).toBeVisible({ timeout: 15_000 });

  const viewportWidth =
    page.viewportSize()?.width ??
    (await page.evaluate(() => {
      return window.innerWidth;
    }));
  const isMobileViewport = viewportWidth < 768;

  const mobileFeedsButton = page.getByRole("button", {
    name: "Open feeds",
  });
  const mobileActionsMenuButton = page.getByRole("button", {
    name: "Open actions menu",
  });
  const desktopSettingsButton = page.getByRole("button", {
    name: "Open dashboard settings",
  });
  const signOutButton = page.getByRole("button", { name: "Sign out" });

  if (isMobileViewport) {
    await expect(mobileActionsMenuButton).toBeVisible({ timeout: 15_000 });
    await expect(mobileFeedsButton).toBeVisible({
      timeout: 15_000,
    });
    return;
  }

  await expect(desktopSettingsButton).toBeVisible({ timeout: 15_000 });
  await expect(signOutButton).toBeVisible({
    timeout: 15_000,
  });
}

/** Returns the first rendered article card in the feed list. */
export function firstArticleCard(page: Page): Locator {
  return articleCard(page, 0);
}

/** Opens the preview dashboard without waiting for the full document load event. */
export async function gotoPreviewDashboard(
  page: Page,
  path = "/dashboard?explore=1",
) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expectPreviewDashboard(page);
}

/** Returns whether the feed list is still rendering the load-more sentinel. */
export async function hasLoadMoreSentinel(page: Page) {
  return (
    (await page.locator("[data-feed-load-more-sentinel='true']").count()) > 0
  );
}

/**
 * Installs a deterministic article-extraction route for expanded-article tests.
 * @param page - The page receiving the route override.
 */
export async function installDeterministicArticleExtractRoute(page: Page) {
  await page.route("**/api/articles/extract", async (route) => {
    const requestBody = route.request().postDataJSON() as {
      url?: string;
    };
    const articleUrl =
      typeof requestBody.url === "string" ? requestBody.url : "";

    await route.fulfill({
      body: JSON.stringify({
        content: [
          "<article>",
          "<h1>Deterministic extract</h1>",
          `<p>Stable extracted content for ${articleUrl || "unknown article"}.</p>`,
          `<p>${DETERMINISTIC_PREVIEW_PARAGRAPH}</p>`,
          `<p>${DETERMINISTIC_PREVIEW_PARAGRAPH}</p>`,
          "</article>",
        ].join(""),
      }),
      contentType: "application/json",
      status: 200,
    });
  });
}

/**
 * Installs a deterministic feed-batch route so preview-mode article tests do
 * not depend on live extractor throughput.
 * @param page - The page receiving the route override.
 * @param options - Controls how many mock articles each feed returns and
 * whether the next batch request should fail.
 */
export async function installDeterministicFeedBatchRoute(
  page: Page,
  options: DeterministicFeedBatchRouteOptions = {},
) {
  await page.route("**/api/feeds/batch", async (route) => {
    if (options.failNextBatchRequestRef?.current) {
      options.failNextBatchRequestRef.current = false;
      await route.fulfill({
        body: JSON.stringify({ error: "Gateway Timeout" }),
        contentType: "application/json",
        status: 504,
      });
      return;
    }

    const requestBody = route.request().postDataJSON() as {
      urls?: string[];
    };
    const urls = Array.isArray(requestBody.urls) ? requestBody.urls : [];
    const articlesPerFeed = options.articlesPerFeed ?? 1;
    const payload = urls.map((url, feedIndex) => ({
      articles: Array.from({ length: articlesPerFeed }, (_, articleIndex) => {
        const articleNumber = feedIndex * articlesPerFeed + articleIndex + 1;

        return {
          content: [
            `<p><strong>Deterministic Article ${articleNumber}</strong></p>`,
            `<p>${DETERMINISTIC_PREVIEW_PARAGRAPH}</p>`,
            `<p>${DETERMINISTIC_PREVIEW_PARAGRAPH}</p>`,
            `<p>${DETERMINISTIC_PREVIEW_PARAGRAPH}</p>`,
          ].join(""),
          feedId: feedIndex + 1,
          feedUrl: url,
          hasFullContent: true,
          id: articleNumber,
          isRead: false,
          isStarred: false,
          lastChecked: `2026-03-13T10:${String(articleNumber % 60).padStart(2, "0")}:00.000Z`,
          link: `https://example.com/playwright/article-${articleNumber}`,
          publicationDate: `2026-03-13T09:${String(articleNumber % 60).padStart(2, "0")}:00.000Z`,
          title: `Deterministic Article ${articleNumber}`,
        };
      }),
      ok: true,
      url,
    }));

    await route.fulfill({
      body: JSON.stringify(payload),
      contentType: "application/json",
      status: 200,
    });
  });
}

/** Returns the rendered article currently occupying the requested viewport slot. */
export async function locateViewportArticle(page: Page, index: number) {
  const visibleArticles = page.locator("article[data-article-key]:visible");
  await expect(visibleArticles.nth(index)).toBeVisible({ timeout: 15_000 });
  const resolvedArticleKey = await visibleArticles
    .nth(index)
    .getAttribute("data-article-key");

  if (
    typeof resolvedArticleKey !== "string" ||
    resolvedArticleKey.length === 0
  ) {
    throw new Error(
      `Expected viewport article ${index} to resolve to a stable article key.`,
    );
  }

  return articleCardByKey(page, resolvedArticleKey);
}

/** Opens the mobile feeds sidebar and waits for the tray content to render. */
export async function openDashboardFeedsSidebar(page: Page) {
  const trayDialog = page.getByRole("dialog", { name: "Feeds" });
  if (await trayDialog.isVisible().catch(() => false)) {
    return;
  }

  await clickVisibleControl(page.getByRole("button", { name: "Open feeds" }));
  await expect(trayDialog).toBeVisible({ timeout: 15_000 });
}

/** Opens dashboard settings and waits for the modal content to render. */
export async function openDashboardSettings(page: Page) {
  const settingsHeading = page.getByRole("heading", {
    name: "Reader Settings",
  });
  if (await settingsHeading.isVisible().catch(() => false)) {
    return;
  }

  const mobileActionsMenuButton = page.getByRole("button", {
    name: "Open actions menu",
  });

  if (await mobileActionsMenuButton.isVisible().catch(() => false)) {
    await clickVisibleControl(mobileActionsMenuButton);
    await clickVisibleControl(page.getByRole("menuitem", { name: "Settings" }));
  } else {
    await clickVisibleControl(
      page.getByRole("button", { name: "Open dashboard settings" }),
    );
  }

  await expect(settingsHeading).toBeVisible({ timeout: 15_000 });
}

/** Selects a settings tab in the currently open settings surface. */
export async function openDashboardSettingsTab(page: Page, tabName: string) {
  await openDashboardSettings(page);
  await clickVisibleControl(
    page.getByRole("tab", { exact: true, name: tabName }),
  );
}

/** Reads the article key used by the feed row and card surfaces. */
export async function readArticleKey(article: Locator) {
  const articleKey = await article.getAttribute("data-article-key");
  if (!articleKey) {
    throw new Error("Expected article card to include a data-article-key.");
  }

  return articleKey;
}

/** Reads the sentinel values that exercise localStorage and sessionStorage cleanup. */
export async function readClientStateSentinel(page: Page) {
  return await page.evaluate((storageKey) => {
    return {
      localStorageValue: window.localStorage.getItem(storageKey),
      sessionStorageValue: window.sessionStorage.getItem(storageKey),
    };
  }, PLAYWRIGHT_SENTINEL_STORAGE_KEY);
}

/**
 * Reads article visibility inside the active feed viewport so pagination tests
 * can distinguish fully visible rows from the clipped overflow marker row.
 */
export async function readFeedArticleClipState(page: Page) {
  const viewport = await getActiveFeedViewport(page);

  return await viewport.evaluate((node) => {
    const viewportRect = node.getBoundingClientRect();
    const feedSurface =
      node.closest<HTMLElement>("[data-feed-surface-mode]") ??
      node.querySelector<HTMLElement>("[data-feed-surface-mode]") ??
      node;
    const articles = Array.from(
      feedSurface.querySelectorAll<HTMLElement>("article[data-article-key]"),
    ).map((articleElement) => {
      const articleRect = articleElement.getBoundingClientRect();
      const intersectsViewport =
        articleRect.bottom > viewportRect.top &&
        articleRect.top < viewportRect.bottom;
      const fullyVisible =
        articleRect.top >= viewportRect.top &&
        articleRect.bottom <= viewportRect.bottom;

      return {
        articleKey: articleElement.dataset.articleKey ?? null,
        fullyVisible,
        partiallyVisible: intersectsViewport && !fullyVisible,
      };
    });

    return {
      fullyVisibleCount: articles.filter((article) => article.fullyVisible)
        .length,
      mountedCount: articles.length,
      partiallyVisibleCount: articles.filter(
        (article) => article.partiallyVisible,
      ).length,
    };
  });
}

/** Reads the active feed viewport metrics used by expand and scroll-restore flows. */
export async function readFeedViewportMetrics(page: Page) {
  const viewport = await getActiveFeedViewport(page);

  return await viewport.evaluate((node) => {
    return {
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    };
  });
}

/** Reads whether the active feed surface is currently rendering load-more skeletons. */
export async function readLoadMoreSkeletonState(page: Page) {
  return await page.evaluate(() => {
    const viewportSelectors = [
      '[data-feed-scroll-viewport="true"]',
      "[data-radix-scroll-area-viewport]",
      "[data-feed-surface-mode]",
      "[data-feed-virtualizer]",
    ] as const;

    for (const selector of viewportSelectors) {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      );

      for (const candidate of candidates) {
        const rect = candidate.getBoundingClientRect();

        if (
          candidate.querySelector("article[data-article-key]") === null ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          window.getComputedStyle(candidate).visibility === "hidden"
        ) {
          continue;
        }

        const feedSurface =
          candidate.closest<HTMLElement>("[data-feed-surface-mode]") ??
          candidate.querySelector<HTMLElement>("[data-feed-surface-mode]");
        if (feedSurface === null) {
          continue;
        }

        const skeletonCount = Number.parseInt(
          feedSurface.dataset.feedLoadMoreSkeletonCount ?? "0",
          10,
        );

        return {
          skeletonCount: Number.isFinite(skeletonCount) ? skeletonCount : 0,
          skeletonsVisible:
            feedSurface.dataset.feedLoadMoreSkeletonsVisible === "true",
        };
      }
    }

    throw new Error(
      "Expected the active feed surface to expose its skeleton state.",
    );
  });
}

/** Reads the number of mounted article cards in the active feed DOM. */
export async function readMountedFeedArticleCount(page: Page) {
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

    return (feedSurface ?? document).querySelectorAll(
      "article[data-article-key]",
    ).length;
  });
}

/** Returns the current preview cookie and localStorage persistence values. */
export async function readPreviewPersistence(page: Page) {
  const previewCookieValue =
    (await page.context().cookies()).find(
      (cookie) => cookie.name === DASHBOARD_PREVIEW_COOKIE_NAME,
    )?.value ?? null;
  const previewStorageValue = await page.evaluate((storageKey) => {
    return window.localStorage.getItem(storageKey);
  }, DASHBOARD_PREVIEW_STORAGE_KEY);

  return {
    previewCookieValue,
    previewStorageValue,
  };
}

/** Reads the current number of rendered article cards in the active feed. */
export async function readRenderedArticleCount(page: Page) {
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

    const visibleCount = Number.parseInt(
      feedSurface?.dataset.feedVisibleArticleCount ?? "",
      10,
    );

    if (Number.isFinite(visibleCount)) {
      return visibleCount;
    }

    return document.querySelectorAll("article[data-article-key]").length;
  });
}

/** Reads the currently visible virtualized item window for the active feed. */
export async function readRenderedItemWindow(page: Page) {
  const viewport = await getActiveFeedViewport(page);

  return await viewport.evaluate((node) => {
    const feedSurface =
      node.closest<HTMLElement>("[data-feed-surface-mode]") ??
      node.querySelector<HTMLElement>("[data-feed-surface-mode]");
    const visibleCount = Number.parseInt(
      feedSurface?.dataset.feedVisibleArticleCount ?? "",
      10,
    );
    const indexRoot = feedSurface ?? node;
    const indexes = Array.from(
      indexRoot.querySelectorAll<HTMLElement>("[data-index]"),
    )
      .map((candidate) => Number.parseInt(candidate.dataset.index ?? "", 10))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);
    const logicalIndexes = Number.isFinite(visibleCount)
      ? indexes.slice(0, visibleCount)
      : indexes;

    return {
      count: logicalIndexes.length,
      maxIndex:
        logicalIndexes.length > 0
          ? logicalIndexes[logicalIndexes.length - 1]
          : null,
      minIndex: logicalIndexes.length > 0 ? logicalIndexes[0] : null,
    };
  });
}

/** Reads the active mobile feeds tray viewport metrics and confirms the tray owns scrolling. */
export async function readSidebarTrayViewportMetrics(page: Page) {
  const trayDialog = page.getByRole("dialog", { name: "Feeds" });
  await expect(trayDialog).toBeVisible();

  return await trayDialog.evaluate((dialog) => {
    const viewport = dialog.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    if (!viewport) {
      throw new Error(
        "Expected the mobile feeds tray to render a Radix viewport.",
      );
    }

    return {
      clientHeight: viewport.clientHeight,
      dialogScrollTop: dialog.scrollTop,
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
      windowScrollY: window.scrollY,
    };
  });
}

/** Reads the first visible feed article plus its top offset inside the viewport. */
export async function readTopVisibleFeedArticle(
  page: Page,
  minimumOffsetTop = 0,
) {
  const viewport = await getActiveFeedViewport(page);

  return await viewport.evaluate((node, minimumVisibleOffsetTop) => {
    const viewportRect = node.getBoundingClientRect();
    const articles = Array.from(
      node.querySelectorAll<HTMLElement>("article[data-article-key]"),
    )
      .map((article) => {
        const rect = article.getBoundingClientRect();

        return {
          articleKey: article.dataset.articleKey ?? null,
          offsetTop: rect.top - viewportRect.top,
          visible:
            rect.bottom > viewportRect.top && rect.top < viewportRect.bottom,
        };
      })
      .filter((article) => article.visible)
      .sort((left, right) => left.offsetTop - right.offsetTop);

    return (
      articles.find(
        (article) => article.offsetTop >= minimumVisibleOffsetTop,
      ) ??
      articles[0] ??
      null
    );
  }, minimumOffsetTop);
}

/** Reads the active feed surface's visible article-window size. */
export async function readVisibleFeedArticleCount(page: Page) {
  return await page.evaluate(() => {
    const viewportSelectors = [
      '[data-feed-scroll-viewport="true"]',
      "[data-radix-scroll-area-viewport]",
      "[data-feed-surface-mode]",
      "[data-feed-virtualizer]",
    ] as const;

    for (const selector of viewportSelectors) {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      );

      for (const candidate of candidates) {
        const rect = candidate.getBoundingClientRect();

        if (
          candidate.querySelector("article[data-article-key]") === null ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          window.getComputedStyle(candidate).visibility === "hidden"
        ) {
          continue;
        }

        const feedSurface =
          candidate.closest<HTMLElement>("[data-feed-surface-mode]") ??
          candidate.querySelector<HTMLElement>("[data-feed-surface-mode]");
        if (feedSurface !== null) {
          const visibleArticleCount = Number.parseInt(
            feedSurface.dataset.feedVisibleArticleCount ?? "",
            10,
          );

          if (Number.isFinite(visibleArticleCount)) {
            return visibleArticleCount;
          }
        }

        return candidate.querySelectorAll("article[data-article-key]").length;
      }
    }

    return document.querySelectorAll("article[data-article-key]").length;
  });
}

/** Scrolls the active feed viewport to its current bottom edge. */
export async function scrollFeedViewportToBottom(page: Page) {
  const viewport = await getActiveFeedViewport(page);

  await viewport.evaluate((node) => {
    const nextScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);

    if (typeof node.scrollTo === "function") {
      node.scrollTo({ behavior: "auto", top: nextScrollTop });
    }

    if (Math.abs(node.scrollTop - nextScrollTop) > 1) {
      node.scrollTop = nextScrollTop;
    }

    node.dispatchEvent(new Event("scroll"));
  });
}

/** Scrolls the active feed viewport to its current top edge. */
export async function scrollFeedViewportToTop(page: Page) {
  const viewport = await getActiveFeedViewport(page);

  await viewport.evaluate((node) => {
    if (typeof node.scrollTo === "function") {
      node.scrollTo({ behavior: "auto", top: 0 });
    }

    if (Math.abs(node.scrollTop) > 1) {
      node.scrollTop = 0;
    }

    node.dispatchEvent(new Event("scroll"));
  });
}

/** Seeds origin-scoped web storage so reset and sign-out cleanup can be verified. */
export async function seedClientStateSentinel(page: Page, value = "present") {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.evaluate(
        ({ storageKey, storageValue }) => {
          window.localStorage.setItem(storageKey, storageValue);
          window.sessionStorage.setItem(storageKey, storageValue);
        },
        {
          storageKey: PLAYWRIGHT_SENTINEL_STORAGE_KEY,
          storageValue: value,
        },
      );
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Execution context was destroyed") ||
        attempt === 1
      ) {
        throw error;
      }

      await page.waitForLoadState("domcontentloaded");
    }
  }
}

/** Selects a dashboard article filter pill and verifies it became active. */
export async function selectArticleFilter(
  page: Page,
  filterName: "all" | "read" | "starred" | "unread",
) {
  const filterButton = page.getByRole("button", {
    exact: true,
    name: filterName,
  });

  await expect(filterButton).toBeVisible();

  try {
    await clickVisibleControl(filterButton);
  } catch {
    await filterButton.evaluate((node) => {
      if (!(node instanceof HTMLElement)) {
        throw new Error("Expected dashboard filter button element.");
      }

      node.click();
    });
  }

  if (
    (await filterButton.getAttribute("aria-pressed").catch(() => null)) !==
    "true"
  ) {
    await filterButton.evaluate((node) => {
      if (!(node instanceof HTMLElement)) {
        throw new Error("Expected dashboard filter button element.");
      }

      node.click();
    });
  }

  await expect(filterButton).toHaveAttribute("aria-pressed", "true");
}

/** Selects visible expanded article text and returns the current selection content. */
export async function selectExpandedArticleText(article: Locator) {
  return await article.evaluate((node) => {
    const selectableTarget = node.querySelector<HTMLElement>(
      ".article-swipe-body",
    );

    if (!selectableTarget || selectableTarget.innerText.trim().length <= 20) {
      return "";
    }

    const selection = window.getSelection();
    const range = document.createRange();

    selection?.removeAllRanges();
    range.selectNodeContents(selectableTarget);
    selection?.addRange(range);

    return selection?.toString().trim() ?? "";
  });
}

/** Scrolls the active feed viewport to a target offset. */
export async function setFeedViewportScrollTop(page: Page, scrollTop: number) {
  const viewportSelectors = [
    '[data-feed-scroll-viewport="true"]',
    "[data-radix-scroll-area-viewport]",
    "[data-feed-surface-mode]",
    "[data-feed-virtualizer]",
  ] as const;

  await page.evaluate(
    ({ nextScrollTop, selectors }) => {
      const viewport = selectors
        .flatMap((selector) =>
          Array.from(document.querySelectorAll<HTMLElement>(selector)),
        )
        .find((candidate) => {
          const rect = candidate.getBoundingClientRect();

          return (
            candidate.querySelector("article[data-article-key]") !== null &&
            rect.width > 0 &&
            rect.height > 0 &&
            window.getComputedStyle(candidate).visibility !== "hidden"
          );
        });

      if (!viewport) {
        throw new Error("Expected a dashboard feed viewport.");
      }

      const clampedScrollTop = Math.max(
        0,
        Math.min(nextScrollTop, viewport.scrollHeight - viewport.clientHeight),
      );

      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({ behavior: "auto", top: clampedScrollTop });
      }

      if (Math.abs(viewport.scrollTop - clampedScrollTop) > 1) {
        viewport.scrollTop = clampedScrollTop;
      }

      viewport.dispatchEvent(new Event("scroll"));
    },
    { nextScrollTop: scrollTop, selectors: viewportSelectors },
  );
}

/** Drags horizontally across an article card to exercise swipe actions. */
export async function swipeArticle(
  article: Locator,
  options: {
    endRatio: number;
    startRatio: number;
    yRatio?: number;
  },
) {
  await article.scrollIntoViewIfNeeded();
  const box = await article.boundingBox();

  if (!box) {
    throw new Error("Expected article card to have a measurable bounding box.");
  }

  const yRatio = options.yRatio ?? 0.5;
  const startX = box.x + box.width * options.startRatio;
  const endX = box.x + box.width * options.endRatio;
  const y = box.y + box.height * yRatio;
  const pointerId = Math.floor(Date.now() % 10_000) + 1;

  await article.dispatchEvent("pointerdown", {
    clientX: startX,
    clientY: y,
    pointerId,
    pointerType: "touch",
  });
  await article.dispatchEvent("pointermove", {
    clientX: endX,
    clientY: y + 2,
    pointerId,
    pointerType: "touch",
  });
  await article.dispatchEvent("pointerup", {
    clientX: endX,
    clientY: y + 2,
    pointerId,
    pointerType: "touch",
  });
}

/** Toggles an article by clicking its title region instead of nested action buttons. */
export async function toggleArticle(article: Locator) {
  await expect(article).toBeVisible({ timeout: 15_000 });
  await article.scrollIntoViewIfNeeded();

  try {
    const beforeExpanded = await article.getAttribute("aria-expanded");
    const header = article
      .locator("[data-article-swipe-zone='header']")
      .first();

    if (beforeExpanded === "true" && (await header.count()) > 0) {
      await header.click({ force: true });
    } else {
      await article.click({ force: true });
    }

    await expect
      .poll(async () => await article.getAttribute("aria-expanded"))
      .not.toBe(beforeExpanded);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (!error.message.includes("Element is not attached to the DOM") &&
        !error.message.includes("Timeout"))
    ) {
      throw error;
    }

    const beforeRetryExpanded = await article.getAttribute("aria-expanded");
    const header = article
      .locator("[data-article-swipe-zone='header']")
      .first();

    if (beforeRetryExpanded === "true" && (await header.count()) > 0) {
      await header.click({ force: true });
    } else {
      await article.click({ force: true });
    }

    await expect
      .poll(async () => await article.getAttribute("aria-expanded"))
      .not.toBe(beforeRetryExpanded);
  }
}

/** Dispatches a wheel event against the active feed viewport to mark user scroll intent. */
export async function triggerFeedViewportWheelIntent(page: Page, deltaY = 240) {
  const viewport = await getActiveFeedViewport(page);

  await viewport.evaluate((node, nextDeltaY) => {
    node.dispatchEvent(new WheelEvent("wheel", { deltaY: nextDeltaY }));
  }, deltaY);
}

/**
 * Waits for the preview dashboard shell to render, finish document loading,
 * and clear any visible article hydration placeholders.
 */
export async function waitForPreviewDashboardHydration(page: Page) {
  await expectPreviewDashboard(page);
  await page.waitForFunction(() => document.readyState === "complete");
  await expect
    .poll(async () => {
      return await page
        .locator('[data-article-hydration-state="loading"]')
        .count();
    })
    .toBe(0);
}

/** Dispatches real mouse-wheel input against the active feed viewport. */
export async function wheelActiveFeedViewport(page: Page, deltaY = 240) {
  const viewport = await getActiveFeedViewport(page);
  const box = await viewport.boundingBox();

  if (!box) {
    throw new Error(
      "Expected the active feed viewport to have a measurable bounding box.",
    );
  }

  await page.mouse.move(
    box.x + box.width / 2,
    box.y + Math.min(box.height / 2, 240),
  );
  await page.mouse.wheel(0, deltaY);
}

/** Clicks a visible control and falls back to a DOM click when toasts intercept the pointer. */
async function clickVisibleControl(locator: Locator) {
  await expect(locator).toBeVisible();

  try {
    await locator.click();
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("intercepts pointer events") ||
        error.message.includes("Timeout"))
    ) {
      await locator.click({ force: true });
      return;
    }

    throw error;
  }
}

function escapeCssAttributeValue(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function findActiveFeedViewportCandidate(
  page: Page,
  viewportSelectors: readonly string[],
) {
  for (const selector of viewportSelectors) {
    const candidates = page.locator(selector);
    const candidateCount = await candidates.count();

    for (let index = 0; index < candidateCount; index += 1) {
      const candidate = candidates.nth(index);
      const isActiveViewport = await candidate
        .evaluate((node) => {
          if (!(node instanceof HTMLElement)) {
            return false;
          }

          const rect = node.getBoundingClientRect();
          return (
            node.querySelector("article[data-article-key]") !== null &&
            rect.width > 0 &&
            rect.height > 0 &&
            window.getComputedStyle(node).visibility !== "hidden"
          );
        })
        .catch(() => false);

      if (isActiveViewport) {
        return { index, selector };
      }
    }
  }

  return null;
}

async function getActiveFeedViewport(page: Page) {
  const viewportSelectors = [
    '[data-feed-scroll-viewport="true"]',
    "[data-radix-scroll-area-viewport]",
    "[data-feed-surface-mode]",
    "[data-feed-virtualizer]",
  ] as const;
  const deadline = Date.now() + 15_000;
  let activeViewportCandidate: Awaited<
    ReturnType<typeof findActiveFeedViewportCandidate>
  > = null;

  while (Date.now() < deadline) {
    activeViewportCandidate = await findActiveFeedViewportCandidate(
      page,
      viewportSelectors,
    );

    if (activeViewportCandidate) {
      break;
    }

    await page.waitForTimeout(100);
  }

  if (!activeViewportCandidate) {
    throw new Error("Expected a dashboard feed viewport.");
  }

  return page
    .locator(activeViewportCandidate.selector)
    .nth(activeViewportCandidate.index);
}

function isKnownNonRuntimeConsoleError(message: string) {
  return KNOWN_NON_RUNTIME_CONSOLE_ERROR_PATTERNS.some((pattern) => {
    return pattern.test(message);
  });
}

function normalizeRuntimeSignalText(text: string) {
  return text.replace(/\s+/gu, " ").trim();
}

/** Measures an article's top edge relative to its owning feed viewport. */
async function readArticleTopWithinViewport(article: Locator) {
  return await article.evaluate((node) => {
    const viewport = node.closest<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error(
        "Expected article to be rendered inside the feed viewport.",
      );
    }

    return (
      node.getBoundingClientRect().top - viewport.getBoundingClientRect().top
    );
  });
}

async function readNextJsPortalText(page: Page) {
  return normalizeRuntimeSignalText(
    await page.evaluate(() => {
      const portal = document.querySelector("nextjs-portal");

      if (!(portal instanceof HTMLElement)) {
        return "";
      }

      return `${portal.textContent ?? ""} ${portal.shadowRoot?.textContent ?? ""}`;
    }),
  );
}

function shouldCaptureNextJsConsoleError(message: ConsoleMessage) {
  if (message.type() !== "error") {
    return false;
  }

  const text = normalizeRuntimeSignalText(message.text());

  if (isKnownNonRuntimeConsoleError(text)) {
    return false;
  }

  return NEXT_JS_CONSOLE_ERROR_PATTERN.test(text);
}

function toXPathStringLiteral(value: string) {
  if (!value.includes('"')) {
    return `"${value}"`;
  }

  if (!value.includes("'")) {
    return `'${value}'`;
  }

  return `concat(${value
    .split('"')
    .map((segment) => `"${segment}"`)
    .join(`, '"', `)})`;
}
