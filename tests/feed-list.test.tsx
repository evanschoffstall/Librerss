import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { act, render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import {
  FeedList,
  shouldLoadMoreArticles,
} from "@/app/dashboard/components/feed/FeedList";
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

function setViewportMetrics(
  viewport: HTMLElement,
  {
    clientHeight,
    scrollHeight,
    scrollTop,
  }: { clientHeight: number; scrollHeight: number; scrollTop: number },
) {
  let currentScrollTop = scrollTop;

  Object.defineProperty(viewport, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
  Object.defineProperty(viewport, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(viewport, "scrollTop", {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value;
    },
  });
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
        pageSize={25}
        paginationResetKey="all:unread:"
        searchTerm=""
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    expect(
      container.querySelectorAll('[data-dashboard-article-skeleton="true"]'),
    ).toHaveLength(4);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      12,
    );
    expect(queryByText("No results")).toBeNull();
  });

  test("shows the search empty state when no articles match", () => {
    const { getByText } = renderFeedList(
      <FeedList
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
        pageSize={25}
        paginationResetKey="all:unread:typescript"
        searchTerm="typescript"
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    expect(getByText("No results")).toBeTruthy();
    expect(getByText("typescript")).toBeTruthy();
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
        pageSize={25}
        paginationResetKey="all:unread:"
        searchTerm=""
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
    });
  });

  test("uses the page-size fallback before the virtual viewport is available", async () => {
    const firstArticle = buildArticle();
    const secondArticle = buildArticle({
      id: 2,
      link: "https://example.com/articles/virtuoso-2",
      title: "Second article",
    });
    const { getByText, queryByText } = renderFeedList(
      <FeedList
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
        pageSize={1}
        paginationResetKey="all:unread:"
        searchTerm=""
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    await waitFor(() => {
      expect(getByText(firstArticle.title)).toBeTruthy();
      expect(queryByText(secondArticle.title)).toBeNull();
    });
  });

  test("binds to the dashboard viewport and keeps the virtualized first page bounded", async () => {
    const firstArticle = buildArticle();
    const secondArticle = buildArticle({
      id: 2,
      link: "https://example.com/articles/virtuoso-mounted",
      title: "Viewport bound article",
    });
    const { container, getByText, queryByText } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
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
          pageSize={1}
          paginationResetKey="all:unread:"
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    await waitFor(() => {
      expect(getByText(firstArticle.title)).toBeTruthy();
      expect(
        container.querySelector("[data-virtuoso-scroller='true']"),
      ).toBeTruthy();
      expect(queryByText(secondArticle.title)).toBeNull();
    });
  });

  test("loads the next page when the viewport is close to the bottom", () => {
    expect(
      shouldLoadMoreArticles({
        clientHeight: 320,
        hasUserScrolled: true,
        scrollHeight: 700,
        scrollTop: 220,
        totalArticleCount: 10,
        visibleArticleCount: 5,
      }),
    ).toBe(true);

    expect(
      shouldLoadMoreArticles({
        clientHeight: 320,
        hasUserScrolled: false,
        scrollHeight: 700,
        scrollTop: 220,
        totalArticleCount: 10,
        visibleArticleCount: 5,
      }),
    ).toBe(false);

    expect(
      shouldLoadMoreArticles({
        clientHeight: 320,
        hasUserScrolled: true,
        scrollHeight: 2000,
        scrollTop: 220,
        totalArticleCount: 10,
        visibleArticleCount: 5,
      }),
    ).toBe(false);

    expect(
      shouldLoadMoreArticles({
        clientHeight: 320,
        hasUserScrolled: true,
        scrollHeight: 700,
        scrollTop: 220,
        totalArticleCount: 5,
        visibleArticleCount: 5,
      }),
    ).toBe(false);
  });

  test("wires the viewport listeners for near-bottom load checks", async () => {
    const firstArticle = buildArticle();
    const secondArticle = buildArticle({
      id: 2,
      link: "https://example.com/articles/listener-check",
      title: "Listener check article",
    });
    const { getByText } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
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
          pageSize={1}
          paginationResetKey="all:unread:"
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    const viewport = document.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("missing viewport");
    }

    setViewportMetrics(viewport, {
      clientHeight: 320,
      scrollHeight: 700,
      scrollTop: 220,
    });

    await waitFor(() => {
      expect(getByText(firstArticle.title)).toBeTruthy();
    });

    act(() => {
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    expect(getByText(firstArticle.title)).toBeTruthy();
  });

  test("resets the visible page when the paging key changes", async () => {
    const firstArticle = buildArticle();
    const secondArticle = buildArticle({
      id: 2,
      link: "https://example.com/articles/selection-reset",
      title: "Selection reset article",
    });
    const { getByText, queryByText, rerender } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
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
          pageSize={2}
          paginationResetKey="all:unread:"
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    await waitFor(() => {
      expect(getByText(firstArticle.title)).toBeTruthy();
      expect(getByText(secondArticle.title)).toBeTruthy();
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
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
            pageSize={1}
            paginationResetKey="feed-2:unread:"
            searchTerm=""
            showFavicons={false}
            updatingArticleState={{}}
          />
        </div>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(getByText(firstArticle.title)).toBeTruthy();
      expect(queryByText(secondArticle.title)).toBeNull();
    });
  });
});
