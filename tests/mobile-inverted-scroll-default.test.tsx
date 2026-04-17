import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import {
  buildFeedListArticle,
  installFeedListDomMocks,
  restoreFeedListDomMocks,
} from "./feed-list-test-utils";

let FeedList: typeof import("@/app/dashboard/dashboard-components/feed-view/FeedList").FeedList;
let SettingsDisplaySection: typeof import("@/app/dashboard/dashboard-components/settings-dialog/SettingsDisplaySection").SettingsDisplaySection;

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
      React.forwardRef<HTMLElement, MockMotionProps>(function MockMotionComponent(
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
      }),
  },
);

describe("mobile inverted scroll defaults", () => {
  beforeEach(async () => {
    mock.restore();
    installFeedListDomMocks();
    mock.module("motion/react", () => ({
      AnimatePresence: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
      ),
      motion,
    }));
    mock.module("@/lib/hooks", () => ({
      useIsBelowDesktop: () => true,
      useLocalStorage: (_key: string, initialValue: boolean) => [
        initialValue,
        mock(() => {}),
      ],
    }));

    ({ FeedList } =
      await import(
        `@/app/dashboard/dashboard-components/feed-view/FeedList?test=${Date.now()}-${Math.random()}`
      ));
    ({ SettingsDisplaySection } =
      await import(
        `@/app/dashboard/dashboard-components/settings-dialog/SettingsDisplaySection?test=${Date.now()}-${Math.random()}`
      ));
  });

  afterEach(() => {
    mock.restore();
    restoreFeedListDomMocks();
  });

  test("keeps the feed in standard scroll mode on mobile when no preference has been stored", () => {
    const article = buildFeedListArticle();
    const { container } = render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <div data-radix-scroll-area-viewport="">
          <FeedList
            articleFilter="all"
            articlesPerPage={4}
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
          />
        </div>
      </ThemeProvider>,
    );

    const feedSurface = container.querySelector<HTMLElement>(
      "[data-feed-surface-mode='plain']",
    );

    expect(feedSurface?.getAttribute("data-inverted-scroll")).toBeUndefined();
  });

  test("renders the display toggle unchecked when no preference has been stored", () => {
    const { getByRole } = render(
      <SettingsDisplaySection
        articlesPerPage={12}
        autoRefreshIntervalMinutes={30}
        backgroundMode="stars"
        distillStrategy="readability"
        onArticlesPerPageChange={() => {}}
        onAutoRefreshIntervalMinutesChange={() => {}}
        onBackgroundModeChange={() => {}}
        onDistillStrategyChange={() => {}}
        onShowFaviconsChange={() => {}}
        showFavicons={true}
      />,
    );

    expect(
      getByRole("switch", { name: "Mobile inverted scroll" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("false");
  });
});
