import {
  articleCard,
  articleCardByKey,
  articleRow,
  expectArticleExpanded,
  expectNotClipped,
  gotoPreviewDashboard,
  readArticleKey,
  readFeedViewportMetrics,
  setFeedViewportScrollTop,
  toggleArticle,
  waitForPreviewDashboardHydration,
} from "./helpers";
import { expect, test } from "./test";

/** Returns the largest scroll-area viewport that contains article cards. */
function feedScrollViewport(article: ReturnType<typeof articleCard>) {
  return article.locator(
    "xpath=ancestor::*[@data-radix-scroll-area-viewport][1]",
  );
}

/** Toggles the currently visible article surface without recentering it first. */
async function toggleVisibleArticleSurface(article: ReturnType<typeof articleCard>) {
  const previousExpandedState = await article.getAttribute("aria-expanded");

  await article.evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      throw new Error("Expected the article surface to resolve to an element.");
    }

    node.click();
  });

  await expect
    .poll(async () => await article.getAttribute("aria-expanded"))
    .not.toBe(previousExpandedState);
}

test.describe("dashboard explore article interactions", () => {
  test("expands an explore article without changing row animation state", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = articleCard(page, 0);
    const row = articleRow(article);

    await expectArticleExpanded(article, false);
    await expect(row).toHaveAttribute("data-feed-row-animation", "idle");
    await expect(row).toHaveAttribute("data-feed-row-state", "idle");
    await expect(article.locator("[data-article-preview='true']")).toHaveCount(
      1,
    );

    await toggleArticle(article);

    await expectArticleExpanded(article, true);
    await expect(row).toHaveAttribute("data-feed-row-animation", "idle");
    await expect(row).toHaveAttribute("data-feed-row-state", "idle");
    await expect(article.locator("[data-article-preview='true']")).toHaveCount(
      0,
    );
    await expect(
      article.getByRole("link", { name: "Open article" }),
    ).toBeVisible();
    await expect(
      article.getByRole("button", { name: "Share article options" }),
    ).toBeVisible();
  });

  test("keeps lower-card expand and collapse interactions within the active feed viewport", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const { clientHeight, scrollHeight } = await readFeedViewportMetrics(page);
    const targetScrollTop = Math.max(
      0,
      Math.min(900, scrollHeight - clientHeight - 24),
    );

    if (targetScrollTop > 0) {
      await setFeedViewportScrollTop(page, targetScrollTop);
    }

    const initialScrollTop = (await readFeedViewportMetrics(page)).scrollTop;
    const renderedArticleCount = await page
      .locator("article[data-article-key]:visible")
      .count();
    const articleIndex = Math.max(0, renderedArticleCount - 2);
    const articleKey = await readArticleKey(articleCard(page, articleIndex));
    const article = articleCardByKey(page, articleKey);

    await toggleArticle(article);

    await expectArticleExpanded(article, true);

    await toggleArticle(article);

    await expectArticleExpanded(article, false);
    if (initialScrollTop > 0) {
      await expect
        .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
        .toBeGreaterThan(0);
    }
    await expectNotClipped(
      article.locator("[data-article-swipe-zone='header']"),
      feedScrollViewport(article),
      "article header after collapse",
    );
    expect(initialScrollTop).toBeGreaterThanOrEqual(0);
  });

  test("restores the pre-expand viewport offset after collapsing from the bottom of a hydrated article", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await waitForPreviewDashboardHydration(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const { clientHeight, scrollHeight } = await readFeedViewportMetrics(page);
    const initialScrollTop = Math.max(
      0,
      Math.min(900, scrollHeight - clientHeight - 24),
    );

    if (initialScrollTop > 0) {
      await setFeedViewportScrollTop(page, initialScrollTop);
    }

    const renderedArticleCount = await page
      .locator("article[data-article-key]:visible")
      .count();
    const articleIndex = Math.max(0, renderedArticleCount - 2);
    const articleKey = await readArticleKey(articleCard(page, articleIndex));
    const article = articleCardByKey(page, articleKey);

    await toggleVisibleArticleSurface(article);
    await expectArticleExpanded(article, true);
    await expect
      .poll(async () => {
        return await article
          .locator('[data-article-hydration-state="loading"]')
          .count();
      })
      .toBe(0);

    const deepScrollTop = await article.evaluate((node) => {
      if (!(node instanceof HTMLElement)) {
        throw new Error("Expected the article surface to resolve to an element.");
      }

      const viewport = node.closest("[data-radix-scroll-area-viewport]");

      if (!(viewport instanceof HTMLElement)) {
        throw new Error("Expected the expanded article to stay inside a feed viewport.");
      }

      const articleRect = node.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const articleBottomOffset = articleRect.bottom - viewportRect.top;
      const nextScrollTop =
        viewport.scrollTop +
        Math.max(0, articleBottomOffset - viewport.clientHeight + 16);

      viewport.scrollTop = nextScrollTop;
      viewport.dispatchEvent(new Event("scroll"));

      return viewport.scrollTop;
    });

    expect(deepScrollTop).toBeGreaterThan(initialScrollTop);

    await toggleVisibleArticleSurface(article);
    await expectArticleExpanded(article, false);

    await expect
      .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
      .toBeCloseTo(initialScrollTop, 1);
  });

  test("keeps a single expanded article when switching between explore cards", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const firstArticleKey = await readArticleKey(articleCard(page, 0));
    const secondArticleKey = await readArticleKey(articleCard(page, 1));
    const firstArticle = articleCardByKey(page, firstArticleKey);
    const secondArticle = articleCardByKey(page, secondArticleKey);

    await toggleArticle(firstArticle);
    await expectArticleExpanded(firstArticle, true);

    await toggleArticle(secondArticle);

    await expectArticleExpanded(firstArticle, false);
    await expectArticleExpanded(secondArticle, true);
    await expect(articleRow(firstArticle)).toHaveAttribute(
      "data-feed-row-animation",
      "idle",
    );
    await expect(articleRow(firstArticle)).toHaveAttribute(
      "data-feed-row-state",
      "idle",
    );
    await expect(articleRow(secondArticle)).toHaveAttribute(
      "data-feed-row-animation",
      "idle",
    );
    await expect(articleRow(secondArticle)).toHaveAttribute(
      "data-feed-row-state",
      "idle",
    );
  });

  test("uses the same core expanded surface for several explore articles", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    for (const articleIndex of [0, 1, 2]) {
      await page.getByRole("button", { exact: true, name: "all" }).click();

      const articleKey = await readArticleKey(articleCard(page, articleIndex));
      const article = articleCardByKey(page, articleKey);
      const row = articleRow(article);

      await toggleArticle(article);

      await expectArticleExpanded(article, true);
      await expect(row).toHaveAttribute("data-feed-row-animation", "idle");
      await expect(row).toHaveAttribute("data-feed-row-state", "idle");
      await expect(
        article.locator("[data-article-preview='true']"),
      ).toHaveCount(0);
      await expect(
        article.getByRole("link", { name: "Open article" }),
      ).toBeVisible();
      await expect(
        article.getByRole("button", { name: "View raw article HTML" }),
      ).toBeVisible();

      await toggleArticle(article);
      await expectArticleExpanded(article, false);
    }
  });

  test("keeps an expanded article mounted and readable while the feed viewport scrolls", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = articleCard(page, 0);

    await toggleArticle(article);
    await expectArticleExpanded(article, true);

    const readExpandedOffsets = async () => {
      return await article.evaluate((node) => {
        const header = node.querySelector("[data-article-swipe-zone='header']");
        const viewport = node.closest("[data-radix-scroll-area-viewport]");

        if (
          !(header instanceof HTMLElement) ||
          !(node instanceof HTMLElement) ||
          !(viewport instanceof HTMLElement)
        ) {
          throw new Error(
            "Expected expanded article header and viewport to be present.",
          );
        }

        const articleRect = node.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const viewportRect = viewport.getBoundingClientRect();

        return {
          articleTop: articleRect.top,
          headerTop: headerRect.top,
          relativeTop: headerRect.top - articleRect.top,
          viewportTop: viewportRect.top,
        };
      });
    };

    const beforeScroll = await readExpandedOffsets();

    await setFeedViewportScrollTop(page, 600);

    await expect
      .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
      .toBeGreaterThanOrEqual(0);

    const afterScroll = await readExpandedOffsets();

    expect(Math.abs(beforeScroll.relativeTop)).toBeLessThan(8);
    expect(afterScroll.articleTop).toBeLessThanOrEqual(beforeScroll.articleTop);
    await expectArticleExpanded(article, true);
    await expect(
      article.locator("[data-article-swipe-zone='header']"),
    ).toBeVisible();
  });

  test("does not surface removed image placeholder feeds in explore mode", async ({
    page,
  }) => {
    await gotoPreviewDashboard(page);

    await expect(
      page.locator("button").filter({ hasText: "ESA Images" }),
    ).toHaveCount(0);
    await expect(
      page.locator("button").filter({ hasText: "NASA Image of the Day" }),
    ).toHaveCount(0);
  });
});
