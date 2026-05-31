import type { Page } from "@playwright/test";

import {
  articleCard,
  articleCardByKey,
  articleRow,
  expectArticleExpanded,
  expectNotClipped,
  gotoPreviewDashboard,
  locateViewportArticle,
  readArticleKey,
  selectExpandedArticleText,
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

const MOBILE_INVERTED_SCROLL_STORAGE_KEY = "librerss:mobileInvertedScroll";

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
  await expect(target).toBeVisible({ timeout: 15_000 });
  await target.evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      throw new Error("Expected touch target to resolve to an element.");
    }

    node.scrollIntoView({ block: "center", inline: "nearest" });
  });
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
      swipeActive: node.getAttribute("data-swipe-active") === "true",
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

/** Returns the owning feed scroll container for an article card. */
function feedScrollViewport(article: ReturnType<typeof articleCard>) {
  return article.locator(
    "xpath=ancestor::*[@data-radix-scroll-area-viewport][1]",
  );
}

async function openPreviewDashboardOnMobile(page: Page) {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, JSON.stringify(false));
  }, MOBILE_INVERTED_SCROLL_STORAGE_KEY);
  await gotoPreviewDashboard(page);
}

test.describe("dashboard mobile gestures", () => {
  test("keeps expanded article reading interactions from collapsing the card", async ({
    page,
  }) => {
    await openPreviewDashboardOnMobile(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = await locateViewportArticle(page, 0);
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

  test("keeps expanded article body text selection active without breaking the card", async ({
    page,
  }) => {
    await openPreviewDashboardOnMobile(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = await locateViewportArticle(page, 0);
    await toggleArticle(article);
    await expectArticleExpanded(article, true);

    await expect
      .poll(async () => {
        return (await selectExpandedArticleText(article)).length;
      })
      .toBeGreaterThan(20);

    const contentZone = article.locator("[data-article-swipe-zone='content']");
    const swipeSignalDuringDrag = await dragTouchSurface(contentZone, {
      endXRatio: 0.82,
      endYRatio: 0.54,
      measureTarget: article,
      startXRatio: 0.2,
      startYRatio: 0.5,
      steps: 7,
    });

    expect(swipeSignalDuringDrag.swipeActive).toBe(false);
    expect(swipeSignalDuringDrag.swipeDirection).toBe("idle");
    await expectArticleExpanded(article, true);
    await expect
      .poll(async () => {
        return await article.evaluate((node) => {
          return (
            node.ownerDocument.defaultView?.getSelection()?.toString().trim()
              .length ?? 0
          );
        });
      })
      .toBeGreaterThan(20);
  });

  test("commits swipe-to-read from the expanded mobile article body when no selection is active", async ({
    page,
  }) => {
    await openPreviewDashboardOnMobile(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = await locateViewportArticle(page, 0);
    await toggleArticle(article);
    await expectArticleExpanded(article, true);

    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges();
    });

    const contentZone = article.locator("[data-article-swipe-zone='content']");
    const swipeSignalDuringDrag = await dragTouchSurface(contentZone, {
      endXRatio: 0.94,
      endYRatio: 0.56,
      measureTarget: article,
      startXRatio: 0.18,
      startYRatio: 0.48,
      steps: 7,
    });

    expect(swipeSignalDuringDrag.swipeActive).toBe(true);
    expect(swipeSignalDuringDrag.swipeDirection).toBe("read");
    await expectArticleExpanded(article, false);
  });

  test("commits swipe-to-read on expanded header of mobile articles", async ({
    page,
  }) => {
    await openPreviewDashboardOnMobile(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = await locateViewportArticle(page, 0);
    await toggleArticle(article);
    await expectArticleExpanded(article, true);

    const headerZone = article.locator("[data-article-swipe-zone='header']");
    const swipeSignalDuringDrag = await dragTouchSurface(headerZone, {
      endXRatio: 0.94,
      endYRatio: 0.58,
      measureTarget: article,
      startXRatio: 0.2,
      startYRatio: 0.46,
      steps: 7,
    });

    expect(swipeSignalDuringDrag.swipeActive).toBe(true);
    expect(swipeSignalDuringDrag.swipeDirection).toBe("read");
    await expectArticleExpanded(article, false);
  });

  test("requires clearly horizontal intent before mobile swipe-read commits", async ({
    page,
  }) => {
    await openPreviewDashboardOnMobile(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = await locateViewportArticle(page, 0);

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
    await openPreviewDashboardOnMobile(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();
    const visibleArticleCount = await page
      .locator("article[data-article-key]:visible")
      .count();
    const articleIndex = Math.max(0, visibleArticleCount - 2);
    const articleKey = await readArticleKey(
      await locateViewportArticle(page, articleIndex),
    );
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

    await article
      .locator("[data-article-swipe-zone='header']")
      .first()
      .click({ force: true });
    await expectArticleExpanded(article, false);
    await expectNotClipped(
      article,
      feedScrollViewport(article),
      "article card after mobile expand-collapse",
    );
  });
});
