import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";

import { AuthService } from "@/lib/api/auth-service";

function MockThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

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
    AuthService.getSession = getSession;

    mock.module("next-themes", () => ({
      ThemeProvider: MockThemeProvider,
      useTheme: () => ({ resolvedTheme: "dark" }),
    }));
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
    mock.module("@/app/dashboard/DashboardView", () => ({
      DashboardView: ({
        usePlaceholderData,
      }: {
        usePlaceholderData: boolean;
      }) => (
        <div
          data-placeholder={String(usePlaceholderData)}
          data-testid="dashboard-view"
        />
      ),
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
      expect(getByTestId("dashboard-view")).toBeTruthy();
    });

    expect(queryByTestId("login-view")).toBeNull();
    expect(getByTestId("dashboard-view").getAttribute("data-placeholder")).toBe(
      "true",
    );
    expect(getSession).not.toHaveBeenCalled();
  });
});
