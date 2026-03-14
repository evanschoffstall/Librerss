import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import { FeedList } from "@/app/dashboard/components/feed/FeedList";
import { type Article } from "@/lib";

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: query.includes("639"),
      media: query,
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {},
    }),
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
    writable: true,
  });
});

function buildArticle(overrides?: Partial<Article>): Article {
  return {
    content: "Short preview content for the article card.",
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

function renderFeedList(element: React.ReactNode) {
  return render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {element}
    </ThemeProvider>,
  );
}

describe("FeedList", () => {
  test("shows a loading surface only during the initial fetch", () => {
    const { container, queryByText } = renderFeedList(
      <FeedList
        expandedArticleKey={null}
        filteredFeed={[]}
        hydratedArticleLinks={{}}
        hydratingArticleLinks={{}}
        isInitialLoading={true}
        isRefreshing={false}
        onExpandedSwipeRead={() => {}}
        onToggle={() => {}}
        onToggleRead={() => {}}
        onToggleStarred={() => {}}
        searchTerm=""
        sentinelRef={React.createRef<HTMLDivElement>()}
        showFavicons={false}
        updatingArticleState={{}}
        visibleCount={25}
      />,
    );

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
    expect(queryByText("Syncing latest articles")).toBeNull();
  });

  test("keeps visible cards mounted while a refresh is in flight", async () => {
    const article = buildArticle();
    const { container, getByText } = renderFeedList(
      <FeedList
        expandedArticleKey={null}
        filteredFeed={[article]}
        hydratedArticleLinks={{}}
        hydratingArticleLinks={{}}
        isInitialLoading={false}
        isRefreshing={true}
        onExpandedSwipeRead={() => {}}
        onToggle={() => {}}
        onToggleRead={() => {}}
        onToggleStarred={() => {}}
        searchTerm=""
        sentinelRef={React.createRef<HTMLDivElement>()}
        showFavicons={false}
        updatingArticleState={{}}
        visibleCount={25}
      />,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      expect(getByText("Syncing latest articles")).toBeTruthy();
      expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
    });
  });
});
