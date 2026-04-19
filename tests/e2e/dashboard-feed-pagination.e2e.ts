import type { Page } from "@playwright/test";

import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  hasLoadMoreSentinel,
  installDeterministicFeedBatchRoute,
  readRenderedArticleCount,
  readRenderedItemWindow,
  readVisibleFeedArticleCount,
  scrollFeedViewportToBottom,
  setFeedViewportScrollTop,
} from "./helpers";
import { expect, test } from "./test";

interface DesktopMarkVisibleReadSnapshot {
  fullyVisibleArticleKeys: string[];
  maxIndex: null | number;
  renderedArticleKeys: string[];
  renderedCount: number;
}

interface DesktopViewportCase {
  height: number;
  name: string;
  width: number;
}

const DESKTOP_VIEWPORT_CASES: DesktopViewportCase[] = [
  { height: 640, name: "compact desktop", width: 1024 },
  { height: 780, name: "wide desktop", width: 1440 },
];

/**
 * Counts how many article keys in the next window did not exist in the
 * previous window.
 */
function countIncomingArticleKeys(
  previousArticleKeys: string[],
  nextArticleKeys: string[],
) {
  const previousArticleKeySet = new Set(previousArticleKeys);

  return nextArticleKeys.filter(
    (articleKey) => !previousArticleKeySet.has(articleKey),
  ).length;
}

/**
 * Repeatedly scrolls far enough to reveal at least three configured pages so
 * refresh regressions can prove the surface collapses back to the minimum
 * overflow window instead of preserving stale reveal state.
 */
async function expandDesktopFeedWindow(page: Page) {
  await scrollFeedViewportToBottom(page);
  await scrollFeedViewportToBottom(page);

  await expect
    .poll(async () => {
      return await readVisibleFeedArticleCount(page);
    })
    .toBeGreaterThanOrEqual(12);
}

/**
 * Confirms refresh collapses an expanded desktop feed back to one page plus the
 * minimum overflow while still leaving the next page available to load.
 */
async function expectDesktopRefreshCollapse(page: Page) {
  await page
    .getByRole("button", { exact: true, name: "Refresh selected feed" })
    .click();

  await expect
    .poll(async () => {
      return await readVisibleFeedArticleCount(page);
    })
    .toBeGreaterThanOrEqual(8);
  await expect
    .poll(async () => {
      return await readVisibleFeedArticleCount(page);
    })
    .toBeLessThan(12);
  await expect
    .poll(async () => {
      return await hasLoadMoreSentinel(page);
    })
    .toBe(true);
}

function haveMatchingArticleKeys(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((articleKey, index) => articleKey === right[index])
  );
}

/**
 * Reads the active desktop feed window so repeated mark-visible cycles can
 * assert both the visible replacement set and the total rendered article
 * window without depending on implementation-only React state.
 */
async function readDesktopMarkVisibleReadSnapshot(
  page: Page,
): Promise<DesktopMarkVisibleReadSnapshot> {
  await page.waitForFunction(() => {
    const viewportSelectors = [
      '[data-feed-scroll-viewport="true"]',
      "[data-radix-scroll-area-viewport]",
      "[data-feed-surface-mode]",
      "[data-feed-virtualizer]",
    ] as const;

    return viewportSelectors
      .flatMap((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)),
      )
      .some((candidate) => {
        const rect = candidate.getBoundingClientRect();

        return (
          candidate.querySelector("article[data-article-key]") !== null &&
          rect.width > 0 &&
          rect.height > 0 &&
          window.getComputedStyle(candidate).visibility !== "hidden"
        );
      });
  });

  return await page.evaluate(() => {
    const viewportSelectors = [
      '[data-feed-scroll-viewport="true"]',
      "[data-radix-scroll-area-viewport]",
      "[data-feed-surface-mode]",
      "[data-feed-virtualizer]",
    ] as const;
    const viewport = viewportSelectors
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
      throw new Error("Expected the active desktop feed viewport.");
    }

    const viewportRect = viewport.getBoundingClientRect();
    const articleElements = Array.from(
      viewport.querySelectorAll<HTMLElement>("article[data-article-key]"),
    );
    const renderedArticleKeys = articleElements
      .map((articleElement) => articleElement.dataset.articleKey)
      .filter((articleKey): articleKey is string => Boolean(articleKey));
    const fullyVisibleArticleKeys = articleElements
      .filter((articleElement) => {
        if (
          articleElement.closest('[data-article-entering="true"]') !== null
        ) {
          return false;
        }

        const articleRect = articleElement.getBoundingClientRect();
        return (
          articleRect.top >= viewportRect.top &&
          articleRect.right <= viewportRect.right &&
          articleRect.bottom <= viewportRect.bottom &&
          articleRect.left >= viewportRect.left
        );
      })
      .map((articleElement) => articleElement.dataset.articleKey)
      .filter((articleKey): articleKey is string => Boolean(articleKey));
    const indexes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-index]"),
    )
      .map((node) => Number.parseInt(node.dataset.index ?? "", 10))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);

    return {
      fullyVisibleArticleKeys,
      maxIndex: indexes.length > 0 ? indexes[indexes.length - 1] : null,
      renderedArticleKeys,
      renderedCount: renderedArticleKeys.length,
    };
  });
}

