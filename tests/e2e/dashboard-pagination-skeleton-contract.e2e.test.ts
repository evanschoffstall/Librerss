import type { Page } from "@playwright/test";

import {
  applyDashboardPreferencesForTest,
  articleCard,
  gotoPreviewDashboard,
  hasLoadMoreSentinel,
  installDeterministicFeedBatchRoute,
  readLoadMoreSkeletonState,
  readVisibleFeedArticleCount,
  scrollFeedViewportToBottom,
  setFeedViewportScrollTop,
  triggerFeedViewportWheelIntent,
} from "./helpers";
import { expect, test } from "./test";

interface DesktopViewportCase {
  height: number;
  name: string;
  width: number;
}

interface EnteringRowSeamProbeResult {
  sawEnteringRow: boolean;
  sawEnteringRowWithoutSkeleton: boolean;
  sawZeroHeightEnteringRow: boolean;
}

interface EnteringRowSeamProbeWindow extends Window {
  __librerssEnteringRowSeamProbe?: {
    disconnect: () => void;
    sawEnteringRow: boolean;
    sawEnteringRowWithoutSkeleton: boolean;
    sawZeroHeightEnteringRow: boolean;
  };
}

interface LoadMoreSkeletonGapSample {
  boundaryGap: null | number;
  skeletonGap: null | number;
}

interface SkeletonContinuitySample {
  articleCount: number;
  skeletonCount: number;
  skeletonsVisible: boolean;
}

const DESKTOP_VIEWPORT_CASES: DesktopViewportCase[] = [
  { height: 640, name: "compact desktop", width: 1024 },
  { height: 780, name: "wide desktop", width: 1440 },
];

const SMALL_PAGE_SIZE = 4;
const LARGE_PAGE_SIZE = 8;
const ROW_GAP_MATCH_TOLERANCE_PX = 0.5;

/** Asserts that a measured pagination gap tracks hydrated article spacing. */
function expectPaginationGapToMatchHydratedRows(
  paginationGap: null | number,
  hydratedArticleRowGap: number,
) {
  expect(paginationGap).not.toBeNull();
  expect(
    Math.abs((paginationGap ?? 0) - hydratedArticleRowGap),
  ).toBeLessThanOrEqual(ROW_GAP_MATCH_TOLERANCE_PX);
}

/**
 * Asserts that skeleton visibility does not drop after the transition begins.
 * @param samples - The ordered skeleton visibility samples to inspect.
 */
function expectSkeletonsToStayVisibleUntilArticleCommit(
  samples: SkeletonContinuitySample[],
) {
  const firstSkeletonIndex = samples.findIndex(
    (sample) => sample.skeletonsVisible,
  );
  expect(firstSkeletonIndex).toBeGreaterThanOrEqual(0);

  const committedArticleCount = samples.at(-1)?.articleCount ?? 0;
  const firstCommittedArticleIndex = samples.findIndex(
    (sample) => sample.articleCount >= committedArticleCount,
  );
  const hiddenSamplesBeforeCommit = samples
    .slice(firstSkeletonIndex, firstCommittedArticleIndex)
    .filter((sample) => !sample.skeletonsVisible);

  expect(hiddenSamplesBeforeCommit).toEqual([]);
}

/** Waits for the active feed surface to expose load-more skeletons. */
async function expectVisibleLoadMoreSkeletons(
  page: Page,
  minimumCount: number,
) {
  await expect
    .poll(async () => {
      return await readLoadMoreSkeletonState(page);
    })
    .toEqual({
      skeletonCount: minimumCount,
      skeletonsVisible: true,
    });
}

/** Reads the visible gap between the first two hydrated article rows. */
async function readHydratedArticleRowGap(page: Page) {
  return await page.evaluate(() => {
    const articleRows = Array.from(
      document.querySelectorAll<HTMLElement>("[data-scroll-restore-key]"),
    ).filter((row) => row.querySelector("article[data-article-key]") !== null);
    const firstRowRect = articleRows[0]?.getBoundingClientRect();
    const secondRowRect = articleRows[1]?.getBoundingClientRect();

    if (!firstRowRect || !secondRowRect) {
      return null;
    }

    return Math.round((secondRowRect.top - firstRowRect.bottom) * 100) / 100;
  });
}

