import type { Page } from "@playwright/test";

import {
  articleCard,
  articleCardByKey,
  articleRow,
  expectArticleExpanded,
  expectNotClipped,
  expectPreviewDashboard,
  readArticleKey,
  readFeedViewportMetrics,
  selectExpandedArticleText,
  setFeedViewportScrollTop,
  toggleArticle,
} from "./helpers";
import { expect, test } from "./test";

interface TouchDragOptions {
  endXRatio: number;
  endYRatio: number;
  measureTarget?: ReturnType<typeof articleCard>;
  startXRatio: number;
  startYRatio: number;
  steps?: number;
}

async function dragTouchSurface(
  target: ReturnType<typeof articleCard>,
  {
    endXRatio,
    endYRatio,
    measureTarget = target,
    startXRatio,
    startYRatio,
    steps = 6,
  }: TouchDragOptions,
) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();

  if (!box) {
    throw new Error("Expected touch target to have a measurable bounding box.");
  }

  const startX = box.x + box.width * startXRatio;
  const startY = box.y + box.height * startYRatio;
  const endX = box.x + box.width * endXRatio;
  const endY = box.y + box.height * endYRatio;
  const pointerId = Math.floor(Date.now() % 10_000) + 1;

  await target.dispatchEvent("pointerdown", {
    clientX: startX,
    clientY: startY,
    pointerId,
    pointerType: "touch",
  });

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    await target.dispatchEvent("pointermove", {
      clientX: startX + (endX - startX) * progress,
      clientY: startY + (endY - startY) * progress,
      pointerId,
      pointerType: "touch",
    });
  }

  const swipeSignalDuringDrag = await measureTarget.evaluate((node) => {
    return {
      swipeActive:
        node.getAttribute("data-swipe-active") === "true",
      swipeDirection: node.getAttribute("data-swipe-direction") ?? "idle",
    };
  });

  await target.dispatchEvent("pointerup", {
    clientX: endX,
    clientY: endY,
    pointerId,
    pointerType: "touch",
  });

  return swipeSignalDuringDrag;
}

/** Returns the largest scroll-area viewport that contains article cards. */
function feedScrollViewport(page: Page) {
  return page
    .locator("[data-radix-scroll-area-viewport]")
    .filter({ has: page.locator("article[data-article-key]") })
    .first();
}

async function openPreviewDashboardOnMobile(page: Parameters<typeof expectPreviewDashboard>[0]) {
  await expectPreviewDashboard(page);
}

test.describe("dashboard mobile gestures", () => {
  test("keeps expanded article reading interactions from collapsing the card", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await openPreviewDashboardOnMobile(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = articleCard(page, 0);
    await toggleArticle(article);
    await expectArticleExpanded(article, true);

    await expect
      .poll(async () => {
        return (await selectExpandedArticleText(article)).length;
      })
      .toBeGreaterThan(20);
    await expectArticleExpanded(article, true);
    await expect(articleRow(article)).toHaveAttribute(
      "data-feed-row-animation",
      "idle",
    );
    await expect(articleRow(article)).toHaveAttribute(
      "data-feed-row-state",
      "idle",
    );
  });

  test("commits swipe-to-read on expanded header of mobile articles", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await openPreviewDashboardOnMobile(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = articleCard(page, 1);
    await toggleArticle(article);
    await expectArticleExpanded(article, true);

    const headerZone = article.locator("[data-article-swipe-zone='header']");
    const swipeSignalDuringDrag = await dragTouchSurface(
      headerZone,
      {
      endXRatio: 0.94,
      endYRatio: 0.58,
      measureTarget: article,
      startXRatio: 0.2,
      startYRatio: 0.46,
      steps: 7,
      },
    );

    expect(swipeSignalDuringDrag.swipeActive).toBe(true);
    expect(swipeSignalDuringDrag.swipeDirection).toBe("read");
    await expectArticleExpanded(article, false);
  });

  test("requires clearly horizontal intent before mobile swipe-read commits", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await openPreviewDashboardOnMobile(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = articleCard(page, 0);

    const diagonalResult = await dragTouchSurface(article, {
      endXRatio: 0.4,
      endYRatio: 0.88,
      startXRatio: 0.24,
      startYRatio: 0.18,
      steps: 7,
    });

    expect(diagonalResult.swipeActive).toBe(false);
    expect(diagonalResult.swipeDirection).toBe("idle");
    await expectArticleExpanded(article, false);
    await expect(
      article.getByRole("button", { name: "Mark as read" }),
    ).toBeVisible();

    const committedSwipeResult = await dragTouchSurface(article, {
      endXRatio: 0.92,
      endYRatio: 0.56,
      startXRatio: 0.24,
      startYRatio: 0.48,
      steps: 7,
    });

    expect(committedSwipeResult.swipeActive).toBe(true);
    expect(committedSwipeResult.swipeDirection).toBe("read");
    await expect(
      article.getByRole("button", { name: "Mark as unread" }),
    ).toBeVisible();
    await expectArticleExpanded(article, false);
  });

  test("keeps lower mobile cards interactive after expand and collapse", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await openPreviewDashboardOnMobile(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const { clientHeight, scrollHeight } = await readFeedViewportMetrics(page);
    const targetScrollTop = Math.max(
      0,
      Math.min(900, scrollHeight - clientHeight - 24),
    );

    await setFeedViewportScrollTop(page, targetScrollTop);
    await expect
      .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
      .toBeGreaterThan(Math.max(0, targetScrollTop - 48));

    const initialScrollTop = (await readFeedViewportMetrics(page)).scrollTop;
    const renderedArticleCount = await page
      .locator("article[data-article-key]")
      .count();
    const articleIndex = Math.max(0, renderedArticleCount - 2);
    const articleKey = await readArticleKey(articleCard(page, articleIndex));
    const article = articleCardByKey(page, articleKey);

    await toggleArticle(article);
    await expectArticleExpanded(article, true);
    await expect(articleRow(article)).toHaveAttribute(
      "data-feed-row-animation",
      "idle",
    );
    await expect(articleRow(article)).toHaveAttribute(
      "data-feed-row-state",
      "idle",
    );

    await toggleArticle(article);
    await expectArticleExpanded(article, false);
    await expect
      .poll(
        async () => (await readFeedViewportMetrics(page)).scrollTop,
      )
      .toBeGreaterThan(0);
    await expectNotClipped(
      article,
      feedScrollViewport(page),
      "article card after mobile expand-collapse",
    );
    expect(initialScrollTop).toBeGreaterThan(0);
  });
});