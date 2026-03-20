import { render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import { FeedList } from "@/app/dashboard/components/feed/FeedList";
import { type Article } from "@/lib";

const originalMatchMedia = window.matchMedia;
const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  disconnect() {}

  observe() {}

  unobserve() {}
}

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
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverMock,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
    writable: true,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: originalResizeObserver,
    writable: true,
  });
});

function buildArticle(overrides?: Partial<Article>): Article {
  return {
    content: "Short preview content for the article card.",
    feedId: 1,
    feedName: "Example Feed",
    feedUrl: "https://example.com/feed.xml",
    hasFullContent: false,
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
        articleFilter="all"
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
        showFavicons={false}
        updatingArticleState={{}}
      />, 
    );

    expect(
      container.querySelectorAll('[data-dashboard-feed-list-skeleton-item="true"]'),
    ).toHaveLength(4);
    expect(queryByText("No results")).toBeNull();
  });

  test("shows the search empty state when no articles match", () => {
    const { container } = renderFeedList(
      <FeedList
        articleFilter="all"
        expandedArticleKey={null}
        filteredFeed={[]}
        hydratedArticleLinks={{}}
        hydratingArticleLinks={{}}
        isInitialLoading={false}
        isRefreshing={false}
        onExpandedSwipeRead={() => {}}
        onToggle={() => {}}
        onToggleRead={() => {}}
        onToggleStarred={() => {}}
        searchTerm="typescript"
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    const emptyState = container.querySelector('[data-feed-empty-state="true"]');
    expect(emptyState).toBeTruthy();
    const scoped = within(emptyState as HTMLElement);
    const emptyStateFrame = container.querySelector<HTMLElement>(
      '[data-feed-empty-state-frame="true"]',
    );

    expect(scoped.getByText("No results")).toBeTruthy();
    expect(scoped.getByText("Nothing matched")).toBeTruthy();
    expect(scoped.getByText("typescript")).toBeTruthy();
    expect(scoped.getByText("Try a different term.")).toBeTruthy();
    expect(emptyState?.className).toContain("max-w-2xl");
    expect(emptyState?.className).toContain("min-h-72");
    expect(emptyState?.className).not.toContain("border");
    expect(emptyState?.className).not.toContain("shadow-");
    expect(emptyState?.className).not.toContain("bg-card/70");
    expect(emptyStateFrame?.className).toContain(
      "min-h-[clamp(20rem,calc(100dvh-12rem),34rem)]",
    );
    expect(emptyStateFrame?.className).toContain("justify-center");
  });

  test("keeps visible cards mounted while a refresh is in flight", async () => {
    const article = buildArticle();
    const { getByText } = renderFeedList(
      <FeedList
        articleFilter="all"
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
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
    });
  });

  test("falls back to the empty state after unread filtering removes the last row", async () => {
    const article = buildArticle({
      link: "https://example.com/articles/swipe-removal",
      title: "Swipe removal article",
    });
    const { container, getByText, rerender } = renderFeedList(
      <FeedList
        articleFilter="all"
        expandedArticleKey={null}
        filteredFeed={[article]}
        hydratedArticleLinks={{}}
        hydratingArticleLinks={{}}
        isInitialLoading={false}
        isRefreshing={false}
        onExpandedSwipeRead={() => {}}
        onToggle={() => {}}
        onToggleRead={() => {}}
        onToggleStarred={() => {}}
        searchTerm=""
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <FeedList
          articleFilter="unread"
          collapsingArticles={{
            [article.link]: {
              article,
              index: 0,
              mode: "swipe-read",
            },
          }}
          expandedArticleKey={null}
          filteredFeed={[]}
          hydratedArticleLinks={{}}
          hydratingArticleLinks={{}}
          isInitialLoading={false}
          isRefreshing={false}
          onExpandedSwipeRead={() => {}}
          onToggle={() => {}}
          onToggleRead={() => {}}
          onToggleStarred={() => {}}
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-feed-empty-state="true"]')).toBeTruthy();
      expect(getByText("You're up to date")).toBeTruthy();
      expect(getByText("Check back later or pull for fresh articles.")).toBeTruthy();
    });
  });

  test("renders the list through virtuoso once the dashboard viewport is available", async () => {
    const firstArticle = buildArticle();
    const secondArticle = buildArticle({
      id: 2,
      link: "https://example.com/articles/virtualized-second",
      title: "Virtualized second article",
    });
    const { container, getByText } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
          articleFilter="all"
          expandedArticleKey={null}
          filteredFeed={[firstArticle, secondArticle]}
          hydratedArticleLinks={{}}
          hydratingArticleLinks={{}}
          isInitialLoading={false}
          isRefreshing={false}
          onExpandedSwipeRead={() => {}}
          onToggle={() => {}}
          onToggleRead={() => {}}
          onToggleStarred={() => {}}
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    await waitFor(() => {
      expect(getByText(firstArticle.title)).toBeTruthy();
      expect(
        container.querySelector("[data-feed-virtualizer='true']"),
      ).toBeTruthy();
    });
  });

  test("falls back to the plain feed surface while an article is expanded", async () => {
    const firstArticle = buildArticle();
    const secondArticle = buildArticle({
      id: 2,
      link: "https://example.com/articles/expanded-second",
      title: "Expanded second article",
    });
    const { container, getByText } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
          articleFilter="all"
          expandedArticleKey={firstArticle.link}
          filteredFeed={[firstArticle, secondArticle]}
          hydratedArticleLinks={{}}
          hydratingArticleLinks={{}}
          isInitialLoading={false}
          isRefreshing={false}
          onExpandedSwipeRead={() => {}}
          onToggle={() => {}}
          onToggleRead={() => {}}
          onToggleStarred={() => {}}
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    await waitFor(() => {
      expect(getByText(firstArticle.title)).toBeTruthy();
      expect(getByText(secondArticle.title)).toBeTruthy();
      expect(
        container.querySelector("[data-feed-surface-mode='plain']"),
      ).toBeTruthy();
      expect(container.querySelector("[data-feed-virtualizer='true']")).toBe(
        null,
      );
    });
  });

  test("keeps the plain feed surface briefly after collapsing an expanded article", async () => {
    const article = buildArticle();
    const sibling = buildArticle({
      id: 2,
      link: "https://example.com/articles/collapse-sibling",
      title: "Collapse sibling article",
    });
    const { container, getByText, rerender } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
          articleFilter="all"
          expandedArticleKey={article.link}
          filteredFeed={[article, sibling]}
          hydratedArticleLinks={{}}
          hydratingArticleLinks={{}}
          isInitialLoading={false}
          isRefreshing={false}
          onExpandedSwipeRead={() => {}}
          onToggle={() => {}}
          onToggleRead={() => {}}
          onToggleStarred={() => {}}
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      expect(container.querySelector("[data-feed-virtualizer='true']")).toBe(
        null,
      );
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="all"
            expandedArticleKey={null}
            filteredFeed={[article, sibling]}
            hydratedArticleLinks={{}}
            hydratingArticleLinks={{}}
            isInitialLoading={false}
            isRefreshing={false}
            onExpandedSwipeRead={() => {}}
            onToggle={() => {}}
            onToggleRead={() => {}}
            onToggleStarred={() => {}}
            searchTerm=""
            showFavicons={false}
            updatingArticleState={{}}
          />
        </div>
      </ThemeProvider>,
    );

    expect(container.querySelector("[data-feed-surface-mode='plain']")).toBeTruthy();
    expect(container.querySelector("[data-feed-virtualizer='true']")).toBe(
      null,
    );
  });
});
