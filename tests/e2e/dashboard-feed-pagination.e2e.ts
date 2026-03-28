import {
  articleCard,
  configureArticlesPerPage,
  gotoPreviewDashboard,
  hasLoadMoreSentinel,
  readRenderedArticleCount,
  scrollFeedViewportToBottom,
} from "./helpers";
import { expect, test } from "./test";

interface DesktopViewportCase {
  height: number;
  name: string;
  width: number;
}

const DESKTOP_VIEWPORT_CASES: DesktopViewportCase[] = [
  { height: 640, name: "compact desktop", width: 1024 },
  { height: 780, name: "wide desktop", width: 1440 },
];

test.describe("dashboard feed pagination", () => {
  for (const viewportCase of DESKTOP_VIEWPORT_CASES) {
    test(`keeps the configured page size and loads at least three pages on ${viewportCase.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        height: viewportCase.height,
        width: viewportCase.width,
      });

      await gotoPreviewDashboard(page);
      await expect(articleCard(page, 0)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { exact: true, name: "all" }).click();

      await configureArticlesPerPage(page, 4);

      await expect
        .poll(async () => {
          const renderedArticleCount = await readRenderedArticleCount(page);
          return (
            renderedArticleCount >= 4 &&
            renderedArticleCount <= 8 &&
            renderedArticleCount % 4 === 0
          );
        })
        .toBe(true);
      await expect
        .poll(async () => {
          return await hasLoadMoreSentinel(page);
        })
        .toBe(true);

      for (const minimumRenderedArticles of [8, 12]) {
        await scrollFeedViewportToBottom(page);
        await expect
          .poll(async () => {
            return await readRenderedArticleCount(page);
          })
          .toBeGreaterThanOrEqual(minimumRenderedArticles);
      }
    });
  }
});