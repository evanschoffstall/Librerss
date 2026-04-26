/**
 * Shared desktop pagination fixtures and assertions used by the split dashboard
 * feed pagination end-to-end suites.
 */

import type { Page } from "@playwright/test";

import {
  hasLoadMoreSentinel,
  readVisibleFeedArticleCount,
  scrollFeedViewportToBottom,
  setFeedViewportScrollTop,
  triggerFeedViewportWheelIntent,
} from "./helpers";
import { expect } from "./test";

/**
 * Snapshot of the rendered and fully visible desktop article window.
 */
export interface DesktopMarkVisibleReadSnapshot {
  fullyVisibleArticleKeys: string[];
  maxIndex: null | number;
  renderedArticleKeys: string[];
  renderedCount: number;
}

/**
 * Desktop viewport case used to exercise the same pagination contract at
 * multiple layout sizes.
 */
export interface DesktopViewportCase {
  height: number;
  name: string;
  width: number;
}

/**
 * Canonical desktop viewport coverage for dashboard feed pagination.
 */
export const DESKTOP_VIEWPORT_CASES: DesktopViewportCase[] = [
  { height: 640, name: "compact desktop", width: 1024 },
  { height: 780, name: "wide desktop", width: 1440 },
];

/**
 * Count how many article keys entering the next visible window were not present
 * in the previous fully visible window.
 * @param previousArticleKeys - Previously visible article keys.
 * @param nextArticleKeys - Next visible article keys after the refill.
 * @returns Number of newly visible article keys.
 */
/**
 * Expand the desktop feed until at least three configured pages are visible.
 * @param page - Active Playwright page.
 */
export async function expandDesktopFeedWindow(page: Page) {
  await scrollFeedViewportToBottom(page);
  await scrollFeedViewportToBottom(page);

  await expect
    .poll(async () => {
      return await readVisibleFeedArticleCount(page);
    })
    .toBeGreaterThanOrEqual(12);
}

/**
 * Confirm that a refresh collapses the expanded desktop feed back to the
 * minimum visible window while preserving the load-more sentinel.
 * @param page - Active Playwright page.
 */
export async function expectDesktopRefreshCollapse(page: Page) {
  await page
    .getByRole("button", { exact: true, name: "Refresh selected feed" })
    .click();

  await expect
    .poll(async () => {
      return await readVisibleFeedArticleCount(page);
    })
    .toBe(4);
  await expect
    .poll(async () => {
      return await hasLoadMoreSentinel(page);
    })
    .toBe(true);
}

/**
 * Read the active desktop feed window so visible-read refill tests can assert
 * the visible replacement set without inspecting implementation-only state.
 * @param page - Active Playwright page.
 * @returns Snapshot of rendered and fully visible desktop articles.
 */
