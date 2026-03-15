import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { act, render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import {
  FeedList,
  measureFeedListItemSize,
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
  test("measureFeedListItemSize clamps zero-height rows to the virtualization floor", () => {
    const row = document.createElement("div");

    Object.defineProperty(row, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        toJSON: () => ({}),
        top: 0,
        width: 0,
        x: 0,
        y: 0,
      }),
    });

    expect(measureFeedListItemSize(row)).toBe(12);
  });

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

  test("marks staged unread removals as collapsing rows", async () => {
    const article = buildArticle();
    const { container, getByText } = renderFeedList(
      <FeedList
        collapsingArticleKey={article.link}
        collapsingArticleMode="collapse"
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
        pageSize={25}
        paginationResetKey="all:unread:"
        searchTerm=""
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      const row = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${article.link}"][data-feed-row-animation="collapse"]`,
      );

      expect(row).toBeTruthy();
      expect(row?.dataset.feedRowState).toBe("collapsing");
      expect(row?.style.height).toBeTruthy();
      expect(row?.style.minHeight).toBe("12px");
    });
  });

  test("marks swipe-driven removals with the off-screen row animation", async () => {
    const article = buildArticle({
      link: "https://example.com/articles/swipe-removal",
      title: "Swipe removal article",
    });
    const { container, getByText } = renderFeedList(
      <FeedList
        collapsingArticleKey={article.link}
        collapsingArticleMode="swipe-read"
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
        pageSize={25}
        paginationResetKey="all:unread:"
        searchTerm=""
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      expect(
        container.querySelector(
          `[data-scroll-restore-key="${article.link}"][data-feed-row-animation="swipe-read"]`,
        ),
      ).toBeTruthy();
    });
  });

  test("de-expanding rows collapse list space without applying the generic scale exit", async () => {
    const article = buildArticle({
      link: "https://example.com/articles/de-expanding-removal",
      title: "De-expanding removal article",
    });
    const { container, getByText } = renderFeedList(
      <FeedList
        collapsingArticleKey={article.link}
        collapsingArticleMode="de-expanding"
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
        pageSize={25}
        paginationResetKey="all:unread:"
        searchTerm=""
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      const row = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${article.link}"][data-feed-row-animation="de-expanding"]`,
      );

      expect(row).toBeTruthy();
      expect(row?.dataset.feedRowState).toBe("collapsing");
      expect(row?.style.height).toBeTruthy();
      expect(row?.style.minHeight).toBe("12px");
      expect(row?.style.marginBottom).toBeTruthy();
      expect(row?.dataset.feedRowLayout).toBe("none");
      expect(row?.style.transform).toBe("");
      expect(row?.style.willChange).toContain("height");
      expect(row?.style.willChange).toContain("opacity");
    });
  });

  test("keeps a de-expanding first row inside the virtualized feed", async () => {
    const article = buildArticle({ title: "De-expanding first row article" });
    const { container, getByText, rerender } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
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
          pageSize={1}
          paginationResetKey="all:unread:"
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      expect(
        container.querySelector("[data-feed-virtualizer='true']"),
      ).toBeTruthy();
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            collapsingArticleKey={article.link}
            collapsingArticleMode="de-expanding"
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
            pageSize={1}
            paginationResetKey="all:unread:"
            searchTerm=""
            showFavicons={false}
            updatingArticleState={{}}
          />
        </div>
      </ThemeProvider>,
    );

    await waitFor(() => {
      const row = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${article.link}"][data-feed-row-animation="de-expanding"]`,
      );

      expect(row).toBeTruthy();
      expect(row?.textContent).toContain(article.title);
      expect(container.querySelector("[data-feed-virtualizer='true']")).toBe(
        null,
      );
    });
  });

  test("does not pin idle rows to a measured max-height", async () => {
    const article = buildArticle({ title: "Idle row article" });
    const { container, getByText } = renderFeedList(
      <FeedList
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
        pageSize={25}
        paginationResetKey="all:unread:"
        searchTerm=""
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      const row = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${article.link}"][data-feed-row-animation="idle"]`,
      );

      expect(row).toBeTruthy();
      expect(row?.dataset.feedRowLayout).toBe("none");
      expect(row?.style.maxHeight).toBe("");
      expect(row?.style.marginBottom).toBe("6px");
    });
  });

  test("limits row position layout animation to removal states", async () => {
    const article = buildArticle({ title: "Layout guard article" });
    const sibling = buildArticle({
      id: 2,
      link: "https://example.com/articles/layout-guard-sibling",
      title: "Layout guard sibling article",
    });
    const { container, getByText, rerender } = renderFeedList(
      <FeedList
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
        pageSize={25}
        paginationResetKey="all:unread:"
        searchTerm=""
        showFavicons={false}
        updatingArticleState={{}}
      />,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      expect(getByText(sibling.title)).toBeTruthy();
      const row = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${article.link}"]`,
      );
      const siblingRow = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${sibling.link}"]`,
      );

      expect(row).toBeTruthy();
      expect(row?.dataset.feedRowLayout).toBe("none");
      expect(siblingRow).toBeTruthy();
      expect(siblingRow?.dataset.feedRowLayout).toBe("none");
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <FeedList
          collapsingArticleKey={article.link}
          collapsingArticleMode="collapse"
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
          pageSize={25}
          paginationResetKey="all:unread:"
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      const row = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${article.link}"]`,
      );
      const siblingRow = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${sibling.link}"]`,
      );

      expect(row).toBeTruthy();
      expect(row?.dataset.feedRowLayout).toBe("none");
      expect(row?.dataset.feedRowState).toBe("collapsing");
      expect(siblingRow).toBeTruthy();
      expect(siblingRow?.dataset.feedRowLayout).toBe("position");
    });
  });

  test("retains a collapsing row after unread filtering removes it", async () => {
    const article = buildArticle({ title: "Retained collapse article" });
    const { container, getByText, rerender } = renderFeedList(
      <FeedList
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
        pageSize={25}
        paginationResetKey="all:unread:"
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
          collapsingArticleKey={article.link}
          collapsingArticleMode="collapse"
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
          paginationResetKey="all:unread:"
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      const row = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${article.link}"][data-feed-row-animation="collapse"]`,
      );

      expect(row).toBeTruthy();
      expect(row?.textContent).toContain(article.title);
    });
  });

  test("keeps a collapsing first row rendered in the virtualized feed", async () => {
    const article = buildArticle({ title: "Pinned first row article" });
    const { container, getByText, rerender } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
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
          pageSize={1}
          paginationResetKey="all:unread:"
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      expect(
        container.querySelector("[data-feed-virtualizer='true']"),
      ).toBeTruthy();
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            collapsingArticleKey={article.link}
            collapsingArticleMode="collapse"
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
            pageSize={1}
            paginationResetKey="all:unread:"
            searchTerm=""
            showFavicons={false}
            updatingArticleState={{}}
          />
        </div>
      </ThemeProvider>,
    );

    await waitFor(() => {
      const row = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${article.link}"][data-feed-row-animation="collapse"]`,
      );

      expect(row).toBeTruthy();
      expect(row?.textContent).toContain(article.title);
      expect(container.querySelector("[data-feed-virtualizer='true']")).toBe(
        null,
      );
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
        container.querySelector("[data-feed-virtualizer='true']"),
      ).toBeTruthy();
      expect(queryByText(secondArticle.title)).toBeNull();
      expect(
        container.querySelector("[data-feed-load-more-sentinel='true']"),
      ).toBeTruthy();
    });
  });

  test("renders the mounted feed without virtualization while an article is expanded", async () => {
    const firstArticle = buildArticle();
    const secondArticle = buildArticle({
      id: 2,
      link: "https://example.com/articles/expanded-mounted-second",
      title: "Expanded mounted second article",
    });
    const { container, getByText } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
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
      expect(container.querySelector("[data-feed-virtualizer='true']")).toBe(
        null,
      );
    });
  });

  test("renders the mounted feed without virtualization while collapse settling is active", async () => {
    const article = buildArticle({
      title: "Mounted collapse settling article",
    });
    const sibling = buildArticle({
      id: 2,
      link: "https://example.com/articles/mounted-collapse-settling-sibling",
      title: "Mounted collapse settling sibling",
    });

    const { container, getByText } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
          collapseSettlingArticleKey={article.link}
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
          pageSize={1}
          paginationResetKey="all:unread:"
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
  });

  test("keeps the mounted feed non-virtualized right after an expanded article collapses", async () => {
    const article = buildArticle({ title: "Just collapsed article" });
    const sibling = buildArticle({
      id: 2,
      link: "https://example.com/articles/just-collapsed-sibling",
      title: "Just collapsed sibling",
    });

    const { container, getByText, rerender } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
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
          pageSize={1}
          paginationResetKey="all:unread:"
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
            pageSize={1}
            paginationResetKey="all:unread:"
            searchTerm=""
            showFavicons={false}
            updatingArticleState={{}}
          />
        </div>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(getByText(article.title)).toBeTruthy();
      expect(container.querySelector("[data-feed-virtualizer='true']")).toBe(
        null,
      );
    });

    const viewport = document.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("missing viewport");
    }

    act(() => {
      viewport.dispatchEvent(new Event("wheel"));
    });

    await waitFor(() => {
      expect(
        container.querySelector("[data-feed-virtualizer='true']"),
      ).toBeTruthy();
    });
  });

  test("renders the mounted feed without virtualization while a staged collapse is active", async () => {
    const article = buildArticle({
      title: "Mounted staged collapse article",
    });
    const sibling = buildArticle({
      id: 2,
      link: "https://example.com/articles/mounted-staged-collapse-sibling",
      title: "Mounted staged collapse sibling",
    });

    const { container, getByText } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
          collapsingArticleKey={article.link}
          collapsingArticleMode="de-expanding"
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
          pageSize={1}
          paginationResetKey="all:unread:"
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
      const row = container.querySelector<HTMLElement>(
        `[data-scroll-restore-key="${article.link}"][data-feed-row-animation="de-expanding"]`,
      );
      expect(row).toBeTruthy();
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
