import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest, NextResponse } from "next/server";

import * as realAuthSessionModule from "@/lib/auth/session";
import * as realLoggerModule from "@/lib/logger";
import * as realServerModule from "@/lib/server";

const mutableEnv = process.env as Record<string, string | undefined>;

let routeImportVersion = 0;

function createLoggerMock(
  overrides: Partial<typeof realLoggerModule.logger>,
): typeof realLoggerModule {
  return {
    ...realLoggerModule,
    logger: Object.assign(
      Object.create(realLoggerModule.logger),
      realLoggerModule.logger,
      overrides,
    ),
  };
}

async function loadDevLoginRoute() {
  routeImportVersion += 1;
  return import(
    `@/app/api/auth/dev-login/route?route-version=${routeImportVersion}`
  );
}

function withDevAutoLoginEnv(
  env: Partial<
    Record<
      "DEV_AUTO_LOGIN_EMAIL" | "DEV_AUTO_LOGIN_PASSWORD" | "NODE_ENV",
      string | undefined
    >
  >,
  callback: () => Promise<void>,
) {
  const previousEnv = {
    DEV_AUTO_LOGIN_EMAIL: mutableEnv.DEV_AUTO_LOGIN_EMAIL,
    DEV_AUTO_LOGIN_PASSWORD: mutableEnv.DEV_AUTO_LOGIN_PASSWORD,
    NODE_ENV: mutableEnv.NODE_ENV,
  };

  return (async () => {
    try {
      for (const [key, value] of Object.entries(env)) {
        if (value === undefined) {
          delete mutableEnv[key];
        } else {
          mutableEnv[key] = value;
        }
      }

      await callback();
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete mutableEnv[key];
        } else {
          mutableEnv[key] = value;
        }
      }
    }
  })();
}

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("Auth API - Dev Login", () => {
  test("GET /api/auth/dev-login returns 404 outside development", async () => {
    await withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "production",
      },
      async () => {
        const { GET } = await loadDevLoginRoute();
        const response = await GET(
          new NextRequest("https://example.com/api/auth/dev-login"),
        );

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: "Not Found" });
      },
    );
  });

  test("GET /api/auth/dev-login sets a session cookie and redirects on success", async () => {
    const authenticateCredentials = mock(async () => ({
      email: "reader@example.com",
      ok: true as const,
      token: "session-token",
      userId: 7,
    }));
    const setSessionCookie = mock(() => undefined);

    mock.module("@/lib/auth/session", () => ({
      ...realAuthSessionModule,
      authenticateCredentials,
      setSessionCookie,
    }));
    mock.module("@/lib/logger", () =>
      createLoggerMock({ info: () => undefined, warn: () => undefined }),
    );
    mock.module("@/lib/server", () => ({
      ...realServerModule,
      logAndRespondError: () =>
        NextResponse.json({ error: "Internal Server Error" }, { status: 500 }),
    }));

    await withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: " Reader@Example.com ",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
      },
      async () => {
        const { GET } = await loadDevLoginRoute();
        const response = await GET(
          new NextRequest(
            "http://0.0.0.0:3000/api/auth/dev-login?returnTo=%2Fdashboard%3Ftab%3Dfeeds",
            {
              headers: {
                host: "192.168.2.117:3000",
                "x-forwarded-proto": "http",
              },
            },
          ),
        );

        expect(authenticateCredentials).toHaveBeenCalledWith(
          "reader@example.com",
          "Password123!",
        );
        expect(setSessionCookie).toHaveBeenCalledWith(
          response,
          "session-token",
        );
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
          "http://192.168.2.117:3000/dashboard?tab=feeds",
        );
      },
    );
  });

  test("GET /api/auth/dev-login redirects to the failure marker when credentials are rejected", async () => {
    const authenticateCredentials = mock(async () => ({ ok: false as const }));
    const setSessionCookie = mock(() => undefined);

    mock.module("@/lib/auth/session", () => ({
      ...realAuthSessionModule,
      authenticateCredentials,
      setSessionCookie,
    }));
    mock.module("@/lib/logger", () =>
      createLoggerMock({ info: () => undefined, warn: () => undefined }),
    );
    mock.module("@/lib/server", () => ({
      ...realServerModule,
      logAndRespondError: () =>
        NextResponse.json({ error: "Internal Server Error" }, { status: 500 }),
    }));

    await withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
      },
      async () => {
        const { GET } = await loadDevLoginRoute();
        const response = await GET(
          new NextRequest(
            "http://0.0.0.0:3000/api/auth/dev-login?returnTo=%2Fdashboard%3Ftab%3Dfeeds",
            {
              headers: {
                host: "192.168.2.117:3000",
                "x-forwarded-proto": "http",
              },
            },
          ),
        );

        expect(setSessionCookie).not.toHaveBeenCalled();
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
          "http://192.168.2.117:3000/dashboard?tab=feeds&devLogin=failed",
        );
      },
    );
  });

  test("GET /api/auth/dev-login ignores unsafe return targets", async () => {
    const authenticateCredentials = mock(async () => ({
      email: "reader@example.com",
      ok: true as const,
      token: "session-token",
      userId: 7,
    }));

    mock.module("@/lib/auth/session", () => ({
      ...realAuthSessionModule,
      authenticateCredentials,
      setSessionCookie: () => undefined,
    }));
    mock.module("@/lib/logger", () =>
      createLoggerMock({ info: () => undefined, warn: () => undefined }),
    );
    mock.module("@/lib/server", () => ({
      ...realServerModule,
      logAndRespondError: () =>
        NextResponse.json({ error: "Internal Server Error" }, { status: 500 }),
    }));

    await withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
      },
      async () => {
        const { GET } = await loadDevLoginRoute();
        const response = await GET(
          new NextRequest(
            "http://0.0.0.0:3000/api/auth/dev-login?returnTo=https%3A%2F%2Fevil.example%2Fsteal",
            {
              headers: {
                host: "192.168.2.117:3000",
                "x-forwarded-proto": "http",
              },
            },
          ),
        );

        expect(response.headers.get("location")).toBe(
          "http://192.168.2.117:3000/dashboard",
        );
      },
    );
  });

  test("GET /api/auth/dev-login ignores protocol-relative return targets", async () => {
    const authenticateCredentials = mock(async () => ({
      email: "reader@example.com",
      ok: true as const,
      token: "session-token",
      userId: 7,
    }));

    mock.module("@/lib/auth/session", () => ({
      ...realAuthSessionModule,
      authenticateCredentials,
      setSessionCookie: () => undefined,
    }));
    mock.module("@/lib/logger", () =>
      createLoggerMock({ info: () => undefined, warn: () => undefined }),
    );
    mock.module("@/lib/server", () => ({
      ...realServerModule,
      logAndRespondError: () =>
        NextResponse.json({ error: "Internal Server Error" }, { status: 500 }),
    }));

    await withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
      },
      async () => {
        const { GET } = await loadDevLoginRoute();
        const response = await GET(
          new NextRequest(
            "http://0.0.0.0:3000/api/auth/dev-login?returnTo=%2F%2Fevil.example%2Fsteal",
            {
              headers: {
                host: "192.168.2.117:3000",
                "x-forwarded-proto": "http",
              },
            },
          ),
        );

        expect(response.headers.get("location")).toBe(
          "http://192.168.2.117:3000/dashboard",
        );
      },
    );
  });

  test("GET /api/auth/dev-login falls back to request.url when forwarding headers are missing", async () => {
    const authenticateCredentials = mock(async () => ({
      email: "reader@example.com",
      ok: true as const,
      token: "session-token",
      userId: 7,
    }));

    mock.module("@/lib/auth/session", () => ({
      ...realAuthSessionModule,
      authenticateCredentials,
      setSessionCookie: () => undefined,
    }));
    mock.module("@/lib/logger", () =>
      createLoggerMock({ info: () => undefined, warn: () => undefined }),
    );
    mock.module("@/lib/server", () => ({
      ...realServerModule,
      logAndRespondError: () =>
        NextResponse.json({ error: "Internal Server Error" }, { status: 500 }),
    }));

    await withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
      },
      async () => {
        const { GET } = await loadDevLoginRoute();
        const response = await GET(
          new NextRequest(
            "https://example.com/api/auth/dev-login?returnTo=%2Fdashboard%3Ftab%3Dfeeds",
          ),
        );

        expect(response.headers.get("location")).toBe(
          "https://example.com/dashboard?tab=feeds",
        );
      },
    );
  });

  test("GET /api/auth/dev-login stays disabled when development creds are unset", async () => {
    await withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: undefined,
        DEV_AUTO_LOGIN_PASSWORD: undefined,
        NODE_ENV: "development",
      },
      async () => {
        const { GET } = await loadDevLoginRoute();
        const response = await GET(
          new NextRequest("https://example.com/api/auth/dev-login"),
        );

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: "Not Found" });
      },
    );
  });

  test("GET /api/auth/dev-login prefers forwarded host and request protocol when redirecting", async () => {
    const authenticateCredentials = mock(async () => ({
      email: "reader@example.com",
      ok: true as const,
      token: "session-token",
      userId: 7,
    }));

    mock.module("@/lib/auth/session", () => ({
      ...realAuthSessionModule,
      authenticateCredentials,
      setSessionCookie: () => undefined,
    }));
    mock.module("@/lib/logger", () =>
      createLoggerMock({ info: () => undefined, warn: () => undefined }),
    );
    mock.module("@/lib/server", () => ({
      ...realServerModule,
      logAndRespondError: () =>
        NextResponse.json({ error: "Internal Server Error" }, { status: 500 }),
    }));

    await withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
      },
      async () => {
        const { GET } = await loadDevLoginRoute();
        const response = await GET(
          new NextRequest(
            "https://internal.example/api/auth/dev-login?returnTo=%2Fdashboard%3Ftab%3Dfeeds",
            {
              headers: {
                host: "internal.example",
                "x-forwarded-host": "192.168.2.117:3000",
              },
            },
          ),
        );

        expect(response.headers.get("location")).toBe(
          "https://192.168.2.117:3000/dashboard?tab=feeds",
        );
      },
    );
  });

  test("GET /api/auth/dev-login falls back to the request protocol when only the host header is forwarded", async () => {
    const authenticateCredentials = mock(async () => ({
      email: "reader@example.com",
      ok: true as const,
      token: "session-token",
      userId: 7,
    }));

    mock.module("@/lib/auth/session", () => ({
      ...realAuthSessionModule,
      authenticateCredentials,
      setSessionCookie: () => undefined,
    }));
    mock.module("@/lib/logger", () =>
      createLoggerMock({ info: () => undefined, warn: () => undefined }),
    );
    mock.module("@/lib/server", () => ({
      ...realServerModule,
      logAndRespondError: () =>
        NextResponse.json({ error: "Internal Server Error" }, { status: 500 }),
    }));

    await withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
      },
      async () => {
        const { GET } = await loadDevLoginRoute();
        const response = await GET(
          new NextRequest(
            "https://internal.example/api/auth/dev-login?returnTo=%2Fdashboard%3Ftab%3Dfeeds",
            {
              headers: {
                host: "192.168.2.117:3000",
              },
            },
          ),
        );

        expect(response.headers.get("location")).toBe(
          "https://192.168.2.117:3000/dashboard?tab=feeds",
        );
      },
    );
  });

  test("GET /api/auth/dev-login routes unexpected errors through the shared error responder", async () => {
    const authenticateCredentials = mock(async () => {
      throw new Error("boom");
    });
    const logAndRespondError = mock(() =>
      NextResponse.json({ error: "Internal Server Error" }, { status: 500 }),
    );

    mock.module("@/lib/auth/session", () => ({
      ...realAuthSessionModule,
      authenticateCredentials,
      setSessionCookie: () => undefined,
    }));
    mock.module("@/lib/logger", () => createLoggerMock({}));
    mock.module("@/lib/server", () => ({
      ...realServerModule,
      logAndRespondError,
    }));

    await withDevAutoLoginEnv(
      {
        DEV_AUTO_LOGIN_EMAIL: "reader@example.com",
        DEV_AUTO_LOGIN_PASSWORD: "Password123!",
        NODE_ENV: "development",
      },
      async () => {
        const { GET } = await loadDevLoginRoute();
        const response = await GET(
          new NextRequest("https://example.com/api/auth/dev-login"),
        );

        expect(logAndRespondError).toHaveBeenCalledWith(
          "Development auto-login error",
          expect.any(Error),
        );
        expect(response.status).toBe(500);
      },
    );
  });
});
