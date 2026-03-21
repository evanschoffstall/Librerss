import {
    articleCard,
    articleCardByKey,
    articleRow,
    expectArticleExpanded,
    expectPreviewDashboard,
    readArticleKey,
    readFeedViewportMetrics,
    setFeedViewportScrollTop,
    toggleArticle,
} from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard explore article interactions", () => {
  test("expands an explore article without changing row animation state", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const article = articleCard(page, 0);
    const row = articleRow(article);

    await expectArticleExpanded(article, false);
    await expect(row).toHaveAttribute("data-feed-row-animation", "idle");
    await expect(row).toHaveAttribute("data-feed-row-state", "idle");
    await expect(article.locator("[data-article-preview='true']")).toHaveCount(1);

    await toggleArticle(article);

    await expectArticleExpanded(article, true);
    await expect(row).toHaveAttribute("data-feed-row-animation", "idle");
    await expect(row).toHaveAttribute("data-feed-row-state", "idle");
    await expect(article.locator("[data-article-preview='true']")).toHaveCount(0);
    await expect(article.getByRole("link", { name: "Open article" })).toBeVisible();
    await expect(
      article.getByRole("button", { name: "Share article options" }),
    ).toBeVisible();
  });

  test("keeps lower-card expand and collapse interactions within the active feed viewport", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const { clientHeight, scrollHeight } = await readFeedViewportMetrics(page);
    const targetScrollTop = Math.max(
      0,
      Math.min(900, scrollHeight - clientHeight - 24),
    );

    await setFeedViewportScrollTop(page, targetScrollTop);
    await expect
      .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
      .toBeGreaterThan(0);

    const initialScrollTop = (await readFeedViewportMetrics(page)).scrollTop;
    const renderedArticleCount = await page
      .locator("article[data-article-key]")
      .count();
    const articleIndex = Math.max(0, renderedArticleCount - 2);
    const articleKey = await readArticleKey(articleCard(page, articleIndex));
    const article = articleCardByKey(page, articleKey);

    await article.scrollIntoViewIfNeeded();
    await toggleArticle(article);

    await expectArticleExpanded(article, true);

    await toggleArticle(article);

    await expectArticleExpanded(article, false);
    await expect
      .poll(
        async () => (await readFeedViewportMetrics(page)).scrollTop,
      )
      .toBeGreaterThan(0);
    await expect(
      article.locator("[data-article-swipe-zone='header']"),
    ).toBeVisible();
    expect(initialScrollTop).toBeGreaterThan(0);
  });

  test("keeps a single expanded article when switching between explore cards", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
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
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
    for (const articleIndex of [0, 1, 2]) {
      await page.getByRole("button", { exact: true, name: "all" }).click();

      const articleKey = await readArticleKey(articleCard(page, articleIndex));
      const article = articleCardByKey(page, articleKey);
      const row = articleRow(article);

      await toggleArticle(article);

      await expectArticleExpanded(article, true);
      await expect(row).toHaveAttribute("data-feed-row-animation", "idle");
      await expect(row).toHaveAttribute("data-feed-row-state", "idle");
      await expect(article.locator("[data-article-preview='true']")).toHaveCount(0);
      await expect(article.getByRole("link", { name: "Open article" })).toBeVisible();
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
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
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
          throw new Error("Expected expanded article header and viewport to be present.");
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
      .toBeGreaterThan(500);

    const afterScroll = await readExpandedOffsets();

    expect(Math.abs(beforeScroll.relativeTop)).toBeLessThan(8);
    expect(afterScroll.articleTop).toBeLessThan(beforeScroll.articleTop - 500);
    await expectArticleExpanded(article, true);
    await expect(
      article.locator("[data-article-swipe-zone='header']"),
    ).toBeVisible();
  });
});