async function readFeedViewportMetrics(page: Page) {
  return await page.evaluate(() => {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ),
    );
    const viewport = candidates
      .filter(
        (candidate) =>
          candidate.querySelector("article[data-article-key]") !== null,
      )
      .sort((left, right) => right.scrollHeight - left.scrollHeight)[0];

    if (!viewport) {
      throw new Error("Expected the active feed viewport to be present.");
    }

    const maxScrollTop = Math.max(
      0,
      viewport.scrollHeight - viewport.clientHeight,
    );

    return {
      clientHeight: viewport.clientHeight,
      maxScrollTop,
      remaining:
        viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight),
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
    };
  });
}

/**
 * Waits until the compact desktop unread window stops growing before the
 * repeated visible-read regression captures its steady-state baseline.
 */
async function readStableDesktopMarkVisibleReadBaseline(page: Page) {
  const minimumRenderedCount = 8;
  const minimumVisibleCount = 4;

  await expect
    .poll(async () => {
      return (await readDesktopMarkVisibleReadSnapshot(page)).renderedCount;
    })
    .toBeGreaterThanOrEqual(minimumRenderedCount);
  await expect
    .poll(async () => {
      return (await readDesktopMarkVisibleReadSnapshot(page))
        .fullyVisibleArticleKeys.length;
    })
    .toBeGreaterThanOrEqual(minimumVisibleCount);

  let previousSnapshot = await readDesktopMarkVisibleReadSnapshot(page);

  await expect
    .poll(async () => {
      const nextSnapshot = await readDesktopMarkVisibleReadSnapshot(page);
      const baselineDidSettle =
        nextSnapshot.renderedCount === previousSnapshot.renderedCount &&
        nextSnapshot.fullyVisibleArticleKeys.length ===
          previousSnapshot.fullyVisibleArticleKeys.length;

      previousSnapshot = nextSnapshot;

      return baselineDidSettle
        ? {
            fullyVisibleCount: nextSnapshot.fullyVisibleArticleKeys.length,
            renderedCount: nextSnapshot.renderedCount,
          }
        : null;
    })
    .not.toBeNull();

  return previousSnapshot;
}

/** Rearms the desktop load-more boundary after refresh by moving away, then back. */
async function rearmDesktopPaginationAfterRefresh(page: Page) {
  const metrics = await readFeedViewportMetrics(page);

  await setFeedViewportScrollTop(page, Math.floor(metrics.maxScrollTop * 0.45));
  await page.waitForTimeout(800);

  const rearmMetrics = await readFeedViewportMetrics(page);
  await setFeedViewportScrollTop(
    page,
    Math.floor(rearmMetrics.maxScrollTop * 0.95),
  );
}

/**
 * Waits until the mark-visible refill has restored the stable rendered window
 * size and the next fully visible set has fully settled.
 */
