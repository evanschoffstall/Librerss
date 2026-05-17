import type { Locator, Page, TestInfo } from "@playwright/test";

import { writeFile } from "node:fs/promises";

import {
  articleCard,
  articleCardByKey,
  expectArticleExpanded,
  firstArticleCard,
  gotoPreviewDashboard,
  readArticleKey,
  swipeArticle,
  toggleArticle,
} from "./helpers";
import { expect, test } from "./test";

const AUDIT_FRAME_TIMES_MS = process.env.CI
  ? ([0, 100, 250, 500] as const)
  : ([0, 100, 250] as const);
const SHOULD_CAPTURE_ALL_AUDIT_FRAMES = Boolean(process.env.CI);

interface AuditClip {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface AuditFrameMetrics {
  follower?: null | {
    height: number;
    opacity: number;
    top: number;
  };
  target?: null | {
    expanded: boolean;
    height: number;
    opacity: number;
    top: number;
  };
  timeMs: number;
}

async function attachAuditMetrics(
  metrics: AuditFrameMetrics[],
  testInfo: TestInfo,
  name: string,
) {
  const path = testInfo.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(metrics, null, 2), "utf8");
  await testInfo.attach(name, {
    contentType: "application/json",
    path,
  });
}

async function attachAuditScreenshot(
  page: Page,
  clip: AuditClip,
  testInfo: TestInfo,
  name: string,
) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ clip, path });
  await testInfo.attach(name, {
    contentType: "image/png",
    path,
  });
}

async function captureAuditTimeline(
  page: Page,
  clip: AuditClip,
  testInfo: TestInfo,
  name: string,
  readMetrics: (timeMs: number) => Promise<AuditFrameMetrics>,
) {
  let previousFrameTime = 0;
  const metrics: AuditFrameMetrics[] = [];

  for (const frameTime of AUDIT_FRAME_TIMES_MS) {
    const waitTime = frameTime - previousFrameTime;
    if (waitTime > 0) {
      await page.waitForTimeout(waitTime);
    }

    if (
      SHOULD_CAPTURE_ALL_AUDIT_FRAMES ||
      frameTime === AUDIT_FRAME_TIMES_MS.at(-1)
    ) {
      await attachAuditScreenshot(
        page,
        clip,
        testInfo,
        `${name}-${frameTime}ms`,
      );
    }
    metrics.push(await readMetrics(frameTime));
    previousFrameTime = frameTime;
  }

  await attachAuditMetrics(metrics, testInfo, `${name}-metrics`);
}

async function expectUnreadFeed(page: Page) {
  await page.getByRole("button", { name: "Unread" }).click();
  await expect(page.getByRole("button", { name: "Unread" })).toHaveClass(
    /bg-muted/,
  );
}

function filterBar(page: Page) {
  return page.locator("[data-dashboard-width-link='feed']").first();
}

async function readArticleMotionMetrics(
  page: Page,
  targetArticleKey: string,
  followerArticleKey: string,
  timeMs: number,
): Promise<AuditFrameMetrics> {
  return await page.evaluate(
    ({ nextFollowerKey, nextTargetKey, nextTimeMs }) => {
      const readMetrics = (articleKey: string) => {
        const article = [
          ...document.querySelectorAll<HTMLElement>(
            "article[data-article-key]",
          ),
        ].find((candidate) => candidate.dataset.articleKey === articleKey);

        if (!article) {
          return null;
        }

        const styles = getComputedStyle(article);
        return {
          expanded: article.getAttribute("aria-expanded") === "true",
          height: article.getBoundingClientRect().height,
          opacity: Number.parseFloat(styles.opacity || "1"),
          top: article.getBoundingClientRect().top,
        };
      };

      return {
        follower: readMetrics(nextFollowerKey),
        target: readMetrics(nextTargetKey),
        timeMs: nextTimeMs,
      };
    },
    {
      nextFollowerKey: followerArticleKey,
      nextTargetKey: targetArticleKey,
      nextTimeMs: timeMs,
    },
  );
}

async function readAuditClipForArticles(
  page: Page,
  articleKeys: string[],
): Promise<AuditClip> {
  return await page.evaluate((targetArticleKeys) => {
    const articles = targetArticleKeys
      .map((articleKey) => {
        return [
          ...document.querySelectorAll<HTMLElement>(
            "article[data-article-key]",
          ),
        ].find((candidate) => candidate.dataset.articleKey === articleKey);
      })
      .filter((article): article is HTMLElement => Boolean(article));

    if (articles.length === 0) {
      throw new Error(
        "Expected at least one article to be present for clip capture.",
      );
    }

    const viewport = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ),
    ].reduce<HTMLElement | null>((selected, candidate) => {
      if (!selected) {
        return candidate;
      }

      return candidate.scrollHeight > selected.scrollHeight
        ? candidate
        : selected;
    }, null);

    if (!viewport) {
      throw new Error("Expected a feed viewport for clip capture.");
    }

    const rects = articles.map((article) => article.getBoundingClientRect());
    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const left = viewport.getBoundingClientRect().left;
    const right = viewport.getBoundingClientRect().right;
    const padding = 24;
    const maxWidth = document.documentElement.clientWidth;
    const maxHeight = document.documentElement.clientHeight;

    return {
      height: Math.min(
        maxHeight - Math.max(0, top - padding),
        bottom - top + padding * 2,
      ),
      width: Math.min(
        maxWidth - Math.max(0, left - padding),
        right - left + padding * 2,
      ),
      x: Math.max(0, left - padding),
      y: Math.max(0, top - padding),
    };
  }, articleKeys);
}

