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

  test("restores feed scroll after expanding and collapsing a lower article", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    await setFeedViewportScrollTop(page, 900);
    await expect
      .poll(async () => (await readFeedViewportMetrics(page)).scrollTop)
      .toBeGreaterThan(850);

    const initialScrollTop = (await readFeedViewportMetrics(page)).scrollTop;
    const articleKey = await readArticleKey(articleCard(page, 7));
  const article = articleCardByKey(page, articleKey);

    await article.scrollIntoViewIfNeeded();
    await toggleArticle(article);

    await expectArticleExpanded(article, true);

    await toggleArticle(article);

    await expectArticleExpanded(article, false);
    await expect
      .poll(
        async () =>
          Math.abs((await readFeedViewportMetrics(page)).scrollTop - initialScrollTop),
      )
      .toBeLessThan(48);
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
});