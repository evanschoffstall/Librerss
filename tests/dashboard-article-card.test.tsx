import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { render, waitFor } from "@testing-library/react";

import { ArticleCard } from "@/app/dashboard/components/ArticleCard";
import { type Article } from "@/lib";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

function buildArticle(overrides?: Partial<Article>): Article {
  return {
    content: "",
    feedId: 1,
    feedName: "Example Feed",
    feedUrl: "https://example.com/feed.xml",
    id: 1,
    isRead: false,
    isStarred: false,
    lastChecked: new Date("2026-03-13T10:00:00.000Z"),
    link: "https://example.com/articles/perf",
    publicationDate: new Date("2026-03-13T09:00:00.000Z"),
    title: "Performance-sensitive article",
    ...overrides,
  };
}

describe("ArticleCard", () => {
  test("does not mount the full article body while collapsed", async () => {
    const longContent = Array.from({ length: 80 }, () => "expanded-body").join(
      " ",
    );
    const article = buildArticle({ content: longContent });
    const noop = () => {};

    const { container, rerender } = render(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={false}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={noop}
        onToggle={noop}
        onToggleRead={noop}
        onToggleStarred={noop}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    expect(container.textContent?.includes(longContent)).toBe(false);

    rerender(
      <ArticleCard
        article={article}
        articleKey="article-1"
        hasScrapedContent={false}
        isDark={false}
        isExpanded={true}
        isHydrating={false}
        isMobile={false}
        isUpdatingState={false}
        onExpandedSwipeRead={noop}
        onToggle={noop}
        onToggleRead={noop}
        onToggleStarred={noop}
        showFavicon={false}
        useRichFormatting={false}
      />,
    );

    await waitFor(() => {
      expect(container.textContent?.includes(longContent)).toBe(true);
    });
  });
});
