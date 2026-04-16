import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  buildFeedListArticle,
  installFeedListDomMocks,
  restoreFeedListDomMocks,
} from "./feed-list-test-utils";

const articleRenderCounts = new Map<string, number>();
let FeedArticleRow: typeof import("../src/app/dashboard/dashboard-components/feed-view/FeedArticleRow").FeedArticleRow;

beforeEach(async () => {
  articleRenderCounts.clear();
  mock.restore();
  installFeedListDomMocks();
  mock.module(
    "../src/app/dashboard/dashboard-components/article-view/ArticleCard",
    () => ({
      ArticleCard: ({ articleKey }: { articleKey: string }) => {
        articleRenderCounts.set(
          articleKey,
          (articleRenderCounts.get(articleKey) ?? 0) + 1,
        );

        return <article data-article-key={articleKey}>{articleKey}</article>;
      },
    }),
  );
  ({ FeedArticleRow } =
    await import("../src/app/dashboard/dashboard-components/feed-view/FeedArticleRow"));
});

afterEach(() => {
  articleRenderCounts.clear();
  mock.restore();
  restoreFeedListDomMocks();
});

describe("FeedList row render fan-out", () => {
  test("rerenders the targeted row when hydration state flips for one article", async () => {
    const firstArticle = buildFeedListArticle();
    const secondArticle = buildFeedListArticle({
      id: 2,
      link: "https://example.com/articles/perf-second",
      title: "Second performance-sensitive article",
    });
    const handleExpandedSwipeRead = () => {};
    const handleToggle = () => {};
    const handleToggleRead = () => {};
    const handleToggleStarred = () => {};

    const { rerender } = render(
      <>
        <FeedArticleRow
          article={firstArticle}
          articleKey={firstArticle.link}
          hasScrapedContent={false}
          isDark={true}
          isExpanded={false}
          isHydrating={false}
          isLastRow={false}
          isMobile={false}
          isUpdatingState={false}
          onExpandedSwipeRead={handleExpandedSwipeRead}
          onPrepareExpand={() => {}}
          onSwipeRead={() => {}}
          onToggle={handleToggle}
          onToggleRead={handleToggleRead}
          onToggleStarred={handleToggleStarred}
          removalAnimationMode={null}
          showFavicons={false}
          useRichFormatting={false}
        />
        <FeedArticleRow
          article={secondArticle}
          articleKey={secondArticle.link}
          hasScrapedContent={false}
          isDark={true}
          isExpanded={false}
          isHydrating={false}
          isLastRow={true}
          isMobile={false}
          isUpdatingState={false}
          onExpandedSwipeRead={handleExpandedSwipeRead}
          onPrepareExpand={() => {}}
          onSwipeRead={() => {}}
          onToggle={handleToggle}
          onToggleRead={handleToggleRead}
          onToggleStarred={handleToggleStarred}
          removalAnimationMode={null}
          showFavicons={false}
          useRichFormatting={false}
        />
      </>,
    );

    let initialFirstArticleRenderCount = 0;
    let initialSecondArticleRenderCount = 0;

    await waitFor(() => {
      initialFirstArticleRenderCount =
        articleRenderCounts.get(firstArticle.link) ?? 0;
      initialSecondArticleRenderCount =
        articleRenderCounts.get(secondArticle.link) ?? 0;

      expect(initialFirstArticleRenderCount).toBeGreaterThan(0);
      expect(initialSecondArticleRenderCount).toBeGreaterThan(0);
    });

    rerender(
      <>
        <FeedArticleRow
          article={firstArticle}
          articleKey={firstArticle.link}
          hasScrapedContent={false}
          isDark={true}
          isExpanded={false}
          isHydrating={false}
          isLastRow={false}
          isMobile={false}
          isUpdatingState={false}
          onExpandedSwipeRead={handleExpandedSwipeRead}
          onPrepareExpand={() => {}}
          onSwipeRead={() => {}}
          onToggle={handleToggle}
          onToggleRead={handleToggleRead}
          onToggleStarred={handleToggleStarred}
          removalAnimationMode={null}
          showFavicons={false}
          useRichFormatting={false}
        />
        <FeedArticleRow
          article={secondArticle}
          articleKey={secondArticle.link}
          hasScrapedContent={false}
          isDark={true}
          isExpanded={false}
          isHydrating={true}
          isLastRow={true}
          isMobile={false}
          isUpdatingState={false}
          onExpandedSwipeRead={handleExpandedSwipeRead}
          onPrepareExpand={() => {}}
          onSwipeRead={() => {}}
          onToggle={handleToggle}
          onToggleRead={handleToggleRead}
          onToggleStarred={handleToggleStarred}
          removalAnimationMode={null}
          showFavicons={false}
          useRichFormatting={false}
        />
      </>,
    );

    await waitFor(() => {
      expect(articleRenderCounts.get(firstArticle.link)).toBeGreaterThanOrEqual(
        initialFirstArticleRenderCount,
      );
      expect(articleRenderCounts.get(secondArticle.link)).toBeGreaterThan(
        initialSecondArticleRenderCount,
      );
    });
  });
});
