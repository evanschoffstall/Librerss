import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import {
  FEED_SERVER_LOAD_REARM_COOLDOWN_MS,
  SKELETON_MIN_VISIBLE_MS,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

import {
  buildFeedListArticle,
  installFeedListDomMocks,
  MOBILE_INVERTED_SCROLL_STORAGE_KEY,
  restoreFeedListDomMocks,
  setFeedListMobileViewport,
} from "./feed-list-test-utils";

let FeedList: typeof import("@/app/dashboard/dashboard-components/feed-view/FeedList").FeedList;
const originalConsoleError = console.error;

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

function readFirstRenderedArticleKey(container: HTMLElement) {
  const firstArticle = container.querySelector<HTMLElement>(
    "article[data-article-key]",
  );

  return firstArticle?.dataset.articleKey ?? null;
}

function readRenderedArticleKeys(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("article[data-article-key]"),
  )
    .map((article) => article.dataset.articleKey)
    .filter(
      (articleKey): articleKey is string =>
        typeof articleKey === "string" && articleKey.length > 0,
    );
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
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion,
  }));
  mock.module("@/lib/hooks", () => ({
    useIsBelowDesktop: () => true,
    useLocalStorage: (key: string, initialValue: boolean) => [
      key === MOBILE_INVERTED_SCROLL_STORAGE_KEY ? true : initialValue,
      mock(() => {}),
    ],
  }));
  installFeedListDomMocks();
  ({ FeedList } = await import(
    `@/app/dashboard/dashboard-components/feed-view/FeedList?test=${Date.now()}-${Math.random()}`
  ));
});

afterEach(() => {
  mock.restore();
  console.error = originalConsoleError;
  restoreFeedListDomMocks();
});

test("keeps inverted server pagination disarmed while the reader stays pinned at the top boundary after a reveal", async () => {
  const feedViewKey = "test-inverted-pinned-boundary-feed-view";

  window.localStorage.setItem(
    MOBILE_INVERTED_SCROLL_STORAGE_KEY,
    JSON.stringify(true),
  );
  setFeedListMobileViewport(true);

  const articlesPageOne = buildSequentialFeedListArticles(
    "inverted-pinned-boundary",
    4,
  );
  const articlesPageTwo = buildSequentialFeedListArticles(
    "inverted-pinned-boundary",
    20,
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
        feedViewKey={feedViewKey}
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
          feedViewKey={feedViewKey}
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
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        FEED_SERVER_LOAD_REARM_COOLDOWN_MS + SKELETON_MIN_VISIBLE_MS + 100,
      ),
    );
    scrollTop = 0;
    viewport.dispatchEvent(new Event("touchmove"));
    viewport.dispatchEvent(new Event("wheel"));
    viewport.dispatchEvent(new Event("scroll"));
  });

  await flushFeedListAsyncWork();

  await waitFor(() => {
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

test("rearms inverted server pagination after cooldown when one gesture moves away from and back to the top boundary", async () => {
  const feedViewKey = "test-inverted-rearm-gesture-feed-view";

  window.localStorage.setItem(
    MOBILE_INVERTED_SCROLL_STORAGE_KEY,
    JSON.stringify(true),
  );
  setFeedListMobileViewport(true);

  const articlesPageOne = buildSequentialFeedListArticles(
    "inverted-rearm-gesture",
    4,
  );
  const articlesPageTwo = buildSequentialFeedListArticles(
    "inverted-rearm-gesture",
    8,
  );
  const articlesPageThree = buildSequentialFeedListArticles(
    "inverted-rearm-gesture",
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
        feedViewKey={feedViewKey}
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
          feedViewKey={feedViewKey}
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
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    scrollTop = 320;
    viewport.dispatchEvent(new Event("touchmove"));
    viewport.dispatchEvent(new Event("wheel"));
    scrollTop = 0;
    viewport.dispatchEvent(new Event("touchmove"));
    viewport.dispatchEvent(new Event("wheel"));
    viewport.dispatchEvent(new Event("scroll"));
  });

  await waitFor(() => {
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  const firstRenderedArticleKeyBeforeHydration =
    readFirstRenderedArticleKey(container);
  expect(firstRenderedArticleKeyBeforeHydration).not.toBeNull();
  if (!firstRenderedArticleKeyBeforeHydration) {
    throw new Error("Expected a rendered article key before hydration.");
  }

  rerender(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <div data-radix-scroll-area-viewport="">
        <FeedList
          articleFilter="all"
          articlesPerPage={4}
          expandedArticleKey={null}
          feedViewKey={feedViewKey}
          filteredFeed={articlesPageThree}
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

  await waitFor(() => {
    expect(readRenderedArticleKeys(container)).toContain(
      firstRenderedArticleKeyBeforeHydration,
    );
    expect(scrollTop).toBeGreaterThan(0);
  });
});
