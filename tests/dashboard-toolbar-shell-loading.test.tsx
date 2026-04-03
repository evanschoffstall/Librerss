import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";

import * as realDashboardToolbar from "@/app/dashboard/components/DashboardToolbar";
import * as realUiSkeleton from "@/components/ui/skeleton";

async function loadDashboardToolbar() {
  return import(
    `@/app/dashboard/components/DashboardToolbar?toolbar-shell=${Date.now()}-${Math.random()}`
  );
}

function MockThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

describe("DashboardToolbar shell loading", () => {
  const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(
    document,
    "readyState",
  );

  beforeEach(() => {
    mock.restore();
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete document.documentElement.dataset.dashboardShellLoading;
    mockToolbarDependencies();
  });

  afterEach(() => {
    mock.restore();
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete document.documentElement.dataset.dashboardShellLoading;

    if (originalReadyStateDescriptor) {
      Object.defineProperty(document, "readyState", originalReadyStateDescriptor);
    }
  });

  test("settles optimistic shell loading once the document is already complete", async () => {
    Object.defineProperty(document, "readyState", {
      configurable: true,
      get() {
        return "complete";
      },
    });

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { container, queryByPlaceholderText } = render(
      <DashboardToolbar startInShellLoading />,
    );

    await waitFor(() => {
      expect(queryByPlaceholderText("Search...")).toBeTruthy();
    });

    expect(
      container.querySelector('[data-dashboard-toolbar-skeleton="true"]'),
    ).toBeNull();
  });

  test("tracks shell loading from the document dataset before bus events arrive", async () => {
    Object.defineProperty(document, "readyState", {
      configurable: true,
      get() {
        return "loading";
      },
    });
    document.documentElement.dataset.dashboardShellLoading = "true";

    const { DashboardToolbar } = await loadDashboardToolbar();
    const { container, queryByPlaceholderText } = render(
      <DashboardToolbar startInShellLoading />,
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-dashboard-toolbar-skeleton="true"]'),
      ).toBeTruthy();
    });

    document.documentElement.dataset.dashboardShellLoading = "false";

    await waitFor(() => {
      expect(queryByPlaceholderText("Search...")).toBeTruthy();
    });
  });
});

function mockToolbarDependencies() {
  mock.module("@/app/dashboard/components/DashboardToolbar", () => realDashboardToolbar);
  mock.module("@/components/ui/skeleton", () => realUiSkeleton);
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