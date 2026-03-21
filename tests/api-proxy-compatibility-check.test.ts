import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const fetchHtmlWithFingerprintMock = mock(
  async (
    url: string,
    _isAllowedUrl: (candidateUrl: string) => Promise<boolean>,
    options?: {
      allowInsecureTls?: boolean;
      proxyUrl?: string;
    },
  ) => ({
    html: `<html><body>${url} via ${options?.proxyUrl ?? "direct"}</body></html>`,
    requestHeaders: { "user-agent": "test-agent" },
  }),
);

const loggerErrorMock = mock(() => {});
const loggerInfoMock = mock(() => {});
const parseJsonBodyOrResponseMock = mock(async () => ({ useProxy: true }));
const requireMutableAuthenticatedUserMock = mock(async () => ({ userId: 1 }));
const resolveUserProxyMock = mock(async () => ({
  allowInsecureTls: true,
  proxyUrl: "socks5://proxy.example:1080",
}));

function registerModuleMocks() {
  mock.module("@/lib/api/http", () => ({
    parseJsonBodyOrResponse: parseJsonBodyOrResponseMock,
  }));
  mock.module("@/lib/config", () => ({
    CONFIG: {
      RATE_LIMIT_PROXY_COMPATIBILITY_MAX_ATTEMPTS: 3,
      RATE_LIMIT_PROXY_COMPATIBILITY_WINDOW_MS: 300_000,
    },
  }));
  mock.module("@/lib/fetch", () => ({
    fetchHtmlWithFingerprint: fetchHtmlWithFingerprintMock,
    GotScrapingError: class GotScrapingError extends Error {
      constructor(
        public readonly statusCode: number,
        public readonly responseBody: string,
        public readonly proxyMode: string,
        public readonly requestHeaders: Record<string, string>,
        public readonly responseHeaders: Record<string, string>,
      ) {
        super(responseBody);
      }
    },
    pickDiagnosticHeaders: (
      headers: Record<string, string | string[] | undefined>,
    ) => headers,
  }));
  mock.module("@/lib/logger", () => ({
    logger: {
      error: loggerErrorMock,
      info: loggerInfoMock,
    },
  }));
  mock.module("@/lib/server", () => ({
    requireMutableAuthenticatedUser: requireMutableAuthenticatedUserMock,
  }));
  mock.module("@/lib/server/services", () => ({
    resolveUserProxy: resolveUserProxyMock,
    ServiceError: class ServiceError extends Error {
      constructor(
        message: string,
        public readonly status: number,
        public readonly reason?: string,
      ) {
        super(message);
      }
    },
  }));
}

beforeEach(() => {
  mock.restore();
  fetchHtmlWithFingerprintMock.mockClear();
  loggerErrorMock.mockClear();
  loggerInfoMock.mockClear();
  parseJsonBodyOrResponseMock.mockClear();
  requireMutableAuthenticatedUserMock.mockClear();
  resolveUserProxyMock.mockClear();
  registerModuleMocks();
});

afterEach(() => {
  mock.restore();
});

afterAll(() => {
  mock.restore();
});

describe("proxy compatibility check route", () => {
  test("pins Node runtime and extended duration for network probes", async () => {
    const routeModule = await import("@/app/api/settings/proxy/compatibility-check/route");
    expect(routeModule.runtime).toBe("nodejs");
    expect(routeModule.maxDuration).toBe(30);
  });

  test("returns compatibility results for all vendor samples", async () => {
    const { POST } = await import("@/app/api/settings/proxy/compatibility-check/route");
    const response = await POST(
      new NextRequest("http://localhost/api/settings/proxy/compatibility-check", {
        body: JSON.stringify({ useProxy: true }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      results: {
        compatibilitySignalDetected: boolean;
        site: string;
        success: boolean;
        vendor: string;
      }[];
    };

    expect(body.results).toHaveLength(4);
    expect(body.results.every((result) => result.success)).toBe(true);
    expect(fetchHtmlWithFingerprintMock).toHaveBeenCalledTimes(4);
    expect(resolveUserProxyMock).toHaveBeenCalledTimes(1);
  });
});