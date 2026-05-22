import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import * as realSonnerModule from "sonner";

import { DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import { DashboardToolbar as realDashboardToolbar } from "@/app/dashboard/dashboard-components";
import {
  DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
  DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
  DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
} from "@/app/dashboard/dashboard-services";
import * as realUiSkeleton from "@/components/ui/skeleton";
import { AuthService } from "@/lib/api";

async function loadDashboardToolbar() {
  return import(
    `@/app/dashboard/dashboard-components/DashboardToolbar?test=${Date.now()}-${Math.random()}`
  );
}

function MockThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

describe("DashboardToolbar", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLocationAssign = window.location.assign;
  const originalLocationReload = window.location.reload;
  const originalLogout = AuthService.logout;

  beforeEach(() => {
    mock.restore();
    AuthService.logout = originalLogout;
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    mock.restore();
    AuthService.logout = originalLogout;
    window.localStorage.clear();
    window.sessionStorage.clear();
    setNodeEnv(originalNodeEnv);
    Object.defineProperty(window.location, "assign", {
      configurable: true,
      value: originalLocationAssign,
      writable: true,
    });
    Object.defineProperty(window.location, "reload", {
      configurable: true,
      value: originalLocationReload,
      writable: true,
    });
  });

  test("shows Reset controls only in development mode", async () => {
    setNodeEnv("development");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { getAllByText, getByLabelText, getByText } = render(
      <DashboardToolbar />,
    );

    expect(getAllByText("Reset")).toHaveLength(1);
    expect(getByLabelText("Reset app state")).toBeTruthy();
    expect(getByText("Upstream refresh")).toBeTruthy();
  });

  test("does not show Reset controls outside development mode", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { queryByLabelText, queryByText } = render(<DashboardToolbar />);

    expect(queryByText("Reset")).toBeNull();
    expect(queryByLabelText("Reset app state")).toBeNull();
    expect(queryByText("Upstream refresh")).toBeNull();
  });

  test("dispatches the upstream override refresh event from the actions menu", async () => {
    setNodeEnv("development");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const detailEvents: (undefined | { forceResolveUpstream?: boolean })[] = [];
    const handleRefresh = (event: Event) => {
      detailEvents.push(
        (event as CustomEvent<{ forceResolveUpstream?: boolean }>).detail,
      );
    };
    window.addEventListener(DASHBOARD_EVENTS.REFRESH, handleRefresh);

    try {
      const { DashboardToolbar } = await loadDashboardToolbar();
      const { getByText } = render(<DashboardToolbar />);

      fireEvent.click(getByText("Upstream refresh"));

      expect(detailEvents).toEqual([{ forceResolveUpstream: true }]);
    } finally {
      window.removeEventListener(DASHBOARD_EVENTS.REFRESH, handleRefresh);
    }
  });

  test("renders the viewport read action in the persistent toolbar button bar", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { getAllByLabelText } = render(<DashboardToolbar />);

    expect(
      getAllByLabelText("Mark fully visible articles as read"),
    ).toHaveLength(2);
  });

  test("keeps the toolbar search input visually compact without mobile focus zoom", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { getByPlaceholderText } = render(<DashboardToolbar />);
    const input = getByPlaceholderText("Search...");

    expect(input.className).toMatch(/(?:^|\s)text-base(?:\s|$)/u);
    expect(input.className).toMatch(/(?:^|\s)scale-\[0\.875\](?:\s|$)/u);
    expect(input.className).not.toMatch(/(?:^|\s)text-sm(?:\s|$)/u);
  });

  test("shows a skeleton in the viewport read button while processing", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { getAllByLabelText } = render(<DashboardToolbar />);
    const viewportButtons = getAllByLabelText(
      "Mark fully visible articles as read",
    );
    const refreshButtons = getAllByLabelText("Refresh selected feed");
    const markAllReadButton = getByLabelTextOrThrow("Mark all read");

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START),
      );
      await Promise.resolve();
    });

    for (const button of viewportButtons) {
      expect(button.querySelector(".animate-pulse")).toBeTruthy();
    }
    for (const button of refreshButtons) {
      expect(button.querySelector(".animate-pulse")).toBeTruthy();
    }
    expect(markAllReadButton.querySelector(".animate-pulse")).toBeTruthy();
  });

  test("renders a full toolbar skeleton while the dashboard shell is loading", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { container, queryByPlaceholderText } = render(<DashboardToolbar />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(DASHBOARD_EVENTS.SHELL_LOADING, {
          detail: { loading: true },
        }),
      );
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-dashboard-toolbar-skeleton="true"]'),
    ).toBeTruthy();
    expect(
      container.querySelectorAll(
        '[data-dashboard-toolbar-skeleton-action="true"]',
      ).length,
    ).toBeGreaterThanOrEqual(9);
    expect(queryByPlaceholderText("Search...")).toBeNull();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(DASHBOARD_EVENTS.SHELL_LOADING, {
          detail: { loading: false },
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        container.querySelector('[data-dashboard-shell-handoff="toolbar"]'),
      ).toBeTruthy();
      expect(queryByPlaceholderText("Search...")).toBeTruthy();
    });
    expect(
      container.querySelector('[data-dashboard-toolbar-skeleton="true"]'),
    ).toBeTruthy();

    await waitFor(() => {
      expect(
        container.querySelector('[data-dashboard-toolbar-skeleton="true"]'),
      ).toBeNull();
      expect(
        container.querySelector('[data-dashboard-shell-handoff="toolbar"]'),
      ).toBeNull();
    });
  });

  test("settles the optimistic toolbar skeleton when the document is already complete", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "readyState",
    );

    Object.defineProperty(document, "readyState", {
      configurable: true,
      get() {
        return "complete";
      },
    });
    delete document.documentElement.dataset.dashboardShellLoading;

    try {
      const { DashboardToolbar } = await loadDashboardToolbar();
      const { container, queryByPlaceholderText } = render(
        <DashboardToolbar startInShellLoading />,
      );

      expect(
        container.querySelector('[data-dashboard-toolbar-skeleton="true"]'),
      ).toBeTruthy();
      await waitFor(() => {
        expect(queryByPlaceholderText("Search...")).toBeTruthy();
      });
      await waitFor(() => {
        expect(
          container.querySelector('[data-dashboard-toolbar-skeleton="true"]'),
        ).toBeNull();
        expect(queryByPlaceholderText("Search...")).toBeTruthy();
      });
    } finally {
      if (originalReadyStateDescriptor) {
        Object.defineProperty(
          document,
          "readyState",
          originalReadyStateDescriptor,
        );
      }
    }
  });

  test("shows skeletons in all toolbar actions while refresh is processing", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { getAllByLabelText, getByLabelText } = render(<DashboardToolbar />);
    const refreshButtons = getAllByLabelText("Refresh selected feed");
    const viewportButtons = getAllByLabelText(
      "Mark fully visible articles as read",
    );
    const markAllReadButton = getByLabelText("Mark all read");

    await act(async () => {
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_START));
      await Promise.resolve();
    });

    for (const button of refreshButtons) {
      expect(button.querySelector(".animate-pulse")).toBeTruthy();
    }
    for (const button of viewportButtons) {
      expect(button.querySelector(".animate-pulse")).toBeTruthy();
    }
    expect(markAllReadButton.querySelector(".animate-pulse")).toBeTruthy();
  });

  test("clears refresh skeletons when a refresh end event is lost after suspension", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const timeoutCallbacks = new Map<number, () => void>();
    let nextTimerId = 0;

    globalThis.setTimeout = ((callback: TimerHandler) => {
      nextTimerId += 1;
      timeoutCallbacks.set(nextTimerId, callback as () => void);
      return nextTimerId as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
      timeoutCallbacks.delete(id as unknown as number);
    }) as typeof clearTimeout;

    try {
      const { DashboardToolbar } = await loadDashboardToolbar();
      const { getAllByLabelText } = render(<DashboardToolbar />);
      const refreshButtons = getAllByLabelText("Refresh selected feed");
      const refreshButton = refreshButtons[0];

      await act(async () => {
        window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH_START));
        await Promise.resolve();
      });

      expect(refreshButton?.querySelector(".animate-pulse")).toBeTruthy();

      await act(async () => {
        Array.from(timeoutCallbacks.values()).at(-1)?.();
        await Promise.resolve();
      });

      expect(refreshButton?.querySelector(".animate-pulse")).toBeNull();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  test("shows skeletons in all toolbar actions while mark-all-read is processing", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { getAllByLabelText, getByLabelText } = render(<DashboardToolbar />);
    const refreshButtons = getAllByLabelText("Refresh selected feed");
    const viewportButtons = getAllByLabelText(
      "Mark fully visible articles as read",
    );
    const markAllReadButton = getByLabelText("Mark all read");

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ_START),
      );
      await Promise.resolve();
    });

    for (const button of refreshButtons) {
      expect(button.querySelector(".animate-pulse")).toBeTruthy();
    }
    for (const button of viewportButtons) {
      expect(button.querySelector(".animate-pulse")).toBeTruthy();
    }
    expect(markAllReadButton.querySelector(".animate-pulse")).toBeTruthy();
  });

  test("reset clears client state and reloads the current page without logging out", async () => {
    setNodeEnv("development");
    const logout = mock(async () => {});
    const assign = mock(() => {});

    AuthService.logout = logout;
    window.localStorage.setItem(
      DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
      JSON.stringify("placeholder-feeds"),
    );
    window.localStorage.setItem(
      DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
      JSON.stringify("read"),
    );
    window.localStorage.setItem(
      DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
      JSON.stringify(4),
    );
    window.localStorage.setItem("librerss:test", "value");
    window.sessionStorage.setItem("librerss:test", "value");
    document.cookie = "librerss_dashboard_preview=1; Path=/";
    mockToolbarDependencies();
    Object.defineProperty(window.location, "assign", {
      configurable: true,
      value: assign,
      writable: true,
    });

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { getByLabelText } = render(<DashboardToolbar />);

    fireEvent.click(getByLabelText("Reset app state"));

    await waitFor(() => {
      expect(logout).not.toHaveBeenCalled();
      expect(assign).toHaveBeenCalledWith(window.location.href);
      expect(
        window.localStorage.getItem(DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY),
      ).toBe(JSON.stringify("placeholder-feeds"));
      expect(
        window.localStorage.getItem(DASHBOARD_ARTICLE_FILTER_STORAGE_KEY),
      ).toBe(JSON.stringify("read"));
      expect(
        window.localStorage.getItem(DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY),
      ).toBe(JSON.stringify(4));
      expect(window.localStorage.getItem("librerss:test")).toBeNull();
      expect(window.sessionStorage.getItem("librerss:test")).toBeNull();
      expect(document.cookie).not.toContain("librerss_dashboard_preview=");
    });
  });

  test("ignores transient aria-hidden mutations during hydration", async () => {
    setNodeEnv("development");

    const originalConsoleError = console.error;
    const consoleError = mock(() => {});

    AuthService.logout = mock(async () => {});
    mockToolbarDependencies();

    const { DashboardToolbar } = await loadDashboardToolbar();
    const container = document.createElement("div");
    container.innerHTML = renderToString(<DashboardToolbar />);
    document.body.append(container);

    const header = container.querySelector<HTMLDivElement>(
      "div.pointer-events-auto.fixed.inset-x-0.bottom-0.z-50," +
        "div.pointer-events-auto.fixed.inset-x-0.top-0.z-50",
    );
    if (!header) {
      throw new Error("Expected server-rendered dashboard toolbar.");
    }

    header.setAttribute("aria-hidden", "true");
    header.setAttribute("data-aria-hidden", "true");
    console.error = consoleError;

    try {
      await act(async () => {
        hydrateRoot(container, <DashboardToolbar />);
        await Promise.resolve();
      });

      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      console.error = originalConsoleError;
    }
  });
});

