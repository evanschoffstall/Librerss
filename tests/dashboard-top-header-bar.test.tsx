import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";

import { AuthService } from "@/lib/api/auth-service";

function MockThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

describe("DashboardTopHeaderBar", () => {
  const originalNodeEnv = process.env.NODE_ENV;
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

    const { DashboardTopHeaderBar } =
      await import("@/app/dashboard/components/DashboardTopHeaderBar");
    const { getAllByText, getByLabelText } = render(<DashboardTopHeaderBar />);

    expect(getAllByText("Reset")).toHaveLength(1);
    expect(getByLabelText("Reset app state")).toBeTruthy();
  });

  test("does not show Reset controls outside development mode", async () => {
    setNodeEnv("test");

    AuthService.logout = mock(async () => {});
    mockHeaderDependencies();

    const { DashboardTopHeaderBar } =
      await import("@/app/dashboard/components/DashboardTopHeaderBar");
    const { queryByLabelText, queryByText } = render(<DashboardTopHeaderBar />);

    expect(queryByText("Reset")).toBeNull();
    expect(queryByLabelText("Reset app state")).toBeNull();
  });

  test("reset clears client state and reloads without logging out", async () => {
    setNodeEnv("development");
    const logout = mock(async () => {});
    const reload = mock(() => {});

    AuthService.logout = logout;
    window.localStorage.setItem("librerss:test", "value");
    window.sessionStorage.setItem("librerss:test", "value");
    mockHeaderDependencies();
    Object.defineProperty(window.location, "reload", {
      configurable: true,
      value: reload,
      writable: true,
    });

    const { DashboardTopHeaderBar } =
      await import("@/app/dashboard/components/DashboardTopHeaderBar");
    const { getByLabelText } = render(<DashboardTopHeaderBar />);

    fireEvent.click(getByLabelText("Reset app state"));

    await waitFor(() => {
      expect(logout).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledTimes(1);
      expect(window.localStorage.getItem("librerss:test")).toBeNull();
      expect(window.sessionStorage.getItem("librerss:test")).toBeNull();
    });
  });
});

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
