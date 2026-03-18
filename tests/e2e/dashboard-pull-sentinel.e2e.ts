import type { Page } from "@playwright/test";

import { expectPreviewDashboard, firstArticleCard } from "./helpers";
import { expect, test } from "./test";

interface PullFrameSample {
  firstRowTop: number;
  frame: number;
  scrollTop: number;
  sentinelState: string;
}

/** Collects requestAnimationFrame-aligned samples for a wheel pull on the live dashboard feed. */
async function collectWheelPullFrames(page: Page) {
  const viewportRect = await page.evaluate(() => {
    const viewports = [...document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]")];
    const viewport = viewports.reduce<HTMLElement | null>((selected, candidate) => {
      if (!selected) {
        return candidate;
      }

      return candidate.scrollHeight > selected.scrollHeight ? candidate : selected;
    }, null);
    if (!viewport) {
      throw new Error("Expected dashboard feed viewport to exist.");
    }

    viewport.scrollTop = 110;
    const rect = viewport.getBoundingClientRect();

    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
  });

  await firstArticleCard(page).hover();
  await page.mouse.move(
    viewportRect.left + viewportRect.width / 2,
    viewportRect.top + Math.min(viewportRect.height / 2, 48),
  );

  const readFrame = async (frame: number) => {
    return await page.evaluate((nextFrame) => {
      const viewports = [...document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]")];
      const viewport = viewports.reduce<HTMLElement | null>((selected, candidate) => {
        if (!selected) {
          return candidate;
        }

        return candidate.scrollHeight > selected.scrollHeight ? candidate : selected;
      }, null);
      const sentinel = document.querySelector<HTMLElement>("[data-dashboard-pull-sentinel='true']");
      const firstRow = document.querySelector<HTMLElement>("[data-feed-row-state]");
      if (!viewport || !sentinel || !firstRow) {
        throw new Error("Expected feed viewport, pull sentinel, and first feed row to exist.");
      }

      return {
        firstRowTop:
          firstRow.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
        frame: nextFrame,
        scrollTop: viewport.scrollTop,
        sentinelState: sentinel.dataset.dashboardPullState ?? "idle",
      };
    }, frame);
  };

  const samples = [await readFrame(0)];
  for (let frame = 1; frame <= 4; frame += 1) {
    await page.mouse.wheel(0, -18);
    await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    samples.push(await readFrame(frame));
  }

  return samples;
}

/** Verifies that pull frames move in a single direction without rebounding toward the hidden rest offset. */
function expectMonotonicPullFrames(label: string, samples: PullFrameSample[]) {
  expect(samples).toHaveLength(5);
  expect(samples[0]?.scrollTop).toBe(110);
  expect(samples.at(-1)?.scrollTop ?? Number.POSITIVE_INFINITY).toBeLessThan(90);
  expect(samples.some((sample) => sample.sentinelState !== "idle")).toBe(true);

  for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
    const current = samples[sampleIndex];
    const previous = samples[sampleIndex - 1];
    const scrollTopDelta = current.scrollTop - previous.scrollTop;
    if (scrollTopDelta > 1) {
      throw new Error(
        `${label} scrollTop rebounded upward between frames ${previous.frame} and ${current.frame}. Samples: ${JSON.stringify(samples)}`,
      );
    }

    const firstRowDelta = current.firstRowTop - previous.firstRowTop;
    if (firstRowDelta < -1) {
      throw new Error(
        `${label} first row moved upward during the active pull between frames ${previous.frame} and ${current.frame}. Samples: ${JSON.stringify(samples)}`,
      );
    }
  }
}

/** Waits until the live feed surface is idle and stable across consecutive animation frames. */
async function waitForStablePullSurface(page: Page) {
  await page.evaluate(async () => {
    const resolveFeedViewport = () => {
      const viewports = [...document.querySelectorAll<HTMLElement>("[data-radix-scroll-area-viewport]")];
      return viewports.reduce<HTMLElement | null>((selected, candidate) => {
        if (!selected) {
          return candidate;
        }

        return candidate.scrollHeight > selected.scrollHeight ? candidate : selected;
      }, null);
    };

    let stableFrameCount = 0;
    let previousFirstRowTop = Number.NaN;
    let previousScrollTop = Number.NaN;

    for (let frame = 0; frame < 180; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

      const viewport = resolveFeedViewport();
      const sentinel = document.querySelector<HTMLElement>("[data-dashboard-pull-sentinel='true']");
      const firstRow = document.querySelector<HTMLElement>("[data-feed-row-state]");
      if (!viewport || !sentinel || !firstRow) {
        stableFrameCount = 0;
        continue;
      }

      const scrollTop = viewport.scrollTop;
      const firstRowTop =
        firstRow.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      const isStableFrame =
        sentinel.dataset.dashboardPullState === "idle" &&
        Math.abs(scrollTop - previousScrollTop) <= 1 &&
        Math.abs(firstRowTop - previousFirstRowTop) <= 1;

      stableFrameCount = isStableFrame ? stableFrameCount + 1 : 0;
      previousScrollTop = scrollTop;
      previousFirstRowTop = firstRowTop;

      if (stableFrameCount >= 3) {
        return;
      }
    }

    throw new Error("Expected the dashboard pull surface to settle before sampling frames.");
  });
}

test.describe("dashboard pull sentinel", () => {
  test("wheel pull enters the sentinel without frame-to-frame rebound", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
    await waitForStablePullSurface(page);

    const samples = await collectWheelPullFrames(page);

    expectMonotonicPullFrames("wheel pull", samples);
  });
});