import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { fireEvent, render, waitFor } from "@testing-library/react";
import * as React from "react";

describe("DashboardTopHeaderBar", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLocationReload = window.location.reload;

  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
    process.env.NODE_ENV = originalNodeEnv;
    Object.defineProperty(window.location, "reload", {
      configurable: true,
      value: originalLocationReload,
      writable: true,
    });
  });

  test("shows Reset controls only in development mode", async () => {
    process.env.NODE_ENV = "development";

    mockHeaderDependencies({
      clearClientOriginState: mock(async () => {}),
      logout: mock(async () => {}),
    });

    const { DashboardTopHeaderBar } =
      await import("@/app/dashboard/components/DashboardTopHeaderBar");
    const { getAllByText, getByLabelText } = render(<DashboardTopHeaderBar />);

    expect(getAllByText("Reset")).toHaveLength(1);
    expect(getByLabelText("Reset app state")).toBeTruthy();
  });

  test("does not show Reset controls outside development mode", async () => {
    process.env.NODE_ENV = "test";

    mockHeaderDependencies({
      clearClientOriginState: mock(async () => {}),
      logout: mock(async () => {}),
    });

    const { DashboardTopHeaderBar } =
      await import("@/app/dashboard/components/DashboardTopHeaderBar");
    const { queryByLabelText, queryByText } = render(<DashboardTopHeaderBar />);

    expect(queryByText("Reset")).toBeNull();
    expect(queryByLabelText("Reset app state")).toBeNull();
  });

  test("reset clears client state and reloads without logging out", async () => {
    process.env.NODE_ENV = "development";
    const clearClientOriginState = mock(async () => {});
    const logout = mock(async () => {});
    const reload = mock(() => {});

    mockHeaderDependencies({ clearClientOriginState, logout });
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
      expect(clearClientOriginState).toHaveBeenCalledTimes(1);
      expect(logout).not.toHaveBeenCalled();
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});

function mockHeaderDependencies(options: {
  clearClientOriginState: () => Promise<void>;
  logout: () => Promise<void>;
}) {
  mock.module("next-themes", () => ({
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
  mock.module("@/lib", () => ({
    AuthService: { logout: options.logout },
    clearClientOriginState: options.clearClientOriginState,
    useLocalStorage: <T,>(_key: string, defaultValue: T) =>
      React.useState(defaultValue),
  }));
}
