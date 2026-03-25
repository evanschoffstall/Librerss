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

interface NextJsErrorSignal {
  source: "console" | "overlay" | "pageerror";
  text: string;
}

/** Returns the indexed rendered article card within the explore feed. */
export function articleCard(page: Page, index: number): Locator {
  return page.locator("article[data-article-key]").nth(index);
}

/** Returns the rendered article card matching a previously captured article key. */
export function articleCardByKey(page: Page, articleKey: string): Locator {
  return page.locator(
    `xpath=//article[@data-article-key=${toXPathStringLiteral(articleKey)}]`,
  );
}

/** Returns the feed row wrapper that owns a given article card. */
export function articleRow(article: Locator): Locator {
  return article.locator("xpath=ancestor::*[@data-scroll-restore-key][1]");
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
  await page
    .getByRole("button", { name: "Explore without an account" })
    .click();
  await expectPreviewDashboard(page);
}

/** Waits for an article card to reach the expected expanded state. */
export async function expectArticleExpanded(article: Locator, expanded: boolean) {
  await expect(article).toHaveAttribute("aria-expanded", expanded ? "true" : "false");
}

/** Waits for the unauthenticated dashboard login shell to become visible. */
export async function expectDashboardLogin(page: Page) {
  await page.waitForURL((url) => url.pathname === "/dashboard");
  await expect(page.getByText("Sign in to LibreRSS")).toBeVisible();
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
  expect(containerBox, `${label}: container has no bounding box`).not.toBeNull();

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
  await page.waitForURL((url) => {
    return (
      url.pathname === "/dashboard" &&
      (
        url.searchParams.get("explore") === "1" ||
        url.searchParams.get("preview") === "1" ||
        url.search === ""
      )
    );
  });
  await expect(page.getByText("demo", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(firstArticleCard(page)).toBeVisible({ timeout: 15_000 });

  const mobileActionsMenuButton = page.getByRole("button", {
    name: "Open actions menu",
  });
  const desktopSettingsButton = page.getByRole("button", {
    name: "Open dashboard settings",
  });

  if (await mobileActionsMenuButton.isVisible().catch(() => false)) {
    await expect(mobileActionsMenuButton).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Open feeds" })).toBeVisible({
      timeout: 15_000,
    });
    return;
  }

  await expect(desktopSettingsButton).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({
    timeout: 15_000,
  });
}

/** Returns the first rendered article card in the feed list. */
export function firstArticleCard(page: Page): Locator {
  return page.locator("article[data-article-key]").first();
}

/** Returns the first article title within the feed list. */
export function firstArticleTitle(page: Page): Locator {
  return firstArticleCard(page).getByRole("heading").first();
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
  return (await page.locator("[data-feed-load-more-sentinel='true']").count()) > 0;
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
  const settingsHeading = page.getByRole("heading", { name: "Reader Settings" });
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

/** Reads the active feed viewport metrics used by expand and scroll-restore flows. */
export async function readFeedViewportMetrics(page: Page) {
  return await page.evaluate(() => {
    const viewports = [...document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]")];
    const viewport = viewports.reduce<HTMLElement | null>((selected, candidate) => {
      if (!selected) return candidate;
      return candidate.scrollHeight > selected.scrollHeight ? candidate : selected;
    }, null);

    if (!viewport) {
      throw new Error("Expected a dashboard feed viewport.");
    }

    return {
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
    };
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
  return await page.locator("article[data-article-key]").count();
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
      throw new Error("Expected the mobile feeds tray to render a Radix viewport.");
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

/** Scrolls the active feed viewport to its current bottom edge. */
export async function scrollFeedViewportToBottom(page: Page) {
  await page.evaluate(() => {
    const viewports = [...document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]")];
    const viewport = viewports.reduce<HTMLElement | null>((selected, candidate) => {
      if (!selected) return candidate;
      return candidate.scrollHeight > selected.scrollHeight ? candidate : selected;
    }, null);

    if (!viewport) {
      throw new Error("Expected a dashboard feed viewport.");
    }

    viewport.scrollTop = viewport.scrollHeight;
    viewport.dispatchEvent(new Event("scroll"));
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

/** Selects visible expanded article text and returns the current selection content. */
export async function selectExpandedArticleText(article: Locator) {
  return await article.evaluate((node) => {
    const selectableTarget = node.querySelector<HTMLElement>(".article-swipe-body");

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
  await page.evaluate((nextScrollTop) => {
    const viewports = [...document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]")];
    const viewport = viewports.reduce<HTMLElement | null>((selected, candidate) => {
      if (!selected) return candidate;
      return candidate.scrollHeight > selected.scrollHeight ? candidate : selected;
    }, null);

    if (!viewport) {
      throw new Error("Expected a dashboard feed viewport.");
    }

    viewport.scrollTop = nextScrollTop;
    viewport.dispatchEvent(new Event("scroll"));
  }, scrollTop);
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
  await article.scrollIntoViewIfNeeded();
  await article
    .locator("[data-article-swipe-zone='header']")
    .first()
    .click({ position: { x: 32, y: 48 } });
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
      return await page.locator('[data-article-hydration-state="loading"]').count();
    })
    .toBe(0);
}

/** Clicks a visible control and falls back to a DOM click when toasts intercept the pointer. */
async function clickVisibleControl(locator: Locator) {
  await expect(locator).toBeVisible();

  try {
    await locator.click();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("intercepts pointer events")
    ) {
      await locator.click({ force: true, timeout: 1_000 });
      return;
    }

    throw error;
  }
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
    const viewport = node.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!viewport) {
      throw new Error("Expected article to be rendered inside the feed viewport.");
    }

    return node.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
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
