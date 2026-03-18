import {
  articleCard,
  articleCardByKey,
  articleRow,
  expectArticleExpanded,
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

  test("keeps expanded header drags from dismissing mobile articles", async ({
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

    expect(swipeSignalDuringDrag.swipeActive).toBe(false);
    expect(swipeSignalDuringDrag.swipeDirection).toBe("idle");
    await expectArticleExpanded(article, true);
    await expect(articleRow(article)).toHaveAttribute(
      "data-feed-row-animation",
      "idle",
    );
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

  test("preserves mobile expand and collapse scroll stability for lower cards", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await openPreviewDashboardOnMobile(page);
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { exact: true, name: "all" }).click();

    await setFeedViewportScrollTop(page, 900);
    await expect
      .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
      .toBeGreaterThan(850);

    const initialScrollTop = (await readFeedViewportMetrics(page)).scrollTop;
  const articleKey = await readArticleKey(articleCard(page, 6));
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
        async () =>
          Math.abs((await readFeedViewportMetrics(page)).scrollTop - initialScrollTop),
      )
      .toBeLessThan(48);
  });
});