async function readAuditClipForLocator(locator: Locator): Promise<AuditClip> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error(
      "Expected target locator to have a measurable bounding box.",
    );
  }

  const padding = 16;
  return {
    height: box.height + padding * 2,
    width: box.width + padding * 2,
    x: Math.max(0, box.x - padding),
    y: Math.max(0, box.y - padding),
  };
}

test.describe("dashboard visual audit", () => {
  test.describe.configure({ mode: "parallel" });

  test("captures expand and collapse audit frames", async ({
    page,
  }, testInfo) => {
    test.slow();

    await gotoPreviewDashboard(page);

    const article = firstArticleCard(page);
    const articleKey = await readArticleKey(article);
    const followerKey = await readArticleKey(articleCard(page, 1));
    const clip = await readAuditClipForArticles(page, [
      articleKey,
      followerKey,
    ]);

    await attachAuditScreenshot(page, clip, testInfo, "expand-before");
    await toggleArticle(article);
    await captureAuditTimeline(page, clip, testInfo, "expand", (timeMs) =>
      readArticleMotionMetrics(page, articleKey, followerKey, timeMs),
    );
    await expectArticleExpanded(article, true);

    await attachAuditScreenshot(page, clip, testInfo, "collapse-before");
    await toggleArticle(article);
    await captureAuditTimeline(page, clip, testInfo, "collapse", (timeMs) =>
      readArticleMotionMetrics(page, articleKey, followerKey, timeMs),
    );
    await expectArticleExpanded(article, false);
  });

  test("captures unread button-read and swipe-read audit frames", async ({
    page,
  }, testInfo) => {
    test.slow();

    await gotoPreviewDashboard(page);
    await expectUnreadFeed(page);

    const buttonReadArticle = firstArticleCard(page);
    const buttonReadKey = await readArticleKey(buttonReadArticle);
    const buttonReadFollowerKey = await readArticleKey(articleCard(page, 1));
    const buttonReadClip = await readAuditClipForArticles(page, [
      buttonReadKey,
      buttonReadFollowerKey,
    ]);

    await attachAuditScreenshot(
      page,
      buttonReadClip,
      testInfo,
      "button-read-before",
    );
    await buttonReadArticle
      .getByRole("button", { name: "Mark as read" })
      .click();
    await captureAuditTimeline(
      page,
      buttonReadClip,
      testInfo,
      "button-read",
      (timeMs) =>
        readArticleMotionMetrics(
          page,
          buttonReadKey,
          buttonReadFollowerKey,
          timeMs,
        ),
    );
    await expect(articleCardByKey(page, buttonReadKey)).toHaveCount(0);

    const swipeReadArticle = firstArticleCard(page);
    const swipeReadKey = await readArticleKey(swipeReadArticle);
    const swipeReadFollowerKey = await readArticleKey(articleCard(page, 1));
    const swipeReadClip = await readAuditClipForArticles(page, [
      swipeReadKey,
      swipeReadFollowerKey,
    ]);

    await attachAuditScreenshot(
      page,
      swipeReadClip,
      testInfo,
      "swipe-read-before",
    );
    await swipeArticle(swipeReadArticle, { endRatio: 0.92, startRatio: 0.24 });
    await captureAuditTimeline(
      page,
      swipeReadClip,
      testInfo,
      "swipe-read",
      (timeMs) =>
        readArticleMotionMetrics(
          page,
          swipeReadKey,
          swipeReadFollowerKey,
          timeMs,
        ),
    );
    await expect(articleCardByKey(page, swipeReadKey)).toHaveCount(0);
  });

  test("captures swipe-star and refresh audit frames", async ({
    page,
  }, testInfo) => {
    test.slow();

    await gotoPreviewDashboard(page);

    const starArticle = articleCard(page, 1);
    const starArticleKey = await readArticleKey(starArticle);
    const starFollowerKey = await readArticleKey(articleCard(page, 2));
    const starClip = await readAuditClipForArticles(page, [
      starArticleKey,
      starFollowerKey,
    ]);

    await attachAuditScreenshot(page, starClip, testInfo, "swipe-star-before");
    await swipeArticle(starArticle, { endRatio: 0.08, startRatio: 0.78 });
    await captureAuditTimeline(
      page,
      starClip,
      testInfo,
      "swipe-star",
      (timeMs) =>
        readArticleMotionMetrics(page, starArticleKey, starFollowerKey, timeMs),
    );
    await expect(
      starArticle.getByRole("button", { name: "Remove star" }),
    ).toBeVisible();

    const tokenBar = filterBar(page);
    const tokenBarClip = await readAuditClipForLocator(tokenBar);

    await attachAuditScreenshot(page, tokenBarClip, testInfo, "refresh-before");
    await page
      .locator('button[aria-label="Refresh selected feed"]:visible')
      .click();
    await captureAuditTimeline(
      page,
      tokenBarClip,
      testInfo,
      "refresh",
      async (timeMs) => ({
        timeMs,
      }),
    );
    await expect(page.getByText("demo", { exact: true })).toBeVisible();
  });
});
