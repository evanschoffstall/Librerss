import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realMotionReactModule from "motion/react";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import {
  buildFeedListArticle,
  installFeedListDomMocks,
  MOBILE_INVERTED_SCROLL_STORAGE_KEY,
  restoreFeedListDomMocks,
  setFeedListMobileViewport,
} from "./feed-list-test-utils";

let FeedList: typeof import("@/app/dashboard/dashboard-components/feed-view/FeedList").FeedList;
const originalConsoleError = console.error;
let hooksImportVersion = 0;
let libImportVersion = 0;

type MockMotionProps = React.HTMLAttributes<HTMLElement> & {
  animate?: unknown;
  exit?: unknown;
  initial?: unknown;
  layout?: unknown;
  layoutId?: unknown;
  transition?: unknown;
};

function serializeMockMotionValue(value: unknown) {
  if (typeof value === "undefined") {
    return undefined;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

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
          return React.createElement(
            tag as string,
            {
              ...props,
              "data-motion-initial": serializeMockMotionValue(_initial),
              ref,
            },
            props.children,
          );
        },
      ),
  },
);

function buildSequentialFeedListArticles(prefix: string, count: number) {
  return Array.from({ length: count }, (_value, index) =>
    buildFeedListArticle({
      id: index + 1,
      link: `https://example.com/articles/${prefix}-${index + 1}`,
      title: `${prefix} article ${index + 1}`,
    }),
  );
}

async function flushFeedListAsyncWork() {
  await act(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function loadFeedListWithLibOverrides(
  overrides: Partial<typeof import("@/lib")> = {},
) {
  hooksImportVersion += 1;
  const realHooksModule = await import(
    `@/lib/hooks?test=${hooksImportVersion}`
  );
  libImportVersion += 1;
  const realLibModule = await import(`@/lib?test=${libImportVersion}`);
  mock.module("@/lib/hooks", () => ({
    ...realHooksModule,
  }));
  mock.module("@/lib", () => ({
    ...realLibModule,
    ...overrides,
  }));
  ({ FeedList } = await import(
    `@/app/dashboard/dashboard-components/feed-view/FeedList?test=${Date.now()}-${Math.random()}`
  ));
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
      if (
        firstArg.includes(
          "`NaN` is an invalid value for the `paddingBottom` css style property.",
        )
      ) {
        return;
      }
    }

    originalConsoleError(...args);
  }) as typeof console.error;
  mock.module("motion/react", () => ({
    ...realMotionReactModule,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion,
  }));
  installFeedListDomMocks();
  await loadFeedListWithLibOverrides();
});

afterEach(() => {
  mock.restore();
  console.error = originalConsoleError;
  restoreFeedListDomMocks();
});

