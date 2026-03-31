import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import { isFeedInvertedScrollActive } from "@/app/dashboard/components/feed/FeedList";

import {
  buildFeedListArticle,
  installFeedListDomMocks,
  MOBILE_INVERTED_SCROLL_STORAGE_KEY,
  restoreFeedListDomMocks,
  setFeedListMobileViewport,
} from "./feed-list-test-utils";

let FeedList: typeof import("@/app/dashboard/components/feed/FeedList").FeedList;
const originalConsoleError = console.error;

type MockMotionProps = React.HTMLAttributes<HTMLElement> & {
  animate?: unknown;
  exit?: unknown;
  initial?: unknown;
  layout?: unknown;
  layoutId?: unknown;
  transition?: unknown;
};

const motion = new Proxy(
  {},
  {
    get: (_target, tag) =>
      React.forwardRef<HTMLElement, MockMotionProps>(
        function MockMotionComponent(
          {
            animate: _animate,
            exit: _exit,
            initial: _initial,
            layout: _layout,
            layoutId: _layoutId,
            transition: _transition,
            ...props
          },
          ref,
        ) {
          return React.createElement(tag as string, { ...props, ref }, props.children);
        },
      ),
  },
);

async function flushFeedListAsyncWork() {
  await act(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

function renderFeedList(node: React.ReactElement) {
  return render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {node}
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  mock.restore();
  console.error = ((...args: unknown[]) => {
    const [firstArg] = args;
    if (typeof firstArg === "string") {
      if (firstArg.includes("react-virtuoso: Zero-sized element")) {
        return;
      }

      if (firstArg.includes("`NaN` is an invalid value for the `paddingBottom` css style property.")) {
        return;
      }
    }

    originalConsoleError(...args);
  }) as typeof console.error;
  mock.module("motion/react", () => ({
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion,
  }));
  installFeedListDomMocks();
  ({ FeedList } = await import("@/app/dashboard/components/feed/FeedList"));
});

afterEach(() => {
  mock.restore();
  console.error = originalConsoleError;
  restoreFeedListDomMocks();
});

describe("FeedList", () => {
  test("keeps auto-filling additional pages when the viewport still cannot scroll", async () => {
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
      expect(getByText("Viewport fill article 10")).toBeTruthy();
      expect(queryByText("Viewport fill article 11")).toBeNull();
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(
        10,
      );
    });
  });

  test("stops auto-filling once starred results become scrollable", async () => {
    let testContainer: HTMLElement | null = null;
    const articles = Array.from({ length: 13 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        isStarred: true,
        link: `https://example.com/articles/starred-autofill-${index + 1}`,
        title: `Starred auto-fill article ${index + 1}`,
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

              return renderedRows >= 12 ? 1200 : 400;
            },
          });
        }}
      >
        <FeedList
          articleFilter="starred"
          articlesPerPage={4}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:starred"
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
      const renderedRows = container.querySelectorAll("[data-scroll-restore-key]").length;
      expect(renderedRows).toBe(12);
    }, { timeout: 5000 });

    expect(getByText("Starred auto-fill article 12")).toBeTruthy();
    expect(queryByText("Starred auto-fill article 14")).toBeNull();
  });

  test("stops auto-filling with a no-op once all starred results are visible", async () => {
    let testContainer: HTMLElement | null = null;
    const articles = Array.from({ length: 6 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        isStarred: true,
        link: `https://example.com/articles/starred-exhausted-${index + 1}`,
        title: `Starred exhausted article ${index + 1}`,
      }),
    );

    const { container, getByText } = renderFeedList(
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

              return renderedRows * 40;
            },
          });
        }}
      >
        <FeedList
          articleFilter="starred"
          articlesPerPage={4}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:starred"
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
      expect(getByText("Starred exhausted article 6")).toBeTruthy();
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(
        6,
      );
      expect(
        container.querySelector("[data-feed-load-more-sentinel='true']"),
      ).toBeNull();
    });
  });

  test("reserves one page of load-more skeleton rows while the next page is fetching", async () => {
    const articles = Array.from({ length: 4 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/loading-more-${index + 1}`,
        title: `Loading more article ${index + 1}`,
      }),
    );

    const { container } = renderFeedList(
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
              return 1200;
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
          isLoadingMore
          isRefreshing={false}
          onExpandedSwipeRead={() => {}}
          onLoadMore={() => {}}
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
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(4);
      expect(container.querySelectorAll("[data-feed-load-more-skeletons='true']")).toHaveLength(1);
      expect(
        container.querySelectorAll(
          "[data-feed-load-more-skeletons='true'] [data-dashboard-feed-list-skeleton-item='true']",
        ),
      ).toHaveLength(4);
    });
  });

  test("does not prefetch another server page during idle auto-fill before any scroll intent", async () => {
    let testContainer: HTMLElement | null = null;
    const articles = Array.from({ length: 8 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/idle-autofill-${index + 1}`,
        title: `Idle auto-fill article ${index + 1}`,
      }),
    );
    const onLoadMore = mock(() => {});

    const { container, getByText } = renderFeedList(
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
          onLoadMore={onLoadMore}
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
      expect(getByText("Idle auto-fill article 8")).toBeTruthy();
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(8);
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  test("loads only one inverted server page per top reach until the reader leaves the top boundary", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    let scrollTop = 0;
    const onLoadMore = mock(() => {});

    const buildArticles = (count: number) =>
      Array.from({ length: count }, (_value, index) =>
        buildFeedListArticle({
          id: index + 1,
          link: `https://example.com/articles/inverted-server-load-${index + 1}`,
          title: `Inverted server load article ${index + 1}`,
        }),
      );

    const renderSubject = (articleCount: number) => (
      <div
        data-radix-scroll-area-viewport=""
        ref={(viewport) => {
          if (!viewport) {
            return;
          }

          Object.defineProperty(viewport, "clientHeight", {
            configurable: true,
            get() {
              return 400;
            },
          });
          Object.defineProperty(viewport, "scrollHeight", {
            configurable: true,
            get() {
              const renderedRows =
                viewport.querySelectorAll("[data-scroll-restore-key]").length;

              return Math.max(renderedRows, 4) * 140;
            },
          });
          Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            get() {
              return scrollTop;
            },
            set(nextValue: number) {
              scrollTop = nextValue;
            },
          });
        }}
      >
        <FeedList
          articleFilter="all"
          articlesPerPage={4}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:all"
          filteredFeed={buildArticles(articleCount)}
          hydratedArticleLinks={{}}
          hydratingArticleLinks={{}}
          isInitialLoading={false}
          isRefreshing={false}
          onExpandedSwipeRead={() => {}}
          onLoadMore={onLoadMore}
          onToggle={() => {}}
          onToggleRead={() => {}}
          onToggleStarred={() => {}}
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>
    );

    const { container, rerender } = renderFeedList(renderSubject(4));

    await waitFor(() => {
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(4);
    });

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    await act(async () => {
      scrollTop = 0;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await flushFeedListAsyncWork();

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        {renderSubject(8)}
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(8);
    });

    await act(async () => {
      scrollTop = 0;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      scrollTop = 700;
      viewport.dispatchEvent(new Event("scroll"));
      scrollTop = 0;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    });
  });

  test("does not load an inverted server page until touch scrolling reaches the tighter top boundary", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    let scrollTop = 360;
    const onLoadMore = mock(() => {});

    const articles = Array.from({ length: 4 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/inverted-tight-boundary-${index + 1}`,
        title: `Inverted tight boundary article ${index + 1}`,
      }),
    );

    const { container } = renderFeedList(
      <div
        data-radix-scroll-area-viewport=""
        ref={(viewport) => {
          if (!viewport) {
            return;
          }

          Object.defineProperty(viewport, "clientHeight", {
            configurable: true,
            get() {
              return 400;
            },
          });
          Object.defineProperty(viewport, "scrollHeight", {
            configurable: true,
            get() {
              return 960;
            },
          });
          Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            get() {
              return scrollTop;
            },
            set(nextValue: number) {
              scrollTop = nextValue;
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
          onLoadMore={onLoadMore}
          onToggle={() => {}}
          onToggleRead={() => {}}
          onToggleStarred={() => {}}
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    await waitFor(() => {
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(4);
    });

    await flushFeedListAsyncWork();

    await act(async () => {
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).not.toHaveBeenCalled();

    await act(async () => {
      scrollTop = 220;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await flushFeedListAsyncWork();

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  test("loads one additional standard-scroll page after explicit bottom scroll intent", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(false),
    );

    const articles = Array.from({ length: 12 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/standard-scroll-${index + 1}`,
        title: `Standard scroll article ${index + 1}`,
      }),
    );
    let scrollTop = 0;

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
              return 400;
            },
          });
          Object.defineProperty(viewport, "scrollHeight", {
            configurable: true,
            get() {
              const renderedRows =
                container.querySelectorAll("[data-scroll-restore-key]").length;

              return Math.max(renderedRows, 4) * 140;
            },
          });
          Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            get() {
              return scrollTop;
            },
            set(nextValue: number) {
              scrollTop = nextValue;
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

    await waitFor(() => {
      expect(getByText("Standard scroll article 4")).toBeTruthy();
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(4);
      expect(queryByText("Standard scroll article 12")).toBeNull();
    });

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    await act(async () => {
      scrollTop = 800;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(getByText("Standard scroll article 4")).toBeTruthy();
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(8);
      expect(getByText("Standard scroll article 8")).toBeTruthy();
      expect(queryByText("Standard scroll article 12")).toBeNull();
    });
  });

  test("does not load an additional standard-scroll page from a small scroll away from the sentinel", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(false),
    );

    const articles = Array.from({ length: 12 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/standard-scroll-idle-${index + 1}`,
        title: `Standard scroll idle article ${index + 1}`,
      }),
    );
    let scrollTop = 0;

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
              return 400;
            },
          });
          Object.defineProperty(viewport, "scrollHeight", {
            configurable: true,
            get() {
              const renderedRows =
                container.querySelectorAll("[data-scroll-restore-key]").length;

              return Math.max(renderedRows, 4) * 140;
            },
          });
          Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            get() {
              return scrollTop;
            },
            set(nextValue: number) {
              scrollTop = nextValue;
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

    await waitFor(() => {
      expect(getByText("Standard scroll idle article 4")).toBeTruthy();
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(4);
      expect(queryByText("Standard scroll idle article 12")).toBeNull();
    });

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    await act(async () => {
      scrollTop = 120;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(4);
      expect(queryByText("Standard scroll idle article 12")).toBeNull();
    });
  });

  test("keeps the mobile inverted-scroll preference inactive on desktop viewports", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(false);

    const articles = Array.from({ length: 4 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/desktop-inverted-scroll-${index + 1}`,
        title: `Desktop inverted scroll article ${index + 1}`,
      }),
    );

    const { container, getByText } = renderFeedList(
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
      />,
    );

    await waitFor(() => {
      expect(getByText("Desktop inverted scroll article 1")).toBeTruthy();
    });

    expect(container.querySelector("[data-inverted-scroll='true']")).toBeNull();
    expect(container.querySelector("[data-feed-load-more-sentinel='true']")).toBeNull();
  });

  test("activates inverted scroll on mobile viewports when the preference is enabled", () => {
    expect(isFeedInvertedScrollActive(true, true)).toBe(true);
    expect(isFeedInvertedScrollActive(false, true)).toBe(false);
    expect(isFeedInvertedScrollActive(true, false)).toBe(false);
  });

  test("keeps a short mobile inverted feed surface stretched to the viewport", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    const articles = Array.from({ length: 2 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/mobile-inverted-short-${index + 1}`,
        title: `Mobile inverted short article ${index + 1}`,
      }),
    );

    const { container, getByText } = renderFeedList(
      <div
        data-radix-scroll-area-viewport=""
        ref={(viewport) => {
          if (!viewport) {
            return;
          }

          Object.defineProperty(viewport, "clientHeight", {
            configurable: true,
            get() {
              return 482;
            },
          });
          Object.defineProperty(viewport, "scrollHeight", {
            configurable: true,
            get() {
              return 482;
            },
          });
        }}
      >
        <FeedList
          articleFilter="unread"
          articlesPerPage={12}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:unread"
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

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("librerss:storage-sync", {
          detail: {
            key: MOBILE_INVERTED_SCROLL_STORAGE_KEY,
            value: JSON.stringify(true),
          },
        }),
      );
    });

    await waitFor(() => {
      expect(container.querySelector("[data-inverted-scroll='true']")).toBeTruthy();
      expect(
        container.querySelector("[data-feed-surface-mode='virtualized']"),
      ).toBeTruthy();
      expect(container.querySelector("[data-feed-virtualizer='true']")).toBeTruthy();
    }, { timeout: 5000 });

    const feedSurface = container.querySelector<HTMLElement>(
      "[data-feed-surface-mode='virtualized']",
    );

    if (!feedSurface) {
      throw new Error("Expected the inverted feed surface to render.");
    }

    expect(feedSurface.style.height).toBe("100%");
  });

  test("reclaims a restored mid-list viewport before inverted scroll ownership is claimed", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    let viewportScrollTop = 1554;
    const viewportClientHeight = 482;
    const viewportScrollHeight = 2990;
    const reclaimedViewportScrollTop = viewportScrollHeight - viewportClientHeight;
    const articles = Array.from({ length: 12 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/mobile-inverted-restored-${index + 1}`,
        title: `Mobile inverted restored article ${index + 1}`,
      }),
    );

    const { container } = renderFeedList(
      <div
        data-radix-scroll-area-viewport=""
        ref={(viewport) => {
          if (!viewport) {
            return;
          }

          Object.defineProperty(viewport, "clientHeight", {
            configurable: true,
            get() {
              return viewportClientHeight;
            },
          });
          Object.defineProperty(viewport, "scrollHeight", {
            configurable: true,
            get() {
              return viewportScrollHeight;
            },
          });
          Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            get() {
              return viewportScrollTop;
            },
            set(nextValue: number) {
              viewportScrollTop = nextValue;
            },
          });
          Object.defineProperty(viewport, "scrollTo", {
            configurable: true,
            value: ({ top }: { top?: number }) => {
              viewportScrollTop = top ?? viewportScrollTop;
            },
          });
        }}
      >
        <FeedList
          articleFilter="unread"
          articlesPerPage={12}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:unread"
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

    await waitFor(() => {
      expect(container.querySelector("[data-inverted-scroll='true']")).toBeTruthy();
      expect(container.querySelector("[data-feed-virtualizer='true']")).toBeTruthy();
    }, { timeout: 5000 });

    await flushFeedListAsyncWork();

    await waitFor(() => {
      expect(viewportScrollTop).toBe(reclaimedViewportScrollTop);
    }, { timeout: 5000 });
  });

  test("keeps the feed virtualized while an article is expanded", async () => {
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
        container.querySelector("[data-feed-surface-mode='virtualized']"),
      ).toBeTruthy();
      expect(
        container.querySelector("[data-feed-virtualizer='true']"),
      ).toBeTruthy();
    });
  });

  test("keeps the feed virtualized after collapsing an expanded article", async () => {
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
      expect(
        container.querySelector("[data-feed-virtualizer='true']"),
      ).toBeTruthy();
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

    await waitFor(() => {
      expect(
        container.querySelector("[data-feed-surface-mode='virtualized']"),
      ).toBeTruthy();
      expect(
        container.querySelector("[data-feed-virtualizer='true']"),
      ).toBeTruthy();
    });
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

  test("does not reset a replacement viewport while collapse scroll restore is active", async () => {
    const firstArticle = buildFeedListArticle();
    const secondArticle = buildFeedListArticle({
      id: 2,
      link: "https://example.com/articles/replacement-viewport-second",
      title: "Replacement viewport second article",
    });
    let firstViewportScrollTop = 180;
    let replacementViewportScrollTop = 320;

    const { rerender } = renderFeedList(
      <div
        data-radix-scroll-area-viewport=""
        ref={(viewport) => {
          if (!viewport) {
            return;
          }

          Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            get() {
              return firstViewportScrollTop;
            },
            set(nextValue: number) {
              firstViewportScrollTop = nextValue;
            },
          });
        }}
      >
        <FeedList
          articleFilter="unread"
          articlesPerPage={12}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:unread"
          filteredFeed={[firstArticle, secondArticle]}
          hydratedArticleLinks={{}}
          hydratingArticleLinks={{}}
          isCollapseScrollRestoreActive={false}
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

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div
          data-radix-scroll-area-viewport=""
          ref={(viewport) => {
            if (!viewport) {
              return;
            }

            Object.defineProperty(viewport, "scrollTop", {
              configurable: true,
              get() {
                return replacementViewportScrollTop;
              },
              set(nextValue: number) {
                replacementViewportScrollTop = nextValue;
              },
            });
          }}
        >
          <FeedList
            articleFilter="unread"
            articlesPerPage={12}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:unread"
            filteredFeed={[firstArticle, secondArticle]}
            hydratedArticleLinks={{}}
            hydratingArticleLinks={{}}
            isCollapseScrollRestoreActive={true}
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

    expect(replacementViewportScrollTop).toBe(320);
  });

  test("still resets the viewport when the feed view changes during active collapse restore", async () => {
    const firstArticle = buildFeedListArticle();
    const secondArticle = buildFeedListArticle({
      id: 2,
      link: "https://example.com/articles/reset-during-restore-second",
      title: "Reset during restore second article",
    });
    let scrollTop = 240;

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
          isCollapseScrollRestoreActive={false}
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
            articleFilter="read"
            articlesPerPage={12}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:read"
            filteredFeed={[secondArticle]}
            hydratedArticleLinks={{}}
            hydratingArticleLinks={{}}
            isCollapseScrollRestoreActive={true}
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

  test("resets a restored viewport scroll position on first mount", async () => {
    const firstArticle = buildFeedListArticle();
    const secondArticle = buildFeedListArticle({
      id: 2,
      link: "https://example.com/articles/initial-viewport-second",
      title: "Initial viewport second article",
    });
    let restoredScrollTop = 320;

    const { getByText } = renderFeedList(
      <div
        data-radix-scroll-area-viewport=""
        ref={(viewport) => {
          if (!viewport) {
            return;
          }

          Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            get() {
              return restoredScrollTop;
            },
            set(nextValue: number) {
              restoredScrollTop = nextValue;
            },
          });
        }}
      >
        <FeedList
          articleFilter="unread"
          articlesPerPage={12}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:unread"
          filteredFeed={[firstArticle, secondArticle]}
          hydratedArticleLinks={{}}
          hydratingArticleLinks={{}}
          isCollapseScrollRestoreActive={false}
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

    expect(restoredScrollTop).toBe(0);
  });

  test("resets visible article count and scroll position when refreshEpoch increments", async () => {
    let testContainer: HTMLElement | null = null;
    let scrollTop = 0;
    const articles = Array.from({ length: 10 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/refresh-epoch-${index + 1}`,
        title: `Refresh epoch article ${index + 1}`,
      }),
    );

    const viewportRef = (viewport: HTMLDivElement | null) => {
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
      Object.defineProperty(viewport, "scrollTop", {
        configurable: true,
        get() {
          return scrollTop;
        },
        set(nextValue: number) {
          scrollTop = nextValue;
        },
      });
    };

    const { container, getByText, rerender } = renderFeedList(
      <div data-radix-scroll-area-viewport="" ref={viewportRef}>
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
          refreshEpoch={0}
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    testContainer = container;

    // Auto-fill expands all 10 articles (same pattern as existing viewport-fill test)
    await waitFor(() => {
      expect(getByText("Refresh epoch article 10")).toBeTruthy();
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(10);
    });

    // Simulate the user having scrolled
    scrollTop = 400;

    // Re-render with incremented refreshEpoch (same feedViewKey, same filter)
    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="" ref={viewportRef}>
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
            refreshEpoch={1}
            searchTerm=""
            showFavicons={false}
            updatingArticleState={{}}
          />
        </div>
      </ThemeProvider>,
    );

    // Scroll position should be reset to top
    expect(scrollTop).toBe(0);
    // Visible count resets to articlesPerPage, then re-autofills until the viewport regains overflow.
    await waitFor(() => {
      const renderedRows = container.querySelectorAll("[data-scroll-restore-key]").length;

      expect(renderedRows).toBeGreaterThanOrEqual(8);
      expect(renderedRows).toBeLessThanOrEqual(10);
    });
  });
});
