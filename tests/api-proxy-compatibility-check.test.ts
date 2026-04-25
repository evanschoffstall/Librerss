import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { NextRequest } from "next/server";

const routeModulePath =
  "@/app/api/settings/proxy/compatibility-check/route?api-proxy-compatibility-check-test-isolated";
const importRouteModule = () => import(routeModulePath);

const fetchHtmlWithHttpCloakMock = mock(
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

class TestHttpCloakUpstreamError extends Error {
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
  fetchHtmlWithHttpCloakFn: fetchHtmlWithHttpCloakMock,
  httpCloakUpstreamErrorClass: TestHttpCloakUpstreamError,
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
  fetchHtmlWithHttpCloakMock.mockClear();
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
      new NextRequest(
        "http://localhost/api/settings/proxy/compatibility-check",
        {
          body: JSON.stringify({ useProxy: true }),
          headers: {
            "content-type": "application/json",
            "sec-fetch-site": "same-origin",
          },
          method: "POST",
        },
      ),
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
    expect(fetchHtmlWithHttpCloakMock).toHaveBeenCalledTimes(4);
    expect(resolveUserProxyMock).toHaveBeenCalledTimes(1);
  });

  test("detects vendor challenge markers in successful sample bodies", async () => {
    const { POST } = await importRouteModule();

    fetchHtmlWithHttpCloakMock.mockImplementation(async (url) => {
      if (url.includes("pennlive")) {
        return {
          html: "<html><body>geo.captcha-delivery.datadome.co</body></html>",
          requestHeaders: { "user-agent": "test-agent" },
        };
      }

      if (url.includes("abc27")) {
        return {
          html: "<html><body>px-captcha perimeterx challenge</body></html>",
          requestHeaders: { "user-agent": "test-agent" },
        };
      }

      if (url.includes("cloudflare")) {
        return {
          html: "<html><body>/cdn-cgi/challenge-platform</body></html>",
          requestHeaders: { "user-agent": "test-agent" },
        };
      }

      return {
        html: '<html><body><div class="g-recaptcha">I\'m not a robot</div></body></html>',
        requestHeaders: { "user-agent": "test-agent" },
      };
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/settings/proxy/compatibility-check",
        {
          body: JSON.stringify({ useProxy: true }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      ),
      routeDeps,
    );

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
    expect(
      body.results.every((result) => result.compatibilitySignalDetected),
    ).toBe(true);
  });

  test("classifies upstream challenge errors from response bodies", async () => {
    const { POST } = await importRouteModule();

    fetchHtmlWithHttpCloakMock.mockImplementation(async (url) => {
      if (url.includes("cloudflare")) {
        throw new TestHttpCloakUpstreamError(
          403,
          "<html><body>cf-browser-verification</body></html>",
          "proxy",
          { "user-agent": "test-agent" },
          { server: "cloudflare" },
        );
      }

      return {
        html: `<html><body>${url}</body></html>`,
        requestHeaders: { "user-agent": "test-agent" },
      };
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/settings/proxy/compatibility-check",
        {
          body: JSON.stringify({ useProxy: true }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      ),
      routeDeps,
    );

    const body = (await response.json()) as {
      results: {
        compatibilitySignalDetected: boolean;
        error?: string;
        site: string;
        statusCode?: number;
        success: boolean;
        vendor: string;
      }[];
    };

    const cloudflareResult = body.results.find(
      (result) => result.vendor === "Cloudflare",
    );

    expect(cloudflareResult).toMatchObject({
      compatibilitySignalDetected: true,
      error: "HTTP 403",
      site: "Cloudflare sample",
      statusCode: 403,
      success: false,
      vendor: "Cloudflare",
    });
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });
});
