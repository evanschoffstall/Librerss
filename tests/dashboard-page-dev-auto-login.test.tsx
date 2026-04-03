import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let pageImportVersion = 0;

function createCookieStore(values: Record<string, string>) {
  return {
    get(name: string) {
      return values[name] ? { name, value: values[name] } : undefined;
    },
  };
}

async function loadDashboardPage() {
  pageImportVersion += 1;
  return import(`@/app/dashboard/page?test-version=${pageImportVersion}`);
}

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("dashboard page dev auto-login bootstrap", () => {
  test("passes the auto-login request path to DashboardRouter when unauthenticated", async () => {
    mock.module("next/headers", () => ({
      cookies: async () => createCookieStore({}),
    }));
    mock.module("@/lib/auth/session", () => ({
      getUserFromSessionToken: async () => null,
      SESSION_COOKIE_NAME: "librerss_session",
    }));
    mock.module("@/lib/core/runtime", () => ({
      RUNTIME_FLAGS: {
        allowSignup: false,
        usePlaceholderData: false,
      },
    }));
    mock.module("@/lib/auth/dev-auto-login", () => ({
      buildDevAutoLoginRequestPath: () =>
        "/api/auth/dev-login?returnTo=%2Fdashboard",
      isDevAutoLoginEnabled: () => true,
      isDevAutoLoginFailure: () => false,
    }));
    mock.module("@/app/dashboard/DashboardRouter", () => ({
      DashboardRouter: (props: {
        initialAutoLoginPath?: string;
        initialLoginErrorMessage?: string;
        initialSession?: { authenticated?: boolean };
      }) =>
        React.createElement("div", {
          "data-authenticated": String(
            props.initialSession?.authenticated === true,
          ),
          "data-auto-login-path": props.initialAutoLoginPath ?? "",
          "data-login-error": props.initialLoginErrorMessage ?? "",
        }),
    }));

    const { default: DashboardPage } = await loadDashboardPage();
    const markup = renderToStaticMarkup(
      await DashboardPage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).toContain(
      'data-auto-login-path="/api/auth/dev-login?returnTo=%2Fdashboard"',
    );
    expect(markup).toContain('data-authenticated="false"');
  });

  test("surfaces the failure message instead of retrying after a failed dev auto-login", async () => {
    mock.module("next/headers", () => ({
      cookies: async () => createCookieStore({}),
    }));
    mock.module("@/lib/auth/session", () => ({
      getUserFromSessionToken: async () => null,
      SESSION_COOKIE_NAME: "librerss_session",
    }));
    mock.module("@/lib/core/runtime", () => ({
      RUNTIME_FLAGS: {
        allowSignup: false,
        usePlaceholderData: false,
      },
    }));
    mock.module("@/lib/auth/dev-auto-login", () => ({
      buildDevAutoLoginRequestPath: () =>
        "/api/auth/dev-login?returnTo=%2Fdashboard",
      isDevAutoLoginEnabled: () => true,
      isDevAutoLoginFailure: () => true,
    }));
    mock.module("@/app/dashboard/DashboardRouter", () => ({
      DashboardRouter: (props: {
        initialAutoLoginPath?: string;
        initialLoginErrorMessage?: string;
      }) =>
        React.createElement("div", {
          "data-auto-login-path": props.initialAutoLoginPath ?? "",
          "data-login-error": props.initialLoginErrorMessage ?? "",
        }),
    }));

    const { default: DashboardPage } = await loadDashboardPage();
    const markup = renderToStaticMarkup(
      await DashboardPage({
        searchParams: Promise.resolve({ devLogin: "failed" }),
      }),
    );

    expect(markup).toContain('data-auto-login-path=""');
    expect(markup).toContain("Dev auto-login failed.");
  });

  test("keeps auto-login disabled when an authenticated session already exists", async () => {
    mock.module("next/headers", () => ({
      cookies: async () =>
        createCookieStore({ librerss_session: "existing-session-token" }),
    }));
    mock.module("@/lib/auth/session", () => ({
      getUserFromSessionToken: async () => ({
        email: "reader@example.com",
        userId: 7,
      }),
      SESSION_COOKIE_NAME: "librerss_session",
    }));
    mock.module("@/lib/core/runtime", () => ({
      RUNTIME_FLAGS: {
        allowSignup: false,
        usePlaceholderData: false,
      },
    }));
    mock.module("@/lib/auth/dev-auto-login", () => ({
      buildDevAutoLoginRequestPath: () =>
        "/api/auth/dev-login?returnTo=%2Fdashboard",
      isDevAutoLoginEnabled: () => true,
      isDevAutoLoginFailure: () => false,
    }));
    mock.module("@/app/dashboard/DashboardRouter", () => ({
      DashboardRouter: (props: {
        initialAutoLoginPath?: string;
        initialSession?: { authenticated?: boolean; user?: { email: string } };
      }) =>
        React.createElement("div", {
          "data-authenticated": String(
            props.initialSession?.authenticated === true,
          ),
          "data-auto-login-path": props.initialAutoLoginPath ?? "",
          "data-user-email": props.initialSession?.user?.email ?? "",
        }),
    }));

    const { default: DashboardPage } = await loadDashboardPage();
    const markup = renderToStaticMarkup(
      await DashboardPage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).toContain('data-authenticated="true"');
    expect(markup).toContain('data-auto-login-path=""');
    expect(markup).toContain('data-user-email="reader@example.com"');
  });

  test("uses the explore query to suppress auto-login and boot an anonymous session", async () => {
    mock.module("next/headers", () => ({
      cookies: async () => createCookieStore({}),
    }));
    mock.module("@/lib/auth/session", () => ({
      getUserFromSessionToken: async () => {
        throw new Error("should not load session in preview mode");
      },
      SESSION_COOKIE_NAME: "librerss_session",
    }));
    mock.module("@/lib/core/runtime", () => ({
      RUNTIME_FLAGS: {
        allowSignup: true,
        usePlaceholderData: true,
      },
    }));
    mock.module("@/lib/auth/dev-auto-login", () => ({
      buildDevAutoLoginRequestPath: () =>
        "/api/auth/dev-login?returnTo=%2Fdashboard",
      isDevAutoLoginEnabled: () => true,
      isDevAutoLoginFailure: () => false,
    }));
    mock.module("@/app/dashboard/DashboardRouter", () => ({
      DashboardRouter: (props: {
        hasPreviewQuery?: boolean;
        initialAutoLoginPath?: string;
        initialPreviewMode?: boolean;
        initialSession?: {
          allowSignup?: boolean;
          authenticated?: boolean;
          usePlaceholderData?: boolean;
        };
      }) =>
        React.createElement("div", {
          "data-allow-signup": String(
            props.initialSession?.allowSignup === true,
          ),
          "data-authenticated": String(
            props.initialSession?.authenticated === true,
          ),
          "data-auto-login-path": props.initialAutoLoginPath ?? "",
          "data-has-preview-query": String(props.hasPreviewQuery === true),
          "data-preview-mode": String(props.initialPreviewMode === true),
          "data-use-placeholder-data": String(
            props.initialSession?.usePlaceholderData === true,
          ),
        }),
    }));

    const { default: DashboardPage } = await loadDashboardPage();
    const markup = renderToStaticMarkup(
      await DashboardPage({
        searchParams: Promise.resolve({ explore: ["1", "0"] }),
      }),
    );

    expect(markup).toContain('data-auto-login-path=""');
    expect(markup).toContain('data-has-preview-query="true"');
    expect(markup).toContain('data-preview-mode="true"');
    expect(markup).toContain('data-allow-signup="true"');
    expect(markup).toContain('data-authenticated="false"');
    expect(markup).toContain('data-use-placeholder-data="true"');
  });

  test("ignores the preview cookie when the explore query is absent", async () => {
    mock.module("next/headers", () => ({
      cookies: async () =>
        createCookieStore({ librerss_dashboard_preview: "1" }),
    }));
    mock.module("@/lib/auth/session", () => ({
      getUserFromSessionToken: async () => null,
      SESSION_COOKIE_NAME: "librerss_session",
    }));
    mock.module("@/lib/core/runtime", () => ({
      RUNTIME_FLAGS: {
        allowSignup: false,
        usePlaceholderData: true,
      },
    }));
    mock.module("@/lib/auth/dev-auto-login", () => ({
      buildDevAutoLoginRequestPath: () =>
        "/api/auth/dev-login?returnTo=%2Fdashboard",
      isDevAutoLoginEnabled: () => true,
      isDevAutoLoginFailure: () => false,
    }));
    mock.module("@/app/dashboard/DashboardRouter", () => ({
      DashboardRouter: (props: {
        hasPreviewQuery?: boolean;
        initialAutoLoginPath?: string;
        initialPreviewMode?: boolean;
      }) =>
        React.createElement("div", {
          "data-auto-login-path": props.initialAutoLoginPath ?? "",
          "data-has-preview-query": String(props.hasPreviewQuery === true),
          "data-preview-mode": String(props.initialPreviewMode === true),
        }),
    }));

    const { default: DashboardPage } = await loadDashboardPage();
    const markup = renderToStaticMarkup(
      await DashboardPage({ searchParams: Promise.resolve({}) }),
    );

    expect(markup).toContain(
      'data-auto-login-path="/api/auth/dev-login?returnTo=%2Fdashboard"',
    );
    expect(markup).toContain('data-has-preview-query="false"');
    expect(markup).toContain('data-preview-mode="false"');
  });

  test("falls back to an anonymous session when reading the stored session throws", async () => {
    mock.module("next/headers", () => ({
      cookies: async () =>
        createCookieStore({ librerss_session: "broken-session-token" }),
    }));
    mock.module("@/lib/auth/session", () => ({
      getUserFromSessionToken: async () => {
        throw new Error("session lookup failed");
      },
      SESSION_COOKIE_NAME: "librerss_session",
    }));
    mock.module("@/lib/core/runtime", () => ({
      RUNTIME_FLAGS: {
        allowSignup: false,
        usePlaceholderData: false,
      },
    }));
    mock.module("@/lib/auth/dev-auto-login", () => ({
      buildDevAutoLoginRequestPath: () =>
        "/api/auth/dev-login?returnTo=%2Fdashboard",
      isDevAutoLoginEnabled: () => false,
      isDevAutoLoginFailure: () => false,
    }));
    mock.module("@/app/dashboard/DashboardRouter", () => ({
      DashboardRouter: (props: {
        initialAutoLoginPath?: string;
        initialSession?: { authenticated?: boolean; user?: unknown };
      }) =>
        React.createElement("div", {
          "data-authenticated": String(
            props.initialSession?.authenticated === true,
          ),
          "data-auto-login-path": props.initialAutoLoginPath ?? "",
          "data-user": String(props.initialSession?.user ?? "null"),
        }),
    }));

    const { default: DashboardPage } = await loadDashboardPage();
    const markup = renderToStaticMarkup(
      await DashboardPage({ searchParams: Promise.resolve({ explore: "0" }) }),
    );

    expect(markup).toContain('data-auto-login-path=""');
    expect(markup).toContain('data-authenticated="false"');
    expect(markup).toContain('data-user="null"');
  });

  test("treats the explore query as preview mode even without the preview cookie", async () => {
    mock.module("next/headers", () => ({
      cookies: async () => createCookieStore({}),
    }));
    mock.module("@/lib/auth/session", () => ({
      getUserFromSessionToken: async () => {
        throw new Error("preview mode should not load the stored session");
      },
      SESSION_COOKIE_NAME: "librerss_session",
    }));
    mock.module("@/lib/core/runtime", () => ({
      RUNTIME_FLAGS: {
        allowSignup: true,
        usePlaceholderData: true,
      },
    }));
    mock.module("@/lib/auth/dev-auto-login", () => ({
      buildDevAutoLoginRequestPath: () =>
        "/api/auth/dev-login?returnTo=%2Fdashboard",
      isDevAutoLoginEnabled: () => true,
      isDevAutoLoginFailure: () => false,
    }));
    mock.module("@/app/dashboard/DashboardRouter", () => ({
      DashboardRouter: (props: {
        hasPreviewQuery?: boolean;
        initialAutoLoginPath?: string;
        initialPreviewMode?: boolean;
      }) =>
        React.createElement("div", {
          "data-auto-login-path": props.initialAutoLoginPath ?? "",
          "data-has-preview-query": String(props.hasPreviewQuery === true),
          "data-preview-mode": String(props.initialPreviewMode === true),
        }),
    }));

    const { default: DashboardPage } = await loadDashboardPage();
    const markup = renderToStaticMarkup(
      await DashboardPage({ searchParams: Promise.resolve({ explore: ["1"] }) }),
    );

    expect(markup).toContain('data-auto-login-path=""');
    expect(markup).toContain('data-has-preview-query="true"');
    expect(markup).toContain('data-preview-mode="true"');
  });
});