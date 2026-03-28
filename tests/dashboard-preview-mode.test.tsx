import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";

import { DASHBOARD_PREVIEW_STORAGE_KEY } from "@/app/dashboard/constants";
import { AuthService } from "@/lib";

describe("dashboard preview mode", () => {
  const originalGetSession = AuthService.getSession;

  beforeEach(() => {
    mock.restore();
    AuthService.getSession = originalGetSession;
    window.localStorage.clear();
  });

  afterEach(() => {
    mock.restore();
    AuthService.getSession = originalGetSession;
    window.localStorage.clear();
  });

  test("resolveDashboardPreviewMode enables preview from query or cookie", async () => {
    const {
      isDashboardPreviewModeEnabled,
      resolveDashboardPreviewMode,
      setDashboardPreviewPersistence,
    } = await import("@/app/dashboard/preview-mode");

    expect(isDashboardPreviewModeEnabled("1")).toBe(true);
    expect(isDashboardPreviewModeEnabled("0")).toBe(false);
    expect(
      resolveDashboardPreviewMode({
        cookieValue: undefined,
        hasPreviewQuery: true,
      }),
    ).toBe(true);
    expect(
      resolveDashboardPreviewMode({ cookieValue: "1", hasPreviewQuery: false }),
    ).toBe(true);
    expect(
      resolveDashboardPreviewMode({
        cookieValue: undefined,
        hasPreviewQuery: false,
      }),
    ).toBe(false);

    expect(() => setDashboardPreviewPersistence(true)).not.toThrow();
    expect(() => setDashboardPreviewPersistence(false)).not.toThrow();
  });

  test("DashboardRouter skips session fetch when preview mode is already active", async () => {
    const getSession = mock(async () => {
      throw new Error("preview mode should not fetch session");
    });
    const useDashboardController = mock(() => ({
      feedList: {
        articleFilter: "all" as const,
        articlesPerPage: 12,
        collapsingArticles: {},
        expandedArticleKey: null,
        feedViewKey: "feed-view",
        filteredFeed: [],
        getPreExpandViewportSnapshot: () => null,
        hasConfiguredFeeds: true,
        hydratedArticleLinks: {},
        hydratingArticleLinks: {},
        isCollapseScrollRestoreActive: false,
        isInitialLoading: false,
        isRefreshing: false,
        onArticleExpandedSwipeRead: () => {},
        onArticlePrepareExpand: () => {},
        onArticleSwipeRead: () => {},
        onArticleToggle: () => {},
        onArticleToggleRead: () => {},
        onArticleToggleStarred: () => {},
        refreshEpoch: 0,
        searchTerm: "",
        showFavicons: false,
        updatingArticleState: {},
      },
      filterBar: {
        articleFilter: "all" as const,
        lastRefreshLabel: "just now",
        loading: false,
        setArticleFilter: () => {},
      },
      settings: {
        articlesPerPage: 12,
        autoRefreshIntervalMinutes: 30,
        backgroundMode: "none" as const,
        categories: [],
        categoryTree: {
          addCategory: () => true,
          addFeedSource: async () => true,
          importOpmlFeeds: async () => {},
          moveCategoryByDrop: () => {},
          moveFeedByDrop: async () => {},
          pendingCategoryRemovalLabel: null,
          removeCategory: async () => true,
          removeFeedSource: async () => {},
          renameCategory: async () => true,
          renameFeedSource: async () => true,
          setFeedSourceEnabled: async () => true,
          updateFeedSettings: async () => true,
        },
        distillStrategy: "librerss",
        handleCloseSettings: () => {},
        onBackgroundModeChange: () => {},
        onDistillStrategyChange: () => {},
        selectedCategory: null,
        setArticlesPerPage: () => {},
        setAutoRefreshIntervalMinutes: () => {},
        setShowFavicons: () => {},
        showFavicons: false,
        showSettingsModal: false,
        usePlaceholderData: true,
      },
      sidebar: {
        isMobileSidebarOpen: false,
        isSidebarVisible: true,
        setIsMobileSidebarOpen: () => {},
        sidebarContentProps: {},
        sidebarScrollRef: { current: null },
      },
    }));

    AuthService.getSession = getSession;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: window.localStorage,
      writable: true,
    });
    window.localStorage.setItem(
      DASHBOARD_PREVIEW_STORAGE_KEY,
      JSON.stringify(true),
    );

    mock.module("@/components/ThemeNoticeDialog", () => ({
      ThemeNoticeDialog: () => <div data-testid="theme-notice" />,
    }));
    mock.module("@/app/dashboard/components/Background", () => ({
      ParticlesBackground: () => <div data-testid="bg-particles" />,
      ParticlesBackgroundLight: () => <div data-testid="bg-particles-light" />,
      StarsBackground: () => <div data-testid="bg-stars" />,
      StarsBackgroundLight: () => <div data-testid="bg-stars-light" />,
    }));
    mock.module("@/app/dashboard/components/login/LoginView", () => ({
      LoginView: () => <div data-testid="login-view" />,
    }));
    mock.module("@/app/dashboard/providers/DashboardQueryProvider", () => ({
      DashboardQueryProvider: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="query-provider">{children}</div>
      ),
    }));
    mock.module("@/app/dashboard/hooks/useDashboardController", () => ({
      useDashboardController,
    }));
    mock.module("@/app/dashboard/components/DashboardMobileSidebarSheet", () => ({
      DashboardMobileSidebarSheet: () => <div data-testid="mobile-sidebar-sheet" />,
    }));
    mock.module("@/app/dashboard/components/DashboardDesktopSidebar", () => ({
      DashboardDesktopSidebar: () => <div data-testid="desktop-sidebar" />,
    }));
    mock.module("@/app/dashboard/components/DashboardFilterBar", () => ({
      DashboardFilterBar: () => <div data-testid="filter-bar" />,
    }));
    mock.module("@/app/dashboard/components/DashboardScaffold", () => ({
      DashboardFeedViewport: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="feed-viewport">{children}</div>
      ),
      DashboardScaffold: ({
        feed,
        filterBar,
        sidebar,
      }: {
        feed: React.ReactNode;
        filterBar: React.ReactNode;
        sidebar: React.ReactNode;
      }) => (
        <div data-testid="dashboard-scaffold">
          {feed}
          {filterBar}
          {sidebar}
        </div>
      ),
    }));
    mock.module("@/app/dashboard/components/settings/SettingsPanel", () => ({
      SettingsPanel: () => <div data-testid="settings-panel" />,
    }));

    const { DashboardRouter } = await import("@/app/dashboard/DashboardRouter");
    const { getByTestId, queryByTestId } = render(
      <DashboardRouter
        hasPreviewQuery={true}
        initialPreviewMode={true}
        initialSession={{
          allowSignup: false,
          authenticated: false,
          usePlaceholderData: false,
          user: null,
        }}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("dashboard-scaffold")).toBeTruthy();
    });

    expect(queryByTestId("login-view")).toBeNull();
    expect(getByTestId("dashboard-scaffold")).toBeTruthy();
    expect(useDashboardController).toHaveBeenCalledWith(
      expect.objectContaining({ usePlaceholderData: true }),
    );
    expect(getSession).not.toHaveBeenCalled();
  });
});