export async function readDesktopMarkVisibleReadSnapshot(
  page: Page,
): Promise<DesktopMarkVisibleReadSnapshot> {
  return await page.evaluate(() => {
    const viewport = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-feed-scroll-viewport="true"], [data-radix-scroll-area-viewport]',
      ),
    )
      .filter((candidate) => {
        const rect = candidate.getBoundingClientRect();

        return (
          candidate.querySelector("article[data-article-key]") !== null &&
          rect.width > 0 &&
          rect.height > 0 &&
          window.getComputedStyle(candidate).visibility !== "hidden"
        );
      })
      .sort((left, right) => {
        const rightArticleCount = right.querySelectorAll(
          "article[data-article-key]",
        ).length;
        const leftArticleCount = left.querySelectorAll(
          "article[data-article-key]",
        ).length;

        if (rightArticleCount !== leftArticleCount) {
          return rightArticleCount - leftArticleCount;
        }

        return right.scrollHeight - left.scrollHeight;
      })[0] ?? null;

    const feedSurface =
      viewport?.closest<HTMLElement>("[data-feed-surface-mode]") ??
      viewport?.parentElement ??
      null;

    if (!viewport || !feedSurface) {
      return {
        fullyVisibleArticleKeys: [],
        maxIndex: null,
        renderedArticleKeys: [],
        renderedCount: 0,
      };
    }

    const viewportTop = viewport.scrollTop;
    const viewportBottom = viewportTop + viewport.clientHeight;
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

        const articleTop = articleElement.offsetTop;
        const articleBottom = articleTop + articleElement.offsetHeight;

        return (
          articleTop >= viewportTop &&
          articleBottom <= viewportBottom &&
          articleElement.offsetWidth > 0 &&
          articleElement.offsetHeight > 0
        );
      })
      .map((articleElement) => articleElement.dataset.articleKey)
      .filter((articleKey): articleKey is string => Boolean(articleKey));
    const indexes = Array.from(
      feedSurface.querySelectorAll<HTMLElement>("[data-index]"),
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

/**
 * Read scroll metrics for the currently active desktop feed viewport.
 * @param page - Active Playwright page.
 * @returns Active viewport metrics used by rearm and load-boundary assertions.
 */
export async function readFeedViewportMetrics(page: Page) {
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
 * Wait until the compact desktop unread window stops growing before capturing
 * the steady-state visible-read baseline.
 * @param page - Active Playwright page.
 * @returns Settled snapshot for the current visible-read window.
 */
export async function readStableDesktopMarkVisibleReadBaseline(page: Page) {
  const minimumRenderedCount = 4;
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

/**
 * Rearm the desktop load-more boundary after a refresh collapse by scrolling
 * away from the boundary and then back near the bottom.
 * @param page - Active Playwright page.
 */
export async function rearmDesktopPaginationAfterRefresh(page: Page) {
  const metrics = await readFeedViewportMetrics(page);

  await setFeedViewportScrollTop(page, Math.floor(metrics.maxScrollTop * 0.45));
  await triggerFeedViewportWheelIntent(page, 240);
  await expect
    .poll(async () => {
      const currentMetrics = await readFeedViewportMetrics(page);

      return currentMetrics.remaining;
    })
    .toBeGreaterThan(0);

  const rearmMetrics = await readFeedViewportMetrics(page);
  await setFeedViewportScrollTop(
    page,
    Math.floor(rearmMetrics.maxScrollTop * 0.95),
  );
  await triggerFeedViewportWheelIntent(page, 240);
}

/**
 * Wait until a mark-visible refill restores the expected visible-window size and
 * the visible article set changes from the previous cycle.
 * @param page - Active Playwright page.
 * @param expectedFullyVisibleCount - Expected fully visible unread count.
 * @param previousFullyVisibleArticleKeys - Previously visible article keys.
 * @returns Settled snapshot for the next visible-read cycle.
 */
export async function waitForStableDesktopMarkVisibleReadCycle(
  page: Page,
  minimumRenderedCount: number,
  previousFullyVisibleArticleKeys: string[] = [],
): Promise<DesktopMarkVisibleReadSnapshot> {
  let settledSnapshot: DesktopMarkVisibleReadSnapshot | null = null;

  await expect
    .poll(async () => {
      const snapshot = await readDesktopMarkVisibleReadSnapshot(page);
      const hasVisibleUnreadWindow = snapshot.fullyVisibleArticleKeys.length > 0;

      settledSnapshot = hasVisibleUnreadWindow ? snapshot : null;

      return {
        hasVisibleUnreadWindow,
        renderedWindowRecovered: snapshot.renderedCount >= minimumRenderedCount,
        visibleWindowChanged:
          previousFullyVisibleArticleKeys.length === 0 ||
          !haveMatchingArticleKeys(
            previousFullyVisibleArticleKeys,
            snapshot.fullyVisibleArticleKeys,
          ),
      };
    }, { timeout: 20_000 })
    .toMatchObject({
      hasVisibleUnreadWindow: true,
    });

  if (!settledSnapshot) {
    throw new Error("Expected a settled visible-read snapshot.");
  }

  return settledSnapshot;
}

/**
 * Compare two article-key arrays for exact positional equality.
 * @param left - First key array.
 * @param right - Second key array.
 * @returns Whether both arrays contain the same keys in the same order.
 */
function haveMatchingArticleKeys(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((articleKey, index) => articleKey === right[index])
  );
}