/**
 * Samples the scroll-pagination transition until the next article page commits.
 * @param page - The dashboard page under test.
 * @param baselineArticleCount - The rendered article count before scrolling.
 * @param minimumCommittedArticleCount - The article count that proves hydration finished.
 * @returns The ordered skeleton visibility samples captured during the transition.
 */
async function sampleSkeletonContinuityUntilArticleCommit(
  page: Page,
  baselineArticleCount: number,
  minimumCommittedArticleCount: number,
): Promise<SkeletonContinuitySample[]> {
  const samples: SkeletonContinuitySample[] = [];
  const deadline = Date.now() + 4_000;

  while (Date.now() < deadline) {
    const skeletonState = await readLoadMoreSkeletonState(page);
    const articleCount = await readVisibleFeedArticleCount(page);
    samples.push({
      articleCount,
      skeletonCount: skeletonState.skeletonCount,
      skeletonsVisible: skeletonState.skeletonsVisible,
    });

    if (
      articleCount >= minimumCommittedArticleCount &&
      samples.some((sample) => sample.skeletonsVisible)
    ) {
      return samples;
    }

    await page.waitForTimeout(16);
  }

  throw new Error(
    `Expected pagination to commit from ${baselineArticleCount} to at least ${minimumCommittedArticleCount} articles while skeleton samples were captured: ${JSON.stringify(samples)}`,
  );
}

/** Starts a DOM observer that verifies entering article rows keep skeleton backing. */
async function startEnteringRowSeamProbe(page: Page) {
  await page.evaluate(() => {
    const probeWindow = window as EnteringRowSeamProbeWindow;
    probeWindow.__librerssEnteringRowSeamProbe?.disconnect();

    const probe = {
      disconnect: () => observer.disconnect(),
      sawEnteringRow: false,
      sawEnteringRowWithoutSkeleton: false,
      sawZeroHeightEnteringRow: false,
    };
    const inspectEnteringRows = () => {
      const enteringRows = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-article-entering="true"]',
        ),
      );

      for (const row of enteringRows) {
        probe.sawEnteringRow = true;

        const rowRect = row.getBoundingClientRect();
        const hasSkeletonBacking =
          row.querySelector('[data-feed-row-enter-skeleton="true"]') !== null;

        if (rowRect.height <= 0) {
          probe.sawZeroHeightEnteringRow = true;
        }

        if (!hasSkeletonBacking) {
          probe.sawEnteringRowWithoutSkeleton = true;
        }
      }
    };
    const observer = new MutationObserver(inspectEnteringRows);

    observer.observe(document.body, {
      attributeFilter: ["data-article-entering"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    probeWindow.__librerssEnteringRowSeamProbe = probe;
    inspectEnteringRows();
  });
}

/** Stops the entering-row seam observer and returns the captured flags. */
async function stopEnteringRowSeamProbe(
  page: Page,
): Promise<EnteringRowSeamProbeResult> {
  return await page.evaluate(() => {
    const probeWindow = window as EnteringRowSeamProbeWindow;
    const probe = probeWindow.__librerssEnteringRowSeamProbe;

    if (!probe) {
      return {
        sawEnteringRow: false,
        sawEnteringRowWithoutSkeleton: true,
        sawZeroHeightEnteringRow: true,
      };
    }

    probe.disconnect();
    delete probeWindow.__librerssEnteringRowSeamProbe;

    return {
      sawEnteringRow: probe.sawEnteringRow,
      sawEnteringRowWithoutSkeleton: probe.sawEnteringRowWithoutSkeleton,
      sawZeroHeightEnteringRow: probe.sawZeroHeightEnteringRow,
    };
  });
}

/** Waits for the next pagination skeleton frame and captures its row gaps. */
async function waitForLoadMoreSkeletonGaps(
  page: Page,
): Promise<LoadMoreSkeletonGapSample> {
  const sampleHandle = await page.waitForFunction(() => {
    const articleRows = Array.from(
      document.querySelectorAll<HTMLElement>("[data-scroll-restore-key]"),
    ).filter((row) => row.querySelector("article[data-article-key]") !== null);
    const skeletonRows = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-feed-load-more-skeletons="true"] [data-dashboard-feed-list-skeleton-item="true"]',
      ),
    );
    const firstRowRect = skeletonRows[0]?.getBoundingClientRect();
    const secondRowRect = skeletonRows[1]?.getBoundingClientRect();
    const lastArticleRowRect = firstRowRect
      ? articleRows
          .map((row) => row.getBoundingClientRect())
          .filter((rowRect) => rowRect.bottom <= firstRowRect.top)
          .at(-1)
      : undefined;

    if (!lastArticleRowRect || !firstRowRect || !secondRowRect) {
      return null;
    }

    const boundaryGap =
      Math.round((firstRowRect.top - lastArticleRowRect.bottom) * 100) / 100;
    const skeletonGap =
      Math.round((secondRowRect.top - firstRowRect.bottom) * 100) / 100;

    if (boundaryGap <= 0 || skeletonGap <= 0) {
      return null;
    }

    return {
      boundaryGap,
      skeletonGap,
    };
  });

  const sample = await sampleHandle.jsonValue();
  if (sample === null) {
    throw new Error("Expected pagination skeleton gaps to be captured.");
  }

  return sample;
}

