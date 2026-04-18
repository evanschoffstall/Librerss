import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import {
  DASHBOARD_FEED_SURFACE_CLASS_NAME,
  DashboardFeedViewport,
  DashboardFilterBar,
} from "@/app/dashboard/dashboard-components/layout";
import {
  ARTICLE_FILTER_OPTIONS,
  type ArticleFilter,
} from "@/app/dashboard/dashboard-services/article";

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
    ).toHaveLength(4);
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

    for (const surface of linkedWidthSurfaces) {
      expect(surface.getAttribute("class") ?? "").toContain(
        DASHBOARD_FEED_SURFACE_CLASS_NAME,
      );
    }

    expect(
      container.querySelector('[data-dashboard-feed-scrollbar="true"]'),
    ).toBeTruthy();
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
      expect(
        container.querySelector('[data-dashboard-feed-scrollbar-thumb="true"]'),
      ).toBeTruthy();
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
    expect(loadingIcon?.getAttribute("class")).toContain("lucide-loader-circle");
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

    expect(getAllByRole("button")).toHaveLength(ARTICLE_FILTER_OPTIONS.length);
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
    expect(loadingIcon?.getAttribute("class")).toContain("lucide-loader-circle");
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
    const filterButtonNames = filterButtons.map((button) =>
      button.textContent?.trim(),
    );

    expect(filterButtons).toHaveLength(ARTICLE_FILTER_OPTIONS.length);
    expect(filterButtonNames).toEqual(
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
});
