import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  buildAnonymousDashboardSession,
  getInitialDashboardSession,
  resolveDashboardPageBootstrap,
} from "@/app/dashboard/page-bootstrap/state";

function createCookieStore(values: Record<string, string>) {
  return {
    get(name: string) {
      return values[name] ? { name, value: values[name] } : undefined;
    },
  };
}

const baseDeps = {
  buildDevAutoLoginRequestPath: () =>
    "/api/auth/dev-login?returnTo=%2Fdashboard",
  getUserFromSessionToken: async () => null,
  isDevAutoLoginEnabled: () => true,
  isDevAutoLoginFailure: () => false,
  resolveDashboardPreviewMode: ({
    hasExploreQuery,
  }: {
    hasExploreQuery: boolean;
  }) => hasExploreQuery,
  runtimeFlags: {
    allowSignup: false,
    usePlaceholderData: false,
  },
  sessionCookieName: "librerss_session",
};

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("dashboard page dev auto-login bootstrap", () => {
  test("passes the auto-login request path to DashboardRouter when unauthenticated", async () => {
    const bootstrapState = await resolveDashboardPageBootstrap({
      cookieStore: createCookieStore({}),
      deps: baseDeps,
      searchParams: {},
    });

    expect(bootstrapState.initialAutoLoginPath).toBe(
      "/api/auth/dev-login?returnTo=%2Fdashboard",
    );
    expect(bootstrapState.initialLoginErrorMessage).toBeUndefined();
    expect(bootstrapState.initialSession.authenticated).toBe(false);
  });

  test("surfaces the failure message instead of retrying after a failed dev auto-login", async () => {
    const bootstrapState = await resolveDashboardPageBootstrap({
      cookieStore: createCookieStore({}),
      deps: {
        ...baseDeps,
        isDevAutoLoginFailure: () => true,
      },
      searchParams: { devLogin: "failed" },
    });

    expect(bootstrapState.initialAutoLoginPath).toBeUndefined();
    expect(bootstrapState.initialLoginErrorMessage).toContain(
      "Dev auto-login failed.",
    );
  });

  test("keeps auto-login disabled when an authenticated session already exists", async () => {
    const bootstrapState = await resolveDashboardPageBootstrap({
      cookieStore: createCookieStore({
        librerss_session: "existing-session-token",
      }),
      deps: {
        ...baseDeps,
        getUserFromSessionToken: async () => ({
          email: "reader@example.com",
          userId: 7,
        }),
      },
      searchParams: {},
    });

    expect(bootstrapState.initialSession.authenticated).toBe(true);
    expect(bootstrapState.initialAutoLoginPath).toBeUndefined();
    expect(bootstrapState.initialSession.user?.email).toBe(
      "reader@example.com",
    );
  });

  test("uses the explore query to suppress auto-login and boot an anonymous session", async () => {
    const bootstrapState = await resolveDashboardPageBootstrap({
      cookieStore: createCookieStore({}),
      deps: {
        ...baseDeps,
        getUserFromSessionToken: async () => {
          throw new Error("should not load session in preview mode");
        },
        runtimeFlags: {
          allowSignup: true,
          usePlaceholderData: true,
        },
      },
      searchParams: { explore: ["1", "0"] },
    });

    expect(bootstrapState.initialAutoLoginPath).toBeUndefined();
    expect(bootstrapState.hasPreviewQuery).toBe(true);
    expect(bootstrapState.initialPreviewMode).toBe(true);
    expect(bootstrapState.initialSession.allowSignup).toBe(true);
    expect(bootstrapState.initialSession.authenticated).toBe(false);
    expect(bootstrapState.initialSession.usePlaceholderData).toBe(true);
  });

  test("ignores the preview cookie when the explore query is absent", async () => {
    const bootstrapState = await resolveDashboardPageBootstrap({
      cookieStore: createCookieStore({ librerss_dashboard_preview: "1" }),
      deps: {
        ...baseDeps,
        runtimeFlags: {
          allowSignup: false,
          usePlaceholderData: true,
        },
      },
      searchParams: {},
    });

    expect(bootstrapState.initialAutoLoginPath).toBe(
      "/api/auth/dev-login?returnTo=%2Fdashboard",
    );
    expect(bootstrapState.hasPreviewQuery).toBe(false);
    expect(bootstrapState.initialPreviewMode).toBe(false);
  });

  test("falls back to an anonymous session when reading the stored session throws", async () => {
    const bootstrapState = await resolveDashboardPageBootstrap({
      cookieStore: createCookieStore({
        librerss_session: "broken-session-token",
      }),
      deps: {
        ...baseDeps,
        getUserFromSessionToken: async () => {
          throw new Error("session lookup failed");
        },
        isDevAutoLoginEnabled: () => false,
      },
      searchParams: { explore: "0" },
    });

    expect(bootstrapState.initialAutoLoginPath).toBeUndefined();
    expect(bootstrapState.initialSession.authenticated).toBe(false);
    expect(bootstrapState.initialSession.user).toBeNull();
  });

  test("treats the explore query as preview mode even without the preview cookie", async () => {
    const bootstrapState = await resolveDashboardPageBootstrap({
      cookieStore: createCookieStore({}),
      deps: {
        ...baseDeps,
        getUserFromSessionToken: async () => {
          throw new Error("preview mode should not load the stored session");
        },
        runtimeFlags: {
          allowSignup: true,
          usePlaceholderData: true,
        },
      },
      searchParams: { explore: ["1"] },
    });

    expect(bootstrapState.initialAutoLoginPath).toBeUndefined();
    expect(bootstrapState.hasPreviewQuery).toBe(true);
    expect(bootstrapState.initialPreviewMode).toBe(true);
  });

  test("buildAnonymousDashboardSession reflects runtime flags", () => {
    expect(
      buildAnonymousDashboardSession({
        allowSignup: true,
        usePlaceholderData: true,
      }),
    ).toEqual({
      allowSignup: true,
      authenticated: false,
      usePlaceholderData: true,
      user: null,
    });
  });

  test("getInitialDashboardSession reuses the stored session when available", async () => {
    expect(
      await getInitialDashboardSession(
        createCookieStore({ librerss_session: "stored-token" }),
        {
          getUserFromSessionToken: async () => ({
            email: "reader@example.com",
            userId: 7,
          }),
          runtimeFlags: {
            allowSignup: false,
            usePlaceholderData: false,
          },
          sessionCookieName: "librerss_session",
        },
      ),
    ).toEqual({
      allowSignup: false,
      authenticated: true,
      usePlaceholderData: false,
      user: { email: "reader@example.com", id: 7 },
    });
  });
});
