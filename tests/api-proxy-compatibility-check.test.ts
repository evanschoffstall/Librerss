import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const routeModulePath =
  "@/app/api/settings/proxy/compatibility-check/route?api-proxy-compatibility-check-test-isolated";
const importRouteModule = () => import(routeModulePath);

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

class TestGotScrapingError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
    public readonly proxyMode: string,
    public readonly requestHeaders: Record<string, string>,
    public readonly responseHeaders: Record<string, string>,
  ) {
    super(responseBody);
  }
}

class TestServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string,
  ) {
    super(message);
  }
}

const routeDeps = {
  fetchHtmlWithFingerprintFn: fetchHtmlWithFingerprintMock,
  gotScrapingErrorClass: TestGotScrapingError,
  loggerInstance: {
    error: loggerErrorMock,
    info: loggerInfoMock,
  },
  parseJsonBodyOrResponseFn: parseJsonBodyOrResponseMock,
  pickDiagnosticHeadersFn: (
    headers: Record<string, string | string[] | undefined>,
  ) => headers,
  rateLimitConfig: {
    maxAttempts: 3,
    windowMs: 300_000,
  },
  requireMutableAuthenticatedUserFn: requireMutableAuthenticatedUserMock,
  resolveUserProxyFn: resolveUserProxyMock,
  serviceErrorClass: TestServiceError,
};

beforeEach(() => {
  mock.restore();
  fetchHtmlWithFingerprintMock.mockClear();
  loggerErrorMock.mockClear();
  loggerInfoMock.mockClear();
  parseJsonBodyOrResponseMock.mockClear();
  requireMutableAuthenticatedUserMock.mockClear();
  resolveUserProxyMock.mockClear();
});

afterEach(() => {
  mock.restore();
});

afterAll(() => {
  mock.restore();
});

describe("proxy compatibility check route", () => {
  test("pins Node runtime and extended duration for network probes", async () => {
    const routeModule = await importRouteModule();
    expect(routeModule.runtime).toBe("nodejs");
    expect(routeModule.maxDuration).toBe(30);
  });

  test("returns compatibility results for all vendor samples", async () => {
    const { POST } = await importRouteModule();
    const response = await POST(
      new NextRequest("http://localhost/api/settings/proxy/compatibility-check", {
        body: JSON.stringify({ useProxy: true }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
      routeDeps,
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