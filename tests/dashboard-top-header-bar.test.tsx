import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import { AuthService } from "@/lib";


async function loadDashboardTopHeaderBar() {
  return import(
    new URL(
      `../src/app/dashboard/components/DashboardTopHeaderBar.tsx?test=${Date.now()}-${Math.random()}`,
      import.meta.url,
    ).href
  );
}

function MockThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

describe("DashboardTopHeaderBar", () => {
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
    mockHeaderDependencies();

    const { DashboardTopHeaderBar } = await loadDashboardTopHeaderBar();
    const { getAllByText, getByLabelText } = render(<DashboardTopHeaderBar />);

    expect(getAllByText("Reset")).toHaveLength(1);
    expect(getByLabelText("Reset app state")).toBeTruthy();
  });

  test("does not show Reset controls outside development mode", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockHeaderDependencies();

    const { DashboardTopHeaderBar } = await loadDashboardTopHeaderBar();
    const { queryByLabelText, queryByText } = render(<DashboardTopHeaderBar />);

    expect(queryByText("Reset")).toBeNull();
    expect(queryByLabelText("Reset app state")).toBeNull();
  });

  test("renders the viewport read action in the persistent header button bar", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockHeaderDependencies();

    const { DashboardTopHeaderBar } = await loadDashboardTopHeaderBar();
    const { getAllByLabelText } = render(<DashboardTopHeaderBar />);

    expect(getAllByLabelText("Mark fully visible articles as read")).toHaveLength(2);
  });

  test("shows a skeleton in the viewport read button while processing", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockHeaderDependencies();

    const { DashboardTopHeaderBar } = await loadDashboardTopHeaderBar();
    const { getAllByLabelText } = render(<DashboardTopHeaderBar />);
    const viewportButtons = getAllByLabelText("Mark fully visible articles as read");
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

  test("shows skeletons in all toolbar actions while refresh is processing", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockHeaderDependencies();

    const { DashboardTopHeaderBar } = await loadDashboardTopHeaderBar();
    const { getAllByLabelText, getByLabelText } = render(<DashboardTopHeaderBar />);
    const refreshButtons = getAllByLabelText("Refresh selected feed");
    const viewportButtons = getAllByLabelText("Mark fully visible articles as read");
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

  test("shows skeletons in all toolbar actions while mark-all-read is processing", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockHeaderDependencies();

    const { DashboardTopHeaderBar } = await loadDashboardTopHeaderBar();
    const { getAllByLabelText, getByLabelText } = render(<DashboardTopHeaderBar />);
    const refreshButtons = getAllByLabelText("Refresh selected feed");
    const viewportButtons = getAllByLabelText("Mark fully visible articles as read");
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

  test("reset clears client state and navigates to a clean dashboard URL without logging out", async () => {
    setNodeEnv("development");
    const logout = mock(async () => {});
    const assign = mock(() => {});

    AuthService.logout = logout;
    window.localStorage.setItem("librerss:test", "value");
    window.sessionStorage.setItem("librerss:test", "value");
    document.cookie = "librerss_dashboard_preview=1; Path=/";
    mockHeaderDependencies();
    Object.defineProperty(window.location, "assign", {
      configurable: true,
      value: assign,
      writable: true,
    });

    const { DashboardTopHeaderBar } = await loadDashboardTopHeaderBar();
    const { getByLabelText } = render(<DashboardTopHeaderBar />);

    fireEvent.click(getByLabelText("Reset app state"));

    await waitFor(() => {
      expect(logout).not.toHaveBeenCalled();
      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith("/dashboard");
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
    mockHeaderDependencies();

    const { DashboardTopHeaderBar } = await loadDashboardTopHeaderBar();
    const container = document.createElement("div");
    container.innerHTML = renderToString(<DashboardTopHeaderBar />);
    document.body.append(container);

    const header = container.querySelector<HTMLDivElement>(
      "div.pointer-events-auto.fixed.inset-x-0.top-0.z-50",
    );
    if (!header) {
      throw new Error("Expected server-rendered dashboard header.");
    }

    header.setAttribute("aria-hidden", "true");
    header.setAttribute("data-aria-hidden", "true");
    console.error = consoleError;

    try {
      await act(async () => {
        hydrateRoot(container, <DashboardTopHeaderBar />);
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

/** Installs module mocks for header-bar dependencies before importing the subject. */
function mockHeaderDependencies() {
  mock.module("next-themes", () => ({
    ThemeProvider: MockThemeProvider,
    useTheme: () => ({ resolvedTheme: "dark", setTheme: mock(() => {}) }),
  }));
  mock.module("sonner", () => ({
    toast: { error: mock(() => {}) },
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