function getByLabelTextOrThrow(label: string) {
  const button = document.querySelector(`[aria-label="${label}"]`);
  if (!(button instanceof HTMLElement)) {
    throw new Error(`Expected element with aria-label ${label}.`);
  }

  return button;
}

/** Installs module mocks for toolbar dependencies before importing the subject. */
function mockToolbarDependencies() {
  mock.module("@/app/dashboard/dashboard-components/DashboardToolbar", () => ({
    DashboardToolbar: realDashboardToolbar,
  }));
  mock.module("@/components/ui/skeleton", () => realUiSkeleton);
  mock.module("next-themes", () => ({
    ThemeProvider: MockThemeProvider,
    useTheme: () => ({ resolvedTheme: "dark", setTheme: mock(() => {}) }),
  }));
  mock.module("sonner", () => ({
    ...realSonnerModule,
    toast: {
      ...realSonnerModule.toast,
      error: mock(() => {}),
    },
  }));
  mock.module("@/components/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      disabled,
      onSelect,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      onSelect?: () => void;
    }) => (
      <button disabled={disabled} onClick={onSelect} type="button">
        {children}
      </button>
    ),
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  }));
  mock.module("@/components/ui/input", () => ({
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
      <input {...props} />
    ),
  }));
}

/** Overrides NODE_ENV in tests without mutating its readonly TypeScript view. */
function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    configurable: true,
    value,
    writable: true,
  });
}
