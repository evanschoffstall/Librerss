import {
    articleCard,
    articleCardByKey,
    expectArticleExpanded,
    expectPreviewDashboard,
    hasLoadMoreSentinel,
    openDashboardSettings,
    readArticleKey,
    readRenderedArticleCount,
    scrollFeedViewportToBottom,
    selectExpandedArticleText,
    swipeArticle,
    toggleArticle,
} from "./helpers";
import { expect, test } from "./test";

test.describe("dashboard interaction coverage", () => {
  test("covers article actions, expanded text selection, and collapse flows", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const articleKey = await readArticleKey(articleCard(page, 0));
    const article = articleCardByKey(page, articleKey);

    await article.hover();
    await article.getByRole("button", { name: "Mark as read" }).click();
    await expect(
      article.getByRole("button", { name: "Mark as unread" }),
    ).toBeVisible();

    await article.hover();
    await article.getByRole("button", { name: "Star article" }).click();
    await expect(
      article.getByRole("button", { name: "Remove star" }),
    ).toBeVisible();

    await toggleArticle(article);
    await expectArticleExpanded(article, true);
    await expect(article.getByRole("link", { name: "Open article" })).toHaveAttribute(
      "href",
      articleKey,
    );

    await article.getByRole("button", { name: "Share article options" }).click();
    await expect(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Email" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Share to Reddit" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Share to Bluesky" }),
    ).toBeVisible();

    await page.getByRole("menuitem", { name: "Copy link" }).click();
    await expect(page.getByRole("heading", { name: "Copy Link" })).toBeVisible();
    const articleLinkInput = page.getByLabel("Article link");

    await expect(articleLinkInput).toHaveValue(articleKey);
    await page.getByRole("button", { name: "Select" }).click();
    await expect
      .poll(async () => {
        return await articleLinkInput.evaluate((element) => {
          const input = element as HTMLInputElement;
          return (input.selectionEnd ?? 0) - (input.selectionStart ?? 0);
        });
      })
      .toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Copy Link" })).toHaveCount(0);

    await page.waitForTimeout(250);
    await article.hover();
    await article.getByRole("button", { name: "View raw article HTML" }).click();
    await expect(
      page.getByRole("heading", { name: "Raw Article HTML" }),
    ).toBeVisible();
    const rawHtmlInput = page.locator("textarea[aria-label='Raw article HTML']").last();

    await expect
      .poll(async () => {
        return (await rawHtmlInput.inputValue()).length;
      })
      .toBeGreaterThan(20);

    await page.getByRole("button", { name: "Select" }).click();
    await expect
      .poll(async () => {
        return await rawHtmlInput.evaluate((element) => {
          const textarea = element as HTMLTextAreaElement;
          return (textarea.selectionEnd ?? 0) - (textarea.selectionStart ?? 0);
        });
      })
      .toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Raw Article HTML" }),
    ).toHaveCount(0);

    const expandedArticle = page
      .locator("article[data-article-key][aria-expanded='true']")
      .first();

    await expect
      .poll(async () => {
        return (await selectExpandedArticleText(expandedArticle)).length;
      })
      .toBeGreaterThan(20);
    await expectArticleExpanded(expandedArticle, true);

    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges();
    });
    await expandedArticle.focus();
    await expandedArticle.press("Enter");
    await expectArticleExpanded(article, false);
  });

  test("covers preview-safe toolbar and filter controls", async ({ page }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);

    const initialThemeIsDark = await page.evaluate(() => {
      return document.documentElement.classList.contains("dark");
    });

    await page.getByRole("button", { name: /Switch to .* mode|Toggle theme/ }).click();
    await expect
      .poll(async () => {
        return await page.evaluate(() => {
          return document.documentElement.classList.contains("dark");
        });
      })
      .toBe(!initialThemeIsDark);

    await page.getByRole("button", { name: "Refresh selected feed" }).click();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    const firstArticleTitle =
      (await articleCard(page, 0).getByRole("heading").textContent())?.trim() ?? "";
    if (firstArticleTitle === "") {
      throw new Error("Expected the first preview article to include a title.");
    }

    await page.getByRole("button", { exact: true, name: "unread" }).click();
    await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { exact: true, name: "all" }).click();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await page.getByRole("button", { exact: true, name: "read" }).click();
    await expect(
      page.getByRole("heading", { name: firstArticleTitle }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { exact: true, name: "all" }).click();
    await openDashboardSettings(page);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Reader Settings" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Reset app state" }).click();
    await expectPreviewDashboard(page);
  });

  test("supports swipe actions and loads more feed pages in preview", async ({
    page,
  }) => {
    await page.goto("/dashboard?explore=1");
    await expectPreviewDashboard(page);
    await page.getByRole("button", { exact: true, name: "all" }).click();

    const firstArticleKey = await readArticleKey(articleCard(page, 0));
    const secondArticleKey = await readArticleKey(articleCard(page, 1));
    const firstArticle = articleCardByKey(page, firstArticleKey);
    const secondArticle = articleCardByKey(page, secondArticleKey);

    await expect(
      firstArticle.getByRole("button", { name: "Mark as read" }),
    ).toBeVisible();
    await swipeArticle(firstArticle, { endRatio: 0.92, startRatio: 0.24 });
    await expect(
      firstArticle.getByRole("button", { name: "Mark as unread" }),
    ).toBeVisible();
    await expectArticleExpanded(firstArticle, false);

    await expect(
      secondArticle.getByRole("button", { name: "Star article" }),
    ).toBeVisible();
    await swipeArticle(secondArticle, {
      endRatio: 0.08,
      startRatio: 0.78,
    });
    await expect(
      secondArticle.getByRole("button", { name: "Remove star" }),
    ).toBeVisible();
    await expectArticleExpanded(secondArticle, false);

    const initialArticleCount = await readRenderedArticleCount(page);

    expect(initialArticleCount).toBeGreaterThan(0);
    expect(await hasLoadMoreSentinel(page)).toBe(true);

    await scrollFeedViewportToBottom(page);
    await expect
      .poll(async () => {
        return await readRenderedArticleCount(page);
      })
      .toBeGreaterThan(initialArticleCount);
  });

});