test.describe("pagination skeleton contract", () => {
  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
    test(`shows load-more skeletons during scroll-triggered cached page reveal on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await applyDashboardPreferencesForTest(page, {
        articleFilter: "all",
        articlesPerPage: SMALL_PAGE_SIZE,
      });

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      // Wait for initial auto-fill to settle then install observer.
      await expect
        .poll(async () => readVisibleFeedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE);
      const hydratedArticleRowGap = await readHydratedArticleRowGap(page);
      if (hydratedArticleRowGap === null) {
        throw new Error("Expected hydrated article row gap to be measurable.");
      }

      const loadMoreSkeletonGapsPromise = waitForLoadMoreSkeletonGaps(page);
      await startEnteringRowSeamProbe(page);
      await triggerFeedViewportWheelIntent(page, 240);
      await scrollFeedViewportToBottom(page);

      // Skeleton must appear at least once during cached page reveal.
      await expectVisibleLoadMoreSkeletons(page, SMALL_PAGE_SIZE);
      const loadMoreSkeletonGaps = await loadMoreSkeletonGapsPromise;
      expectPaginationGapToMatchHydratedRows(
        loadMoreSkeletonGaps.boundaryGap,
        hydratedArticleRowGap,
      );
      expectPaginationGapToMatchHydratedRows(
        loadMoreSkeletonGaps.skeletonGap,
        hydratedArticleRowGap,
      );

      // After skeleton clears the expanded article window must be visible.
      await expect
        .poll(async () => readVisibleFeedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE * 2);

      const seamProbeResult = await stopEnteringRowSeamProbe(page);
      expect(seamProbeResult.sawEnteringRow).toBe(true);
      expect(seamProbeResult.sawEnteringRowWithoutSkeleton).toBe(false);
      expect(seamProbeResult.sawZeroHeightEnteringRow).toBe(false);
    });

    test(`initial render is bounded to the clipped overflow window on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await applyDashboardPreferencesForTest(page, {
        articleFilter: "all",
        articlesPerPage: LARGE_PAGE_SIZE,
      });

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      // Before any user-initiated scroll the rendered window must not exceed
      // the clipped-overflow window for the configured page.
      await expect
        .poll(async () => readVisibleFeedArticleCount(page))
        .toBeLessThan(LARGE_PAGE_SIZE * 2);

      // The load-more sentinel must still be present so infinite scroll works.
      await expect.poll(async () => hasLoadMoreSentinel(page)).toBe(true);
    });

    test(`sentinel is present after initial hydration on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await applyDashboardPreferencesForTest(page, {
        articleFilter: "all",
        articlesPerPage: SMALL_PAGE_SIZE,
      });

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      // Sentinel must be in the DOM from the very first render because the
      // server always has more articles than the initial page.
      await expect.poll(async () => hasLoadMoreSentinel(page)).toBe(true);
    });

    test(`skeletons appear on every additional load during multi-page scroll on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await applyDashboardPreferencesForTest(page, {
        articleFilter: "all",
        articlesPerPage: SMALL_PAGE_SIZE,
      });

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => readVisibleFeedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE);

      // Scroll to bottom three times to trigger multiple page expansions.
      await triggerFeedViewportWheelIntent(page, 240);
      await scrollFeedViewportToBottom(page);
      await expectVisibleLoadMoreSkeletons(page, SMALL_PAGE_SIZE);
      await triggerFeedViewportWheelIntent(page, 240);
      await scrollFeedViewportToBottom(page);
      await expectVisibleLoadMoreSkeletons(page, SMALL_PAGE_SIZE);

      // Article window must span at least three configured pages.
      await expect
        .poll(async () => readVisibleFeedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE * 3);
    });

    test(`scroll-triggered server skeletons stay visible until articles commit on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });
      await installDeterministicFeedBatchRoute(page, {
        respectArticleLimit: true,
        responseDelayMs: 180,
        totalArticlesPerFeed: 24,
      });

      await gotoPreviewDashboard(page);
      await applyDashboardPreferencesForTest(page, {
        articleFilter: "all",
        articlesPerPage: SMALL_PAGE_SIZE,
      });

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      const baselineArticleCount = await readVisibleFeedArticleCount(page);
      const minimumCommittedArticleCount =
        baselineArticleCount + SMALL_PAGE_SIZE;

      await triggerFeedViewportWheelIntent(page, 240);
      await scrollFeedViewportToBottom(page);

      const samples = await sampleSkeletonContinuityUntilArticleCommit(
        page,
        baselineArticleCount,
        minimumCommittedArticleCount,
      );

      expectSkeletonsToStayVisibleUntilArticleCommit(samples);
    });

    test(`scroll-triggered reveal does not collapse to zero articles on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await applyDashboardPreferencesForTest(page, {
        articleFilter: "all",
        articlesPerPage: SMALL_PAGE_SIZE,
      });

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      await triggerFeedViewportWheelIntent(page, 240);
      await scrollFeedViewportToBottom(page);

      // During or after the skeleton phase there must always be at least
      // the initial page of articles rendered — never a blank flash.
      await expect
        .poll(async () => readVisibleFeedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE);
    });

    test(`reset cancels any in-flight cached reveal so stale count is never committed on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await applyDashboardPreferencesForTest(page, {
        articleFilter: "all",
        articlesPerPage: SMALL_PAGE_SIZE,
      });

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => readVisibleFeedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE);

      // Scroll to 70 % — near but not at the load-more boundary.
      const metrics = await page.evaluate(() => {
        const vp = document.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        return vp
          ? { maxScrollTop: Math.max(0, vp.scrollHeight - vp.clientHeight) }
          : { maxScrollTop: 0 };
      });
      await setFeedViewportScrollTop(
        page,
        Math.floor(metrics.maxScrollTop * 0.7),
      );

      // Trigger a refresh which internally calls resetPaginationState and
      // must cancel any in-flight cached reveal.
      await page
        .getByRole("button", { exact: true, name: "Refresh selected feed" })
        .click();

      // After reset the article window may temporarily shrink back toward 1
      // page but must never show more than 2 pages of stale content.
      await expect
        .poll(async () => readVisibleFeedArticleCount(page))
        .toBeLessThanOrEqual(SMALL_PAGE_SIZE * 2);
    });
  }
});