async function waitForStableDesktopMarkVisibleReadCycle(
  page: Page,
  expectedFullyVisibleCount: number,
  previousFullyVisibleArticleKeys: string[] = [],
) {
  await expect
    .poll(async () => {
      const snapshot = await readDesktopMarkVisibleReadSnapshot(page);

      return {
        fullyVisibleArticleCount: snapshot.fullyVisibleArticleKeys.length,
        visibleWindowChanged:
          previousFullyVisibleArticleKeys.length === 0 ||
          !haveMatchingArticleKeys(
            previousFullyVisibleArticleKeys,
            snapshot.fullyVisibleArticleKeys,
          ),
      };
    })
    .toMatchObject({
      fullyVisibleArticleCount: expectedFullyVisibleCount,
      visibleWindowChanged: true,
    });

  return await readDesktopMarkVisibleReadSnapshot(page);
}

test.describe("dashboard feed pagination", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await installDeterministicFeedBatchRoute(page);
  });

  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
    test(`does not render the entire explore corpus at once on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, 4);

      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeLessThan(40);
      await expect
        .poll(async () => {
          return await hasLoadMoreSentinel(page);
        })
        .toBe(true);
    });

    test(`keeps the configured page size and loads at least three pages on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { exact: true, name: "all" }).click();

      await configureArticlesPerPage(page, 4);

      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(3);
      await expect
        .poll(async () => {
          return await hasLoadMoreSentinel(page);
        })
        .toBe(true);

      await scrollFeedViewportToBottom(page);
      await scrollFeedViewportToBottom(page);
      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(11);

      const previousWindow = await readRenderedItemWindow(page);
      expect(previousWindow.maxIndex).not.toBeNull();

      for (const _ignored of [0]) {
        await scrollFeedViewportToBottom(page);
        await expect
          .poll(async () => {
            return (await readRenderedItemWindow(page)).maxIndex;
          })
          .toBeGreaterThanOrEqual(previousWindow.maxIndex!);
      }
    });

    test(`loads the next desktop page before exact bottom on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, 4);

      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(3);

      const initialMetrics = await readFeedViewportMetrics(page);
      await setFeedViewportScrollTop(
        page,
        Math.floor(initialMetrics.maxScrollTop * 0.7),
      );

      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(7);
      await expect
        .poll(async () => {
          return (await readFeedViewportMetrics(page)).remaining;
        })
        .toBeGreaterThan(0);

      const firstRevealMetrics = await readFeedViewportMetrics(page);
      await setFeedViewportScrollTop(
        page,
        Math.floor(firstRevealMetrics.maxScrollTop * 0.55),
      );

      await page.waitForTimeout(400);
      expect((await readRenderedItemWindow(page)).maxIndex).toBeLessThanOrEqual(
        11,
      );

      await page.waitForTimeout(800);
      await setFeedViewportScrollTop(
        page,
        Math.floor(firstRevealMetrics.maxScrollTop * 0.4),
      );
      const rearmMetrics = await readFeedViewportMetrics(page);
      await setFeedViewportScrollTop(
        page,
        Math.floor(rearmMetrics.maxScrollTop * 0.95),
      );

      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThanOrEqual(11);
    });

    test(`waits to refill visible-read depletion until unread drops below a page plus overflow on ${viewportCase.name}`, async ({
      page,
    }) => {
      const feedRequestUrls: string[] = [];
      const handleRequest = (request: { url: () => string }) => {
        const requestUrl = new URL(request.url());

        if (requestUrl.pathname === "/api/feeds") {
          feedRequestUrls.push(request.url());
        }
      };

      page.on("request", handleRequest);

      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      try {
        await gotoPreviewDashboard(page);
        await configureArticlesPerPage(page, 4);

        await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
        await expect
          .poll(async () => {
            return await readRenderedArticleCount(page);
          })
          .toBeGreaterThanOrEqual(8);

        feedRequestUrls.length = 0;

        await page
          .getByRole("button", { name: "Mark fully visible articles as read" })
          .click();

        await expect
          .poll(async () => {
            return await readRenderedArticleCount(page);
          })
          .toBeGreaterThanOrEqual(8);

        await page.waitForTimeout(800);
        expect(feedRequestUrls).toEqual([]);
      } finally {
        page.off("request", handleRequest);
      }
    });

    test(`keeps repeated visible-read refills stable for twenty cycles on ${viewportCase.name}`, async ({
      page,
    }) => {
      const repeatedCyclePageSize = 4;
      const repeatedCycleViewportHeight = Math.max(viewportCase.height, 780);
      const markViewportReadButton = page.getByRole("button", {
        name: "Mark fully visible articles as read",
      });

      await page.setViewportSize({
        height: repeatedCycleViewportHeight,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await configureArticlesPerPage(page, repeatedCyclePageSize);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect(markViewportReadButton).toBeEnabled({ timeout: 15_000 });

      const initialSnapshot =
        await readStableDesktopMarkVisibleReadBaseline(page);
      const expectedReplacementCount =
        initialSnapshot.fullyVisibleArticleKeys.length;

      expect(expectedReplacementCount).toBeGreaterThanOrEqual(
        repeatedCyclePageSize,
      );

      await expect(markViewportReadButton).toBeEnabled();
      await markViewportReadButton.click();

      const calibratedSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
        page,
        expectedReplacementCount,
        initialSnapshot.fullyVisibleArticleKeys,
      );

      let previousSnapshot = calibratedSnapshot;

      for (const cycleIndex of Array.from({ length: 19 }, (_, index) => index)) {
        expect(
          previousSnapshot.fullyVisibleArticleKeys.length,
          `Expected cycle ${cycleIndex + 2} to start with the same fully visible unread window size.`,
        ).toBe(expectedReplacementCount);

        await expect(markViewportReadButton).toBeEnabled();
        await markViewportReadButton.click();

        const nextSnapshot = await waitForStableDesktopMarkVisibleReadCycle(
          page,
          expectedReplacementCount,
          previousSnapshot.fullyVisibleArticleKeys,
        );
        const incomingVisibleArticleCount = countIncomingArticleKeys(
          previousSnapshot.fullyVisibleArticleKeys,
          nextSnapshot.fullyVisibleArticleKeys,
        );

        expect(
          incomingVisibleArticleCount,
          `Expected cycle ${cycleIndex + 2} to replace the fully visible unread window with exactly ${expectedReplacementCount} new visible articles after marking it read.`,
        ).toBe(expectedReplacementCount);
        expect(
          previousSnapshot.fullyVisibleArticleKeys.every(
            (articleKey) => !nextSnapshot.fullyVisibleArticleKeys.includes(articleKey),
          ),
          `Expected cycle ${cycleIndex + 2} to remove every previously fully visible unread article from the next fully visible unread window.`,
        ).toBe(true);
        expect(nextSnapshot.maxIndex).not.toBeNull();

        previousSnapshot = nextSnapshot;
      }
    });

    test(`resets refresh back to one page plus minimum overflow on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(8);

      await scrollFeedViewportToBottom(page);
      await scrollFeedViewportToBottom(page);

      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(12);

      await page
        .getByRole("button", { exact: true, name: "Refresh selected feed" })
        .click();

      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(8);
      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeLessThan(12);
    });

    test(`keeps repeated desktop refreshes collapsed after the feed was expanded on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => {
          return await readRenderedArticleCount(page);
        })
        .toBeGreaterThanOrEqual(8);

      await expandDesktopFeedWindow(page);
      const expandedCount = await readRenderedArticleCount(page);

      await expectDesktopRefreshCollapse(page);
      const firstRefreshCount = await readRenderedArticleCount(page);

      expect(firstRefreshCount).toBeGreaterThanOrEqual(8);
      expect(firstRefreshCount).toBeLessThan(expandedCount);

      await expectDesktopRefreshCollapse(page);
      const secondRefreshCount = await readRenderedArticleCount(page);

      expect(secondRefreshCount).toBeGreaterThanOrEqual(8);
      expect(secondRefreshCount).toBeLessThan(expandedCount);
      expect(secondRefreshCount).toBeLessThan(12);
    });

    test(`rearms desktop pagination after refresh collapses an expanded explore window on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, 4);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expandDesktopFeedWindow(page);

      await expectDesktopRefreshCollapse(page);

      const collapsedWindow = await readRenderedItemWindow(page);
      expect(collapsedWindow.maxIndex).not.toBeNull();
      expect(collapsedWindow.maxIndex!).toBeLessThan(11);

      await rearmDesktopPaginationAfterRefresh(page);
      await expect
        .poll(async () => {
          return (await readRenderedItemWindow(page)).maxIndex;
        })
        .toBeGreaterThan(collapsedWindow.maxIndex!);
    });
  }
});
