import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest, NextResponse } from "next/server";

import { ServerServiceError } from "@/lib";

let routeImportVersion = 0;

async function loadAccountExportRoute() {
  routeImportVersion += 1;
  return import(
    `@/app/api/account/export/route?account-export-route-test=${routeImportVersion}`
  );
}

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("account export route", () => {
  test("resolveAccountExportRouteDeps treats undefined and Next.js route context as empty deps", async () => {
    const { resolveAccountExportRouteDeps } = await loadAccountExportRoute();
    const explicitDeps = {
      requireAuthFn: async () => ({ userId: 42 as const }),
    };

    expect(resolveAccountExportRouteDeps(undefined)).toEqual({});
    expect(
      resolveAccountExportRouteDeps({
        params: Promise.resolve({ id: "42" }),
      }),
    ).toEqual({});
    expect(resolveAccountExportRouteDeps(explicitDeps)).toBe(explicitDeps);
  });

  test("GET returns the exported payload as a downloadable JSON attachment", async () => {
    const exportAccountDataFn = mock(async () => ({
      articleStatus: [],
      articleStatusContext: [],
      categories: [],
      categoryOrder: null,
      exportedAt: "2026-03-15T00:00:00.000Z",
      feedSources: [],
      sessions: [],
      user: {
        allowInsecureTls: false,
        createdAt: new Date("2026-03-15T00:00:00.000Z"),
        email: "reader@example.com",
        hasProxyPassword: true,
        lastForceRefreshedAt: null,
        proxyUrl: "http://proxy.example:8080",
        proxyUsername: "reader",
        userId: 42,
      },
    }));

    const { GET } = await loadAccountExportRoute();
    const response = await GET(
      new NextRequest("http://localhost/api/account/export"),
      {
        exportAccountDataFn,
        requireAuthFn: async () => ({ userId: 42 }),
      },
    );

    expect(exportAccountDataFn).toHaveBeenCalledWith(42, {
      getDbFn: undefined,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="librerss-account-export.json"',
    );
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );

    const body = await response.json();
    expect(body.user.hasProxyPassword).toBe(true);
    expect(body.user.proxyUrl).toBe("http://proxy.example:8080");
    expect(body.user.proxyUsername).toBe("reader");
  });

  test("GET returns an auth response unchanged when authentication fails", async () => {
    const unauthorizedResponse = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    const exportAccountDataFn = mock(async () => {
      throw new Error("route should not export after an auth failure");
    });

    const { GET } = await loadAccountExportRoute();
    const response = await GET(
      new NextRequest("http://localhost/api/account/export"),
      {
        exportAccountDataFn,
        requireAuthFn: async () => unauthorizedResponse,
      },
    );

    expect(exportAccountDataFn).not.toHaveBeenCalled();
    expect(response).toBe(unauthorizedResponse);
    expect(response.status).toBe(401);
  });

  test("GET maps ServerServiceError failures to the route json error contract", async () => {
    const exportAccountDataFn = mock(async () => {
      throw new ServerServiceError("Account export unavailable", 503);
    });

    const { GET } = await loadAccountExportRoute();
    const response = await GET(
      new NextRequest("http://localhost/api/account/export"),
      {
        exportAccountDataFn,
        requireAuthFn: async () => ({ userId: 42 }),
        serverServiceErrorClass: ServerServiceError,
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Account export unavailable",
    });
  });

  test("GET falls back to a 500 json error for unexpected failures", async () => {
    const exportAccountDataFn = mock(async () => {
      throw new Error("boom");
    });

    const { GET } = await loadAccountExportRoute();
    const response = await GET(
      new NextRequest("http://localhost/api/account/export"),
      {
        exportAccountDataFn,
        requireAuthFn: async () => ({ userId: 42 }),
        serverServiceErrorClass: ServerServiceError,
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal Server Error",
    });
  });
});
