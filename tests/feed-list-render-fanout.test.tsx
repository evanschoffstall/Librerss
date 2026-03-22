import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";

import {
  buildFeedListArticle,
  installFeedListDomMocks,
  restoreFeedListDomMocks,
} from "./feed-list-test-utils";

const articleRenderCounts = new Map<string, number>();

beforeEach(() => {
  articleRenderCounts.clear();
  mock.restore();
  installFeedListDomMocks();
});

afterEach(() => {
  articleRenderCounts.clear();
  mock.restore();
  restoreFeedListDomMocks();
});

describe("FeedList row render fan-out", () => {
  test("rerenders only the affected row when hydration state flips for one article", async () => {
    mock.module("next-themes", () => ({
      useTheme: () => ({ resolvedTheme: "dark" }),
    }));
    mock.module("@/lib/hooks/useIsMobile", () => ({
      useIsMobile: () => false,
    }));
    mock.module("@/app/dashboard/components/ArticleCard", () => ({
      ArticleCard: ({ articleKey }: { articleKey: string }) => {
        articleRenderCounts.set(
          articleKey,
          (articleRenderCounts.get(articleKey) ?? 0) + 1,
        );

        return <article data-article-key={articleKey}>{articleKey}</article>;
      },
    }));

    const { FeedList } = await import(
      "@/app/dashboard/components/feed/FeedList"
    );

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
      <div data-radix-scroll-area-viewport="">
        <FeedList
        articleFilter="all"
          articlesPerPage={12}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:all"
          filteredFeed={[firstArticle, secondArticle]}
          hydratedArticleLinks={{}}
          hydratingArticleLinks={{}}
          isInitialLoading={false}
          isRefreshing={false}
          onExpandedSwipeRead={handleExpandedSwipeRead}
          onToggle={handleToggle}
          onToggleRead={handleToggleRead}
          onToggleStarred={handleToggleStarred}
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    await waitFor(() => {
      expect(articleRenderCounts.get(firstArticle.link)).toBe(1);
      expect(articleRenderCounts.get(secondArticle.link)).toBe(1);
    });

    rerender(
      <div data-radix-scroll-area-viewport="">
        <FeedList
        articleFilter="all"
          articlesPerPage={12}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:all"
          filteredFeed={[firstArticle, secondArticle]}
          hydratedArticleLinks={{}}
          hydratingArticleLinks={{ [secondArticle.link]: true }}
          isInitialLoading={false}
          isRefreshing={false}
          onExpandedSwipeRead={handleExpandedSwipeRead}
          onToggle={handleToggle}
          onToggleRead={handleToggleRead}
          onToggleStarred={handleToggleStarred}
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    await waitFor(() => {
      expect(articleRenderCounts.get(firstArticle.link)).toBe(1);
      expect(articleRenderCounts.get(secondArticle.link)).toBe(2);
    });
  });
});