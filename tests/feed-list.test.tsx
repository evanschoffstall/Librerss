import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import { FeedList } from "@/app/dashboard/components/feed/FeedList";

import {
  buildFeedListArticle,
  installFeedListDomMocks,
  MOBILE_INVERTED_SCROLL_STORAGE_KEY,
  restoreFeedListDomMocks,
  setFeedListMobileViewport,
} from "./feed-list-test-utils";

function renderFeedList(node: React.ReactElement) {
  return render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      {node}
    </ThemeProvider>,
  );
}

beforeEach(() => {
  installFeedListDomMocks();
});

afterEach(() => {
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

  test("keeps auto-filling sparse starred results across multiple pages", async () => {
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
      expect(getByText("Starred auto-fill article 13")).toBeTruthy();
      expect(queryByText("Starred auto-fill article 14")).toBeNull();
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(
        13,
      );
    });
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

  test("does not auto-fill standard-scroll pagination on scroll intent alone", async () => {
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
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(4);
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

  test("activates inverted scroll on mobile viewports when the preference is enabled", async () => {
    window.localStorage.setItem(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      JSON.stringify(true),
    );
    setFeedListMobileViewport(true);

    const articles = Array.from({ length: 12 }, (_value, index) =>
      buildFeedListArticle({
        id: index + 1,
        link: `https://example.com/articles/inverted-scroll-${index + 1}`,
        title: `Inverted scroll article ${index + 1}`,
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
              const renderedRows =
                container.querySelectorAll("[data-scroll-restore-key]").length;

              return Math.max(renderedRows, 4) * 140;
            },
          });
          Object.defineProperty(viewport, "scrollTop", {
            configurable: true,
            get() {
              return 0;
            },
            set() {},
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
      expect(container.querySelector("[data-inverted-scroll='true']")).toBeTruthy();
      expect(container.querySelector("[data-feed-load-more-sentinel='true']")).toBeTruthy();
      expect(container.querySelectorAll("[data-item-index]")).toHaveLength(4);
    });
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
    // Visible count resets to articlesPerPage (4), then re-autofills until scrollable (8)
    await waitFor(() => {
      expect(container.querySelectorAll("[data-scroll-restore-key]")).toHaveLength(8);
    });
  });
});
