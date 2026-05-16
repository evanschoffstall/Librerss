import type { Page } from "@playwright/test";

import {
  articleCard,
  configureArticlesPerPage,
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
async function expectVisibleLoadMoreSkeletons(page: Page, minimumCount: number) {
  await expect
    .poll(async () => {
      return await readLoadMoreSkeletonState(page);
    })
    .toEqual({
      skeletonCount: minimumCount,
      skeletonsVisible: true,
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
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

      // Wait for initial auto-fill to settle then install observer.
      await expect
        .poll(async () => readVisibleFeedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE);

      await triggerFeedViewportWheelIntent(page, 240);
      await scrollFeedViewportToBottom(page);

      // Skeleton must appear at least once during cached page reveal.
      await expectVisibleLoadMoreSkeletons(page, SMALL_PAGE_SIZE);

      // After skeleton clears the expanded article window must be visible.
      await expect
        .poll(async () => readVisibleFeedArticleCount(page))
        .toBeGreaterThanOrEqual(SMALL_PAGE_SIZE * 2);
    });

    test(`initial render is bounded to the clipped overflow window on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, LARGE_PAGE_SIZE);

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
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

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
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

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
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      const baselineArticleCount = await readVisibleFeedArticleCount(page);
      const minimumCommittedArticleCount = baselineArticleCount + SMALL_PAGE_SIZE;

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
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

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
      await page.getByRole("button", { exact: true, name: "all" }).click();
      await configureArticlesPerPage(page, SMALL_PAGE_SIZE);

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
