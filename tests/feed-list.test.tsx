import { render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import { FeedList } from "@/app/dashboard/components/feed/FeedList";

import {
  buildFeedListArticle,
  installFeedListDomMocks,
  restoreFeedListDomMocks,
} from "./feed-list-test-utils";

beforeEach(() => {
  installFeedListDomMocks();
});

afterEach(() => {
  restoreFeedListDomMocks();
});

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
        articlesPerPage={12}
        expandedArticleKey={null}
        feedViewKey="system-all-feeds:all"
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
        articlesPerPage={12}
        expandedArticleKey={null}
        feedViewKey="system-all-feeds:all"
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
    const article = buildFeedListArticle();
    const { getByText } = renderFeedList(
      <FeedList
        articleFilter="all"
        articlesPerPage={12}
        expandedArticleKey={null}
        feedViewKey="system-all-feeds:all"
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
    const article = buildFeedListArticle({
      link: "https://example.com/articles/swipe-removal",
      title: "Swipe removal article",
    });
    const { container, getByText, rerender } = renderFeedList(
      <FeedList
        articleFilter="all"
        articlesPerPage={12}
        expandedArticleKey={null}
        feedViewKey="system-all-feeds:all"
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
          articlesPerPage={12}
          collapsingArticles={{
            [article.link]: {
              article,
              index: 0,
              mode: "swipe-read",
            },
          }}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:unread"
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
    const firstArticle = buildFeedListArticle();
    const secondArticle = buildFeedListArticle({
      id: 2,
      link: "https://example.com/articles/virtualized-second",
      title: "Virtualized second article",
    });
    const { container, getByText } = renderFeedList(
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

  test("loads another page when the viewport has no scrollable overflow yet", async () => {
    let testContainer: HTMLElement | null = null;
    const articles = Array.from({ length: 10 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/viewport-fill-${index + 1}`,
        title: `Viewport fill article ${index + 1}`,
      }),
    );
    const { container, getByText, queryByText } = renderFeedList(
      <div
        data-radix-scroll-area-viewport=""
        ref={(viewport) => {
          if (!viewport) {
            return;
          }

          Object.defineProperty(viewport, "clientHeight", {
            configurable: true,
            get() {
              return 600;
            },
          });
          Object.defineProperty(viewport, "scrollHeight", {
            configurable: true,
            get() {
              const renderedRows =
                testContainer?.querySelectorAll("[data-scroll-restore-key]")
                  .length ?? 0;

              return renderedRows >= 8 ? 1200 : 400;
            },
          });
        }}
      >
        <FeedList
          articleFilter="all"
          articlesPerPage={4}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:all"
          filteredFeed={articles}
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

    testContainer = container;

    await waitFor(() => {
      expect(getByText("Viewport fill article 8")).toBeTruthy();
      expect(queryByText("Viewport fill article 9")).toBeNull();
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(
        8,
      );
    });
  });

  test("falls back to the plain feed surface while an article is expanded", async () => {
    const firstArticle = buildFeedListArticle();
    const secondArticle = buildFeedListArticle({
      id: 2,
      link: "https://example.com/articles/expanded-second",
      title: "Expanded second article",
    });
    const { container, getByText } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
        articleFilter="all"
          articlesPerPage={12}
          expandedArticleKey={firstArticle.link}
          feedViewKey="system-all-feeds:all"
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
    const article = buildFeedListArticle();
    const sibling = buildFeedListArticle({
      id: 2,
      link: "https://example.com/articles/collapse-sibling",
      title: "Collapse sibling article",
    });
    const { container, getByText, rerender } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
        articleFilter="all"
          articlesPerPage={12}
          expandedArticleKey={article.link}
          feedViewKey="system-all-feeds:all"
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
            articlesPerPage={12}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:all"
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

  test("resets the shared feed viewport when the active source changes", async () => {
    const firstArticle = buildFeedListArticle();
    const secondArticle = buildFeedListArticle({
      id: 2,
      link: "https://example.com/articles/reset-scroll-second",
      title: "Reset scroll second article",
    });
    const { container, getByText, rerender } = renderFeedList(
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
    });

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    let scrollTop = 240;
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      get() {
        return scrollTop;
      },
      set(nextValue: number) {
        scrollTop = nextValue;
      },
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
        articleFilter="all"
            articlesPerPage={12}
            expandedArticleKey={null}
            feedViewKey="feed:nasa:all"
            filteredFeed={[secondArticle]}
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

    expect(scrollTop).toBe(0);
  });
});
