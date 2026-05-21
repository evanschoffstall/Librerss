import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import {
  DASHBOARD_FEED_SURFACE_CLASS_NAME,
  DashboardFeedViewport,
  DashboardFilterBar,
  resolveFeedScrollbarMetrics,
} from "@/app/dashboard/dashboard-components/layout";
import {
  ARTICLE_FILTER_OPTIONS,
  ARTICLE_SORT_ORDER_OPTIONS,
  type ArticleFilter,
  type ArticleSortOrder,
} from "@/app/dashboard/dashboard-services/article";
import { DASHBOARD_FEED_WIDTH_CLASS_NAME } from "@/app/dashboard/shared";

describe("DashboardFilterBar", () => {
  test("renders the full filter-bar skeleton while the dashboard shell is loading", () => {
    const { container, queryByRole } = render(
      <DashboardFilterBar
        articleFilter="unread"
        isShellLoading
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={() => {}}
      />,
    );

    expect(
      container.querySelector('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toBeTruthy();
    expect(
      container.querySelectorAll(
        '[data-dashboard-filter-bar-chip-skeleton="true"]',
      ),
    ).toHaveLength(5);
    expect(queryByRole("button", { name: "unread" })).toBeNull();
  });

  test("shares the feed-width CSS contract with the article viewport", () => {
    const { container } = render(
      <>
        <DashboardFilterBar
          articleFilter="unread"
          lastRefreshLabel="just now"
          loading={false}
          onArticleFilterChange={() => {}}
        />
        <DashboardFeedViewport>
          <div>Feed</div>
        </DashboardFeedViewport>
      </>,
    );

    const linkedWidthSurfaces = container.querySelectorAll(
      '[data-dashboard-width-link="feed"]',
    );

    expect(linkedWidthSurfaces).toHaveLength(2);

    expect(linkedWidthSurfaces[0]?.getAttribute("class") ?? "").toContain(
      DASHBOARD_FEED_WIDTH_CLASS_NAME,
    );
    expect(linkedWidthSurfaces[1]?.getAttribute("class") ?? "").toContain(
      DASHBOARD_FEED_SURFACE_CLASS_NAME,
    );

    expect(
      container.querySelector('[data-dashboard-feed-scrollbar="true"]'),
    ).toBeTruthy();
  });

  test("renders the token toolbar shell as a full pill in loaded and skeleton states", () => {
    const { container, rerender } = render(
      <DashboardFilterBar
        articleFilter="unread"
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={() => {}}
      />,
    );

    const loadedSurface = container.querySelector(
      '[data-dashboard-filter-bar-surface="true"]',
    );

    expect(loadedSurface?.getAttribute("class") ?? "").toContain(
      "rounded-full",
    );
    expect(loadedSurface?.getAttribute("class") ?? "").toContain(
      "overflow-hidden",
    );
    expect(loadedSurface?.getAttribute("class") ?? "").toContain("h-8");
    expect(loadedSurface?.getAttribute("class") ?? "").toContain("bg-card/70");
    expect(loadedSurface?.getAttribute("class") ?? "").toContain(
      "border-border",
    );
    expect(loadedSurface?.getAttribute("class") ?? "").toContain("w-full");
    expect(loadedSurface?.getAttribute("class") ?? "").toContain(
      "dark:shadow-zinc-900/50",
    );

    rerender(
      <DashboardFilterBar
        articleFilter="unread"
        isShellLoading
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={() => {}}
      />,
    );

    const skeletonSurface = container.querySelector(
      '[data-dashboard-filter-bar-surface="true"]',
    );

    expect(skeletonSurface?.getAttribute("class") ?? "").toContain(
      "rounded-full",
    );
    expect(skeletonSurface?.getAttribute("class") ?? "").toContain(
      "overflow-hidden",
    );
    expect(skeletonSurface?.getAttribute("class") ?? "").toContain("h-8");
    expect(skeletonSurface?.getAttribute("class") ?? "").toContain(
      "bg-card/70",
    );
    expect(skeletonSurface?.getAttribute("class") ?? "").toContain(
      "border-border",
    );
    expect(skeletonSurface?.getAttribute("class") ?? "").toContain("w-full");
    expect(skeletonSurface?.getAttribute("class") ?? "").toContain(
      "dark:shadow-zinc-900/50",
    );
  });

  test("renders a feed scrollbar thumb when the feed viewport overflows", async () => {
    const { container } = render(
      <div className="h-48">
        <DashboardFeedViewport>
          <div>
            {Array.from({ length: 40 }, (_value, index) => (
              <div key={index}>Feed row {index + 1}</div>
            ))}
          </div>
        </DashboardFeedViewport>
      </div>,
    );

    expect(
      container.querySelector('[data-dashboard-feed-scrollbar="true"]'),
    ).toBeTruthy();

    const viewport = container.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport=""]',
    );

    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      get() {
        return 180;
      },
    });
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      get() {
        return 720;
      },
    });

    fireEvent.scroll(viewport!);

    await waitFor(() => {
      expect(viewport?.dataset.dashboardFeedScrollbarOverflow).toBe("true");
      expect(
        container.querySelector('[data-dashboard-feed-scrollbar-thumb="true"]'),
      ).toBeTruthy();
    });
  });

  test("keeps the feed scrollbar overflow gate closed without clipped content", async () => {
    const { container } = render(
      <div className="h-48">
        <DashboardFeedViewport>
          <div>Feed row without overflow</div>
        </DashboardFeedViewport>
      </div>,
    );

    const viewport = container.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport=""]',
    );

    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      get() {
        return 180;
      },
    });
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      get() {
        return 180;
      },
    });

    fireEvent.scroll(viewport!);

    await waitFor(() => {
      expect(viewport?.dataset.dashboardFeedScrollbarOverflow).toBe("false");
      expect(
        container.querySelector('[data-dashboard-feed-scrollbar-thumb="true"]'),
      ).toBeNull();
    });
  });

  test("uses the virtualized feed height to size the overlay thumb", async () => {
    const { container } = render(
      <div className="h-48">
        <DashboardFeedViewport>
          <div data-feed-total-list-height="720" data-inverted-scroll="true">
            {Array.from({ length: 40 }, (_value, index) => (
              <div key={index}>Feed row {index + 1}</div>
            ))}
          </div>
        </DashboardFeedViewport>
      </div>,
    );

    const viewport = container.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport=""]',
    );

    expect(viewport).toBeTruthy();

    fireEvent.scroll(viewport!);

    await waitFor(() => {
      const feedViewport = container.querySelector<HTMLElement>(
        '[data-feed-scroll-viewport="true"]',
      );
      const thumb = container.querySelector<HTMLElement>(
        '[data-dashboard-feed-scrollbar-thumb="true"]',
      );

      expect(feedViewport).toBeTruthy();
      expect(feedViewport?.getAttribute("class") ?? "").toContain(
        "[scrollbar-width:none]",
      );
      expect(feedViewport?.getAttribute("class") ?? "").toContain(
        "[&::-webkit-scrollbar]:hidden",
      );
      expect(thumb).toBeTruthy();
      expect(thumb?.getAttribute("style") ?? "").toContain("height:");
      expect(thumb?.getAttribute("style") ?? "").toContain("translateY(");
    });
  });

  test("prefers the larger live viewport height when article expansion outgrows the virtualized total", async () => {
    const { container } = render(
      <div className="h-48">
        <DashboardFeedViewport>
          <div data-feed-total-list-height="720" data-inverted-scroll="true">
            {Array.from({ length: 40 }, (_value, index) => (
              <div key={index}>Feed row {index + 1}</div>
            ))}
          </div>
        </DashboardFeedViewport>
      </div>,
    );

    const viewport = container.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport=""]',
    );

    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      get() {
        return 240;
      },
    });
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      get() {
        return 1080;
      },
    });

    fireEvent.scroll(viewport!);

    await waitFor(() => {
      const thumb = container.querySelector<HTMLElement>(
        '[data-dashboard-feed-scrollbar-thumb="true"]',
      );

      expect(thumb).toBeTruthy();
      expect(thumb?.getAttribute("style") ?? "").toContain("height: 53px");
    });
  });

  test("keeps pagination skeleton height from pulling the feed scrollbar thumb away from the committed bottom", () => {
    // Regression guard: load-more skeletons are intentionally rendered outside
    // the virtualizer. Their temporary DOM height must not make the custom
    // shadcn-style thumb jump upward before the virtualizer commits the next
    // article page and reconciles the real list height.
    const metrics = resolveFeedScrollbarMetrics({
      clientHeight: 500,
      hasTransientPaginationSkeletons: true,
      scrollHeight: 2400,
      scrollTop: 1500,
      virtualizedListHeight: 2000,
    });

    expect(metrics).toEqual({
      isVisible: true,
      thumbHeight: 125,
      thumbOffsetTop: 375,
    });
  });

  test("still follows live article expansion height when no pagination skeletons are active", () => {
    // Expanded article bodies are real committed content, unlike the transient
    // pagination scaffold, so the scrollbar must continue to shrink and move
    // against the larger live scroll range when an article opens.
    const metrics = resolveFeedScrollbarMetrics({
      clientHeight: 500,
      hasTransientPaginationSkeletons: false,
      scrollHeight: 2400,
      scrollTop: 1500,
      virtualizedListHeight: 2000,
    });

    expect(metrics).toEqual({
      isVisible: true,
      thumbHeight: 104,
      thumbOffsetTop: 313,
    });
  });

  test("uses the virtualized range while rendered load-more skeletons temporarily inflate the viewport", async () => {
    const { container } = render(
      <div className="h-48">
        <DashboardFeedViewport>
          <div
            data-feed-load-more-skeletons-visible="true"
            data-feed-surface-mode="virtualized"
            data-feed-total-list-height="2000"
          >
            <div style={{ height: 2000 }}>Committed feed rows</div>
            <div data-feed-load-more-skeletons="true" style={{ height: 800 }}>
              Pending page skeleton rows
            </div>
          </div>
        </DashboardFeedViewport>
      </div>,
    );

    const viewport = container.querySelector<HTMLElement>(
      '[data-radix-scroll-area-viewport=""]',
    );

    expect(viewport).toBeTruthy();

    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      get() {
        return 500;
      },
    });
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      get() {
        return 2800;
      },
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      get() {
        return 1500;
      },
    });

    fireEvent.scroll(viewport!);

    await waitFor(() => {
      const thumb = container.querySelector<HTMLElement>(
        '[data-dashboard-feed-scrollbar-thumb="true"]',
      );

      expect(thumb?.getAttribute("style") ?? "").toContain("height: 125px");
      expect(thumb?.getAttribute("style") ?? "").toContain("translateY(375px)");
    });
  });

  test("shows the Motion spinner and skeleton while isSearchPending without loading", () => {
    // Regression guard: isSearchPending alone (no loading) must activate the
    // timestamp skeleton so the filter bar reacts to the live-search window
    // even while the background server fetch runs with keepExistingFeed:true.
    const { container, getByLabelText, queryByText } = render(
      <DashboardFilterBar
        articleFilter="unread"
        isSearchPending
        lastRefreshLabel="2m ago"
        loading={false}
        onArticleFilterChange={() => {}}
      />,
    );

    const loadingIcon = container.querySelector("span[aria-live='polite'] svg");
    expect(loadingIcon?.getAttribute("class")).toContain(
      "lucide-loader-circle",
    );
    expect(getByLabelText("Refreshing")).toBeTruthy();
    expect(queryByText("2m ago")).toBeNull();
  });

  test("filter chip buttons remain visible during isSearchPending so the bar stays interactive", () => {
    // The filter pills (all / unread / read / starred) must never be hidden
    // while a search is pending — only the timestamp area shows loading state.
    const { getAllByRole } = render(
      <DashboardFilterBar
        articleFilter="unread"
        isSearchPending
        lastRefreshLabel="2m ago"
        loading={false}
        onArticleFilterChange={() => {}}
      />,
    );

    expect(getAllByRole("button")).toHaveLength(
      ARTICLE_FILTER_OPTIONS.length + 1,
    );
  });

  test("shows the Motion spinner when both loading and isSearchPending are true", () => {
    const { container, getByLabelText } = render(
      <DashboardFilterBar
        articleFilter="unread"
        isSearchPending
        lastRefreshLabel="2m ago"
        loading
        onArticleFilterChange={() => {}}
      />,
    );

    const loadingIcon = container.querySelector("span[aria-live='polite'] svg");
    expect(loadingIcon?.getAttribute("class")).toContain(
      "lucide-loader-circle",
    );
    expect(getByLabelText("Refreshing")).toBeTruthy();
  });

  test("shows the Motion spinner while the refresh label is skeletoning", () => {
    const { container, getByLabelText, queryByText, rerender } = render(
      <DashboardFilterBar
        articleFilter="unread"
        lastRefreshLabel="just now"
        loading
        onArticleFilterChange={() => {}}
      />,
    );

    const loadingIcon = container.querySelector("span[aria-live='polite'] svg");
    expect(loadingIcon).toBeTruthy();
    expect(loadingIcon?.getAttribute("class")).toContain(
      "lucide-loader-circle",
    );
    expect(getByLabelText("Refreshing")).toBeTruthy();
    expect(queryByText("just now")).toBeNull();

    rerender(
      <DashboardFilterBar
        articleFilter="unread"
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={() => {}}
      />,
    );

    const idleIcon = container.querySelector("span[aria-live='polite'] svg");
    expect(idleIcon).toBeTruthy();
    expect(idleIcon?.getAttribute("class")).toContain("lucide-refresh-cw");
  });

  test("renders the idle refresh label and marks the active article filter", () => {
    const { container, getByRole, queryByLabelText, queryByText } = render(
      <DashboardFilterBar
        articleFilter="unread"
        lastRefreshLabel="2m ago"
        loading={false}
        onArticleFilterChange={() => {}}
      />,
    );

    const unreadButton = getByRole("button", { name: "unread" });
    const starredButton = getByRole("button", { name: "starred" });

    expect(unreadButton.getAttribute("aria-pressed")).toBe("true");
    expect(unreadButton.getAttribute("class") ?? "").toContain("bg-muted");
    expect(starredButton.getAttribute("aria-pressed")).toBe("false");
    expect(starredButton.getAttribute("class") ?? "").toContain(
      "text-muted-foreground/70",
    );
    expect(queryByLabelText("Refreshing")).toBeNull();
    expect(queryByText("2m ago")).toBeTruthy();
    expect(
      container
        .querySelector("span[aria-live='polite'] svg")
        ?.getAttribute("class") ?? "",
    ).toContain("lucide-refresh-cw");
  });

  test("renders every article filter option as a token button", () => {
    const { getAllByRole } = render(
      <DashboardFilterBar
        articleFilter="all"
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={() => {}}
      />,
    );

    const filterButtons = getAllByRole("button");

    const filterChipButtons = filterButtons.slice(
      0,
      ARTICLE_FILTER_OPTIONS.length,
    );
    const filterChipNames = filterChipButtons.map((button) =>
      button.textContent?.trim(),
    );

    expect(filterButtons).toHaveLength(ARTICLE_FILTER_OPTIONS.length + 1);
    expect(filterChipNames).toEqual(
      ARTICLE_FILTER_OPTIONS.map((value: ArticleFilter) => value),
    );
  });

  test("invokes the filter change callback when a filter option is clicked", () => {
    const onArticleFilterChange = (value: string) => {
      calls.push(value);
    };
    const calls: string[] = [];
    const { getByRole } = render(
      <DashboardFilterBar
        articleFilter="unread"
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={onArticleFilterChange}
      />,
    );

    fireEvent.click(getByRole("button", { name: "starred" }));

    expect(calls).toEqual(["starred"]);
  });

  test("renders a sort-order toggle that defaults to newest with the descending icon", () => {
    const { container, getByRole } = render(
      <DashboardFilterBar
        articleFilter="unread"
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={() => {}}
      />,
    );

    const sortToggle = getByRole("button", {
      name: /sort by date/i,
    });

    expect(
      sortToggle.getAttribute("data-dashboard-filter-bar-sort-order"),
    ).toBe("newest");
    expect(sortToggle.getAttribute("aria-pressed")).toBe("false");
    expect(sortToggle.textContent?.trim()).toBe("Newest");
    expect(
      container.querySelector(".lucide-arrow-down-narrow-wide"),
    ).toBeTruthy();
  });

  test("keeps the sort-order text visually hidden until the small breakpoint", () => {
    // Regression guard: narrow phones need an icon-only newest/oldest toggle
    // so the quick filter strip, sort control, and refresh status all fit in
    // the bottom action bar without wrapping or pushing the indicator away.
    const { getByText } = render(
      <DashboardFilterBar
        articleFilter="unread"
        articleSortOrder="oldest"
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={() => {}}
        onArticleSortOrderChange={() => {}}
      />,
    );

    const sortLabel = getByText("Oldest");

    expect(sortLabel.getAttribute("data-dashboard-filter-bar-sort-label")).toBe(
      "true",
    );
    expect(sortLabel.getAttribute("class") ?? "").toContain("hidden");
    expect(sortLabel.getAttribute("class") ?? "").toContain("sm:inline");
  });

  test("renders the oldest-first state with the ascending icon and pressed aria state", () => {
    const { container, getByRole } = render(
      <DashboardFilterBar
        articleFilter="unread"
        articleSortOrder="oldest"
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={() => {}}
        onArticleSortOrderChange={() => {}}
      />,
    );

    const sortToggle = getByRole("button", {
      name: /sort by date/i,
    });

    expect(
      sortToggle.getAttribute("data-dashboard-filter-bar-sort-order"),
    ).toBe("oldest");
    expect(sortToggle.getAttribute("aria-pressed")).toBe("true");
    expect(sortToggle.textContent?.trim()).toBe("Oldest");
    expect(
      container.querySelector(".lucide-arrow-up-narrow-wide"),
    ).toBeTruthy();
  });

  test("cycles the sort order callback through every option in order on each click", () => {
    const calls: ArticleSortOrder[] = [];
    let current: ArticleSortOrder = "newest";
    const handleChange = (value: ArticleSortOrder) => {
      calls.push(value);
      current = value;
    };

    const { getByRole, rerender } = render(
      <DashboardFilterBar
        articleFilter="unread"
        articleSortOrder={current}
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={() => {}}
        onArticleSortOrderChange={handleChange}
      />,
    );

    for (const _option of ARTICLE_SORT_ORDER_OPTIONS) {
      fireEvent.click(getByRole("button", { name: /sort by date/i }));
      rerender(
        <DashboardFilterBar
          articleFilter="unread"
          articleSortOrder={current}
          lastRefreshLabel="just now"
          loading={false}
          onArticleFilterChange={() => {}}
          onArticleSortOrderChange={handleChange}
        />,
      );
    }

    const expected: ArticleSortOrder[] = [
      ...ARTICLE_SORT_ORDER_OPTIONS.slice(1),
      ARTICLE_SORT_ORDER_OPTIONS[0],
    ];
    expect(calls).toEqual(expected);
  });
});