describe("FeedList", () => {
  test("shows only one page when the viewport still cannot scroll (count ceiling enforced)", async () => {
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
      expect(getByText("Viewport fill article 4")).toBeTruthy();
      expect(queryByText("Viewport fill article 5")).toBeNull();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
    });
  });

  test("shows only one page for starred results when the viewport cannot scroll (count ceiling enforced)", async () => {
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

    await waitFor(
      () => {
        const renderedRows = container.querySelectorAll(
          "[data-scroll-restore-key]",
        ).length;
        expect(renderedRows).toBe(4);
      },
      { timeout: 5000 },
    );

    expect(getByText("Starred auto-fill article 4")).toBeTruthy();
    expect(queryByText("Starred auto-fill article 5")).toBeNull();
  });

  test("keeps starred auto-fill bounded to one page without an owned refill target", async () => {
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
      expect(getByText("Starred exhausted article 4")).toBeTruthy();
      expect(() => getByText("Starred exhausted article 6")).toThrow();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(
        container.querySelector("[data-feed-load-more-sentinel='true']"),
      ).not.toBeNull();
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
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(
        container.querySelectorAll("[data-feed-load-more-skeletons='true']"),
      ).toHaveLength(1);
      expect(
        container.querySelectorAll(
          "[data-feed-load-more-skeletons='true'] [data-dashboard-feed-list-skeleton-item='true']",
        ),
      ).toHaveLength(4);
    });
  });

  test("renders one full page of loading-more skeleton rows when fewer than a full page remain", async () => {
    const articles = Array.from({ length: 6 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/loading-more-partial-${index + 1}`,
        title: `Loading more partial article ${index + 1}`,
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
          loadingMoreArticleCount={2}
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
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(
        container.querySelectorAll("[data-feed-load-more-skeletons='true']"),
      ).toHaveLength(1);
      expect(
        container.querySelectorAll(
          "[data-feed-load-more-skeletons='true'] [data-dashboard-feed-list-skeleton-item='true']",
        ),
      ).toHaveLength(4);
    });
  });

  test("renders hydrated feed content without an extra enter phase after skeleton loading", async () => {
    const articles = buildSequentialFeedListArticles("hydrated-snap", 4);

    const { container } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
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

    const feedSurface = container.querySelector<HTMLElement>(
      "[data-feed-surface-mode='plain']",
    );
    const feedFrame = feedSurface?.firstElementChild as HTMLElement | null;

    expect(feedFrame).not.toBeNull();
    expect(
      container.querySelector("[data-dashboard-feed-list-skeleton='true']"),
    ).toBeNull();
    expect(feedFrame?.getAttribute("style") ?? "").not.toContain("opacity: 0");
  });

  test("shows article skeletons instead of the up-to-date empty state during an empty refresh", async () => {
    const { container, queryByText } = renderFeedList(
      <div data-radix-scroll-area-viewport="">
        <FeedList
          articleFilter="unread"
          articlesPerPage={4}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:unread"
          filteredFeed={[]}
          hydratedArticleLinks={{}}
          hydratingArticleLinks={{}}
          isInitialLoading={false}
          isRefreshing
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
      expect(
        container.querySelector("[data-dashboard-feed-list-skeleton='true']"),
      ).toBeTruthy();
      expect(
        container.querySelector("[data-feed-empty-state='true']"),
      ).toBeNull();
      expect(queryByText("You're up to date")).toBeNull();
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
      expect(getByText("Idle auto-fill article 4")).toBeTruthy();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  test("requests another desktop page after unread removals shrink a user-owned viewport", async () => {
    let testContainer: HTMLElement | null = null;
    let scrollTop = 0;
    const initialArticles = buildSequentialFeedListArticles(
      "desktop-refill",
      12,
    );
    const onLoadMore = mock(() => {});

    const { container, getByText, rerender } = renderFeedList(
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
          articleFilter="unread"
          articlesPerPage={4}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:unread"
          filteredFeed={initialArticles}
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
      expect(getByText("desktop-refill article 4")).toBeTruthy();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
    });

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    scrollTop = 72;
    await act(async () => {
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="unread"
            articlesPerPage={4}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:unread"
            filteredFeed={initialArticles.slice(0, 4)}
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
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="unread"
            articlesPerPage={4}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:unread"
            filteredFeed={buildSequentialFeedListArticles("desktop-refill", 8)}
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
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(8);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  test("waits to refill desktop unread depletion until the remaining unread window drops below a page plus overflow", async () => {
    let testContainer: HTMLElement | null = null;
    const initialArticles = buildSequentialFeedListArticles(
      "desktop-deplete",
      6,
    );
    const onLoadMore = mock(() => {});

    const { container, getByText, rerender } = renderFeedList(
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

              return renderedRows === 0 ? 2681 : 2681;
            },
          });
        }}
      >
        <FeedList
          articleFilter="unread"
          articlesPerPage={4}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:unread"
          filteredFeed={initialArticles}
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
      expect(getByText("desktop-deplete article 4")).toBeTruthy();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="unread"
            articlesPerPage={4}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:unread"
            filteredFeed={initialArticles.slice(0, 5)}
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
      </ThemeProvider>,
    );

    await flushFeedListAsyncWork();

    expect(
      container.querySelectorAll("[data-scroll-restore-key]"),
    ).toHaveLength(5);
    expect(onLoadMore).toHaveBeenCalledTimes(0);

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="unread"
            articlesPerPage={4}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:unread"
            filteredFeed={initialArticles.slice(0, 4)}
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
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  test("waits to refill inverted unread depletion until the remaining unread window drops below a page plus overflow", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    const initialArticles = buildSequentialFeedListArticles(
      "inverted-deplete",
      6,
    );
    const onLoadMore = mock(() => {});
    let testContainer: HTMLElement | null = null;
    let scrollTop = 0;

    const { container, getByText, rerender } = renderFeedList(
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

              return Math.max(renderedRows * 120, 600);
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
          articleFilter="unread"
          articlesPerPage={4}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:unread"
          filteredFeed={initialArticles}
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
      expect(getByText("inverted-deplete article 4")).toBeTruthy();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="unread"
            articlesPerPage={4}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:unread"
            filteredFeed={initialArticles.slice(0, 5)}
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
      </ThemeProvider>,
    );

    await flushFeedListAsyncWork();

    expect(
      container.querySelectorAll("[data-scroll-restore-key]"),
    ).toHaveLength(5);
    expect(onLoadMore).toHaveBeenCalledTimes(0);

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="unread"
            articlesPerPage={4}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:unread"
            filteredFeed={initialArticles.slice(0, 4)}
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
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  test("hides the exhausted desktop server boundary even when the load-more callback is still wired", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(false),
    );

    const articles = buildSequentialFeedListArticles(
      "desktop-server-exhausted",
      12,
    );
    const onLoadMore = mock(() => {});
    let scrollTop = 0;

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
              return 400;
            },
          });
          Object.defineProperty(viewport, "scrollHeight", {
            configurable: true,
            get() {
              return 12 * 140;
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
          articlesPerPage={12}
          canLoadMoreFromServer={false}
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

    await waitFor(() => {
      expect(getByText("desktop-server-exhausted article 12")).toBeTruthy();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(12);
      expect(
        container.querySelector("[data-feed-load-more-sentinel='true']"),
      ).toBeNull();
    });

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    await act(async () => {
      scrollTop = 1280;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  test("ignores a restored standard-mode bottom scroll until the reader scrolls again", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(false),
    );

    const articles = buildSequentialFeedListArticles(
      "desktop-restored-bottom",
      12,
    );
    const onLoadMore = mock(() => {});
    let scrollTop = 0;

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
              return 12 * 140;
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
          articlesPerPage={12}
          canLoadMoreFromServer
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

    await act(async () => {
      scrollTop = 1280;
      viewport.dispatchEvent(new Event("scroll"));
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).not.toHaveBeenCalled();

    await act(async () => {
      viewport.dispatchEvent(new Event("wheel"));
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  test("requests one inverted server page after explicit top-edge scroll intent on an underfilled feed", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    const articles = Array.from({ length: 4 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/inverted-server-underfill-${index + 1}`,
        title: `Inverted server underfill article ${index + 1}`,
      }),
    );
    const onLoadMore = mock(() => {});
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
              return 600;
            },
          });
          Object.defineProperty(viewport, "scrollHeight", {
            configurable: true,
            get() {
              return 400;
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

    await waitFor(() => {
      expect(getByText("Inverted server underfill article 4")).toBeTruthy();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(queryByText("Inverted server underfill article 5")).toBeNull();
    });

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    await act(async () => {
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  test("does not request another inverted server page from repeated top-edge intent without leaving the boundary", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    const articlesPageOne = buildSequentialFeedListArticles(
      "inverted-consecutive",
      4,
    );
    const articlesPageTwo = buildSequentialFeedListArticles(
      "inverted-consecutive",
      8,
    );
    const onLoadMore = mock(() => {});
    let scrollTop = 0;

    const { container, rerender } = renderFeedList(
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
              const renderedRows = container.querySelectorAll(
                "[data-scroll-restore-key]",
              ).length;

              return Math.max(renderedRows * 80, 400);
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
          filteredFeed={articlesPageOne}
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

    await act(async () => {
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="all"
            articlesPerPage={4}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:all"
            filteredFeed={articlesPageTwo}
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
      </ThemeProvider>,
    );

    await flushFeedListAsyncWork();

    await act(async () => {
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  test("requests consecutive inverted server pages only after leaving and re-reaching the top boundary", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    const articlesPageOne = buildSequentialFeedListArticles(
      "inverted-boundary-rearm",
      4,
    );
    const articlesPageTwo = buildSequentialFeedListArticles(
      "inverted-boundary-rearm",
      8,
    );
    const onLoadMore = mock(() => {});
    let scrollTop = 0;

    const { container, rerender } = renderFeedList(
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
              const renderedRows = container.querySelectorAll(
                "[data-scroll-restore-key]",
              ).length;

              return Math.max(renderedRows * 80, 400);
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
          filteredFeed={articlesPageOne}
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

    await act(async () => {
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="all"
            articlesPerPage={4}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:all"
            filteredFeed={articlesPageTwo}
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
      </ThemeProvider>,
    );

    await flushFeedListAsyncWork();

    await act(async () => {
      scrollTop = 800;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      scrollTop = 800;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await act(async () => {
      scrollTop = 0;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    });
  });

  test("rearms inverted server pagination after leaving the top boundary during cooldown", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    const articlesPageOne = buildSequentialFeedListArticles(
      "inverted-cooldown-rearm",
      4,
    );
    const articlesPageTwo = buildSequentialFeedListArticles(
      "inverted-cooldown-rearm",
      8,
    );
    const onLoadMore = mock(() => {});
    let scrollTop = 0;

    const { container, rerender } = renderFeedList(
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
              const renderedRows = container.querySelectorAll(
                "[data-scroll-restore-key]",
              ).length;

              return Math.max(renderedRows * 80, 400);
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
          filteredFeed={articlesPageOne}
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

    await act(async () => {
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="all"
            articlesPerPage={4}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:all"
            filteredFeed={articlesPageTwo}
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
      </ThemeProvider>,
    );

    await flushFeedListAsyncWork();

    await act(async () => {
      scrollTop = 800;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      scrollTop = 0;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    });
  });

  test("does not push the viewport back down after inverted paging once the user resumes scrolling", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    const articles = buildSequentialFeedListArticles(
      "inverted-anchor-release",
      12,
    );
    let measuredGrowth = 0;
    let scrollTop = 160;

    const { container, rerender } = renderFeedList(
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
              const renderedRows = container.querySelectorAll(
                "[data-scroll-restore-key]",
              ).length;

              return Math.max(renderedRows, 4) * 140 + measuredGrowth;
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
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
    });

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    await act(async () => {
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(8);
    });

    await flushFeedListAsyncWork();

    const scrollTopAfterReveal = scrollTop;
    const resumedScrollTop = Math.max(0, scrollTopAfterReveal - 120);

    await act(async () => {
      scrollTop = resumedScrollTop;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    measuredGrowth = 220;

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
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
        </div>
      </ThemeProvider>,
    );

    await flushFeedListAsyncWork();

    expect(scrollTop).toBe(resumedScrollTop);
  });

  test("does not clamp inverted scroll to the top boundary when later measurements shrink after multiple reveals", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    const articles = buildSequentialFeedListArticles(
      "inverted-height-floor",
      24,
    );
    let viewportHeightFactor = 120;
    let scrollTop = 0;

    const { container, rerender } = renderFeedList(
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
              const renderedRows = Math.max(
                container.querySelectorAll("[data-scroll-restore-key]").length,
                4,
              );

              return renderedRows * viewportHeightFactor;
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

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    await act(async () => {
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(8);
    });

    await act(async () => {
      scrollTop = 800;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await act(async () => {
      scrollTop = 0;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(12);
    });

    const stableScrollTop = 260;

    await act(async () => {
      scrollTop = stableScrollTop;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    viewportHeightFactor = 100;

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
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
        </div>
      </ThemeProvider>,
    );

    await flushFeedListAsyncWork();

    expect(scrollTop).toBe(stableScrollTop);
  });

  test("loads one additional standard-scroll page after explicit 70 percent scroll intent", async () => {
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
              const renderedRows = container.querySelectorAll(
                "[data-scroll-restore-key]",
              ).length;

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
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(queryByText("Standard scroll article 12")).toBeNull();
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
      expect(getByText("Standard scroll article 4")).toBeTruthy();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(8);
      expect(getByText("Standard scroll article 8")).toBeTruthy();
      expect(queryByText("Standard scroll article 12")).toBeNull();
    });
  });

  test("rearms standard pagination after a revealed page makes the previous bottom position non-terminal", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(false),
    );

    const articles = Array.from({ length: 12 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/standard-scroll-rearm-${index + 1}`,
        title: `Standard scroll rearm article ${index + 1}`,
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
              const renderedRows = container.querySelectorAll(
                "[data-scroll-restore-key]",
              ).length;

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
      expect(getByText("Standard scroll rearm article 4")).toBeTruthy();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(queryByText("Standard scroll rearm article 8")).toBeNull();
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
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(8);
      expect(getByText("Standard scroll rearm article 8")).toBeTruthy();
      expect(queryByText("Standard scroll rearm article 12")).toBeNull();
    });

    await act(async () => {
      scrollTop = viewport.scrollHeight;
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("wheel"));
    });

    await waitFor(() => {
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(12);
      expect(getByText("Standard scroll rearm article 12")).toBeTruthy();
    });
  });

  test("keeps desktop server pagination locked until one second after a server reveal settles", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(false),
    );

    const firstPage = buildSequentialFeedListArticles("desktop-server-lock", 8);
    const secondPage = buildSequentialFeedListArticles(
      "desktop-server-lock",
      12,
    );
    const onLoadMore = mock(() => {});
    let scrollTop = 0;

    const { container, rerender } = renderFeedList(
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
              const renderedRows = container.querySelectorAll(
                "[data-scroll-restore-key]",
              ).length;

              return Math.max(renderedRows, 8) * 140;
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
          articlesPerPage={8}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:all"
          filteredFeed={firstPage}
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

    await act(async () => {
      scrollTop = 520;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="all"
            articlesPerPage={8}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:all"
            filteredFeed={secondPage}
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
      </ThemeProvider>,
    );

    await flushFeedListAsyncWork();

    await act(async () => {
      scrollTop = 920;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      scrollTop = 400;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await act(async () => {
      scrollTop = 920;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(2);
    });
  });

  test("rearms desktop server pagination after leaving the bottom boundary during cooldown", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(false),
    );

    const firstPage = buildSequentialFeedListArticles(
      "desktop-cooldown-rearm",
      8,
    );
    const secondPage = buildSequentialFeedListArticles(
      "desktop-cooldown-rearm",
      12,
    );
    const onLoadMore = mock(() => {});
    let scrollTop = 0;

    const { container, rerender } = renderFeedList(
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
              const renderedRows = container.querySelectorAll(
                "[data-scroll-restore-key]",
              ).length;

              return Math.max(renderedRows, 8) * 140;
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
          articlesPerPage={8}
          expandedArticleKey={null}
          feedViewKey="system-all-feeds:all"
          filteredFeed={firstPage}
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

    await act(async () => {
      scrollTop = 520;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="all"
            articlesPerPage={8}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:all"
            filteredFeed={secondPage}
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
      </ThemeProvider>,
    );

    await flushFeedListAsyncWork();

    await act(async () => {
      scrollTop = 400;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await flushFeedListAsyncWork();

    expect(onLoadMore).toHaveBeenCalledTimes(1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      scrollTop = 920;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(onLoadMore).toHaveBeenCalledTimes(2);
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
              const renderedRows = container.querySelectorAll(
                "[data-scroll-restore-key]",
              ).length;

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
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(queryByText("Standard scroll idle article 12")).toBeNull();
    });

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) {
      throw new Error("Expected a feed viewport wrapper.");
    }

    await act(async () => {
      scrollTop = 100;
      viewport.dispatchEvent(new Event("touchmove"));
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
      expect(queryByText("Standard scroll idle article 12")).toBeNull();
    });
  });

  test("resets revealed pages when refreshEpoch changes during an active refresh", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(false),
    );

    const articles = Array.from({ length: 12 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/refresh-epoch-${index + 1}`,
        title: `Refresh epoch article ${index + 1}`,
      }),
    );
    let scrollTop = 0;

    const { container, getByText, queryByText, rerender } = renderFeedList(
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
              const renderedRows = container.querySelectorAll(
                "[data-scroll-restore-key]",
              ).length;

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
          refreshEpoch={0}
          searchTerm=""
          showFavicons={false}
          updatingArticleState={{}}
        />
      </div>,
    );

    await waitFor(() => {
      expect(getByText("Refresh epoch article 4")).toBeTruthy();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
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
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(8);
      expect(getByText("Refresh epoch article 8")).toBeTruthy();
      expect(queryByText("Refresh epoch article 12")).toBeNull();
    });

    rerender(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="all"
            articlesPerPage={4}
            expandedArticleKey={null}
            feedViewKey="system-all-feeds:all"
            filteredFeed={articles}
            hydratedArticleLinks={{}}
            hydratingArticleLinks={{}}
            isInitialLoading={false}
            isRefreshing={true}
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

    await waitFor(() => {
      const renderedRows = container.querySelectorAll(
        "[data-scroll-restore-key]",
      ).length;

      expect(renderedRows).toBeGreaterThanOrEqual(4);
      expect(renderedRows).toBeLessThanOrEqual(6);
      expect(getByText("Refresh epoch article 4")).toBeTruthy();
      expect(queryByText("Refresh epoch article 8")).toBeNull();
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

    expect(
      container.querySelector("[data-feed-load-more-sentinel='true']"),
    ).toBeNull();
  });

  test("renders the standard feed surface while an article is expanded", async () => {
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
        container.querySelector("[data-feed-virtualizer='true']"),
      ).toBeNull();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(2);
    });
  });

  test("restores feed virtualization after collapsing an expanded article", async () => {
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
      ).toBeNull();
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

  test("resets visible article count and scroll position when refreshEpoch increments during active refresh", async () => {
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

    // With the count ceiling enforced, only one page (articlesPerPage=4) renders initially.
    await waitFor(() => {
      expect(getByText("Refresh epoch article 4")).toBeTruthy();
      expect(
        container.querySelectorAll("[data-scroll-restore-key]"),
      ).toHaveLength(4);
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
            isRefreshing={true}
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
    // Visible count resets to articlesPerPage and stays at one page (count ceiling enforced).
    await waitFor(() => {
      const renderedRows = container.querySelectorAll(
        "[data-scroll-restore-key]",
      ).length;

      expect(renderedRows).toBe(4);
    });
  });
});
