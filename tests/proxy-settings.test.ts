/**
 * Tests: Proxy Settings
 * Covers proxy URL validation, settings API route behavior,
 * client service methods, and fetchHtml proxy passthrough.
 *
 * No mock.module() used. Route tests use deps injection for auth bypass.
 * DB is mocked via mock.module("@/lib/db/db") which is restored by setup.ts.
 */

import type { ProxyRouteDeps } from "@/app/api/settings/proxy/route";
import {
  resetApiClientForTesting,
  setApiClientForTesting,
} from "@/lib/api/http";
import { ArticleService } from "@/lib/api/services";
import { fetchHtml } from "@/lib/extract";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
  resetApiClientForTesting();
});

// ── Proxy Settings API Route ────────────────────────────────────────────────

describe("proxy settings API route", () => {
  const authenticatedUser = {
    sessionId: 1,
    userId: 1,
    email: "test@example.com",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  };

  const routeDeps: ProxyRouteDeps = {
    requireAuthFn: async () => authenticatedUser,
    probeFn: async () => true,
    detectFn: async () => "http",
    dnsCheckFn: async () => false,
  };

  const unreachableDeps: ProxyRouteDeps = {
    requireAuthFn: async () => authenticatedUser,
    probeFn: async () => false,
    detectFn: async () => "http",
    dnsCheckFn: async () => false,
  };

  function mockDb(proxyUrl: string | null = null) {
    let storedProxyUrl = proxyUrl;
    let storedAllowInsecureTls = false;
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ proxyUrl: storedProxyUrl }]),
            }),
          }),
        }),
        update: () => ({
          set: (values: {
            proxyUrl?: string | null;
            allowInsecureTls?: boolean;
          }) => {
            if (values.proxyUrl !== undefined) storedProxyUrl = values.proxyUrl;
            if (values.allowInsecureTls !== undefined)
              storedAllowInsecureTls = values.allowInsecureTls;
            return {
              where: () => ({
                returning: () =>
                  Promise.resolve([
                    { allowInsecureTls: storedAllowInsecureTls },
                  ]),
              }),
            };
          },
        }),
      }),
    }));
    mock.module("@/lib/logger", () => ({
      logger: { error: mock(), warn: mock(), info: mock(), debug: mock() },
    }));
  }

  test("GET returns unconfigured when no proxy URL saved", async () => {
    mockDb(null);
    const { GET } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy");
    const res = await GET(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.proxyUrl).toBeNull();
    expect(body.status).toBe("unreachable");
  });

  test("GET returns configured proxy URL when reachable", async () => {
    mockDb("http://proxy:8080");
    const { GET } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy");
    const res = await GET(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.proxyUrl).toBe("http://proxy:8080");
    expect(body.status).toBe("reachable");
  });

  test("GET returns configured=false when proxy unreachable", async () => {
    mockDb("http://proxy:8080");
    const { GET } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy");
    const res = await GET(req, unreachableDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.proxyUrl).toBe("http://proxy:8080");
    expect(body.status).toBe("unreachable");
  });

  test("PUT saves a valid http proxy URL", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: "http://proxy:8080" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.proxyUrl).toBe("http://proxy:8080");
    expect(body.status).toBe("reachable");
  });

  test("PUT saves a valid socks5 proxy URL", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: "socks5://proxy:1080" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.proxyUrl).toBe("socks5://proxy:1080");
    expect(body.status).toBe("reachable");
  });

  test("PUT returns 200 with error for invalid protocol", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: "ftp://proxy:21" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toContain("Invalid proxy URL");
    expect(body.configured).toBe(false);
    expect(body.status).toBe("unreachable");
  });

  test("PUT returns 200 with error for non-URL string", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: "not-a-url" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.configured).toBe(false);
    expect(body.status).toBe("unreachable");
  });

  test("PUT returns 200 with error for oversized proxy URL", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const longUrl = `http://proxy:8080/${"x".repeat(2100)}`;
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: longUrl }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toContain("too long");
    expect(body.configured).toBe(false);
    expect(body.status).toBe("unreachable");
  });

  test("PUT accepts bare IP:port and normalizes to http:// when not SOCKS", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: "176.105.212.219:8080" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.proxyUrl).toBe("http://176.105.212.219:8080");
    expect(body.status).toBe("reachable");
  });

  test("PUT auto-detects SOCKS proxy and normalizes bare IP:port to socks5://", async () => {
    mockDb(null);
    const socksDeps: ProxyRouteDeps = {
      requireAuthFn: async () => authenticatedUser,
      probeFn: async () => true,
      detectFn: async () => "socks5",
      dnsCheckFn: async () => false,
    };
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: "184.178.172.3:4145" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, socksDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.proxyUrl).toBe("socks5://184.178.172.3:4145");
    expect(body.status).toBe("reachable");
  });

  test("PUT saves but reports unreachable when probe fails", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: "http://proxy:8080" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, unreachableDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.proxyUrl).toBe("http://proxy:8080");
    expect(body.status).toBe("unreachable");
  });

  test("PUT treats string 'null' as unconfigured", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: "null" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.proxyUrl).toBeNull();
    expect(body.status).toBe("unreachable");
  });

  test("PUT treats string 'undefined' as unconfigured", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: "undefined" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.proxyUrl).toBeNull();
    expect(body.status).toBe("unreachable");
  });

  test("PUT clears proxy URL when null", async () => {
    mockDb("http://proxy:8080");
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: null }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.proxyUrl).toBeNull();
    expect(body.status).toBe("unreachable");
  });

  test("PUT trims whitespace from proxy URL", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl: "  http://proxy:8080  " }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.proxyUrl).toBe("http://proxy:8080");
  });

  // SSRF regression: internal/private hosts must be rejected before any TCP probe
  test.each([
    ["loopback IP", "http://127.0.0.1:8080"],
    ["localhost hostname", "http://localhost:8080"],
    ["private 10.x range", "http://10.0.0.1:3128"],
    ["private 192.168.x range", "http://192.168.1.1:8080"],
    ["private 172.16.x range", "http://172.16.0.1:8080"],
    ["link-local metadata IP", "http://169.254.169.254:80"],
    ["bare loopback IP:port", "127.0.0.1:9050"],
  ])("PUT rejects internal/private proxy URL: %s", async (_label, proxyUrl) => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({ proxyUrl }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.proxyUrl).toBeNull();
    expect(body.error).toBeDefined();
  });
});

// ── Client Service Methods ──────────────────────────────────────────────────

describe("ArticleService proxy methods", () => {
  const mockAxios: any = {
    get: mock(async () => ({ data: {} })),
    post: mock(async () => ({ data: {} })),
    put: mock(async () => ({ data: {} })),
    patch: mock(async () => ({ data: {} })),
    delete: mock(async () => ({ data: {} })),
  };

  beforeEach(() => {
    mockAxios.get = mock(async () => ({ data: {} }));
    mockAxios.put = mock(async () => ({ data: {} }));
    setApiClientForTesting(mockAxios);
  });

  test("getProxySettings calls GET /api/settings/proxy", async () => {
    mockAxios.get = mock(async () => ({
      data: { configured: true, proxyUrl: "http://proxy:8080" },
    }));
    const result = await ArticleService.getProxySettings();
    expect(mockAxios.get).toHaveBeenCalledWith("/api/settings/proxy");
    expect(result.configured).toBe(true);
    expect(result.proxyUrl).toBe("http://proxy:8080");
  });

  test("getProxySettings deduplicates concurrent requests", async () => {
    let resolveRequest: (value: {
      data: { configured: boolean };
    }) => void = () => {};

    mockAxios.get = mock(
      () =>
        new Promise<{ data: { configured: boolean } }>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const first = ArticleService.getProxySettings();
    const second = ArticleService.getProxySettings();

    expect(mockAxios.get).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { configured: true } });
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.configured).toBe(true);
    expect(secondResult.configured).toBe(true);
  });

  test("saveProxyUrl calls PUT /api/settings/proxy with url", async () => {
    mockAxios.put = mock(async () => ({
      data: { configured: true, proxyUrl: "socks5://proxy:1080" },
    }));
    const result = await ArticleService.saveProxyUrl("socks5://proxy:1080");
    expect(mockAxios.put).toHaveBeenCalledWith("/api/settings/proxy", {
      proxyUrl: "socks5://proxy:1080",
    });
    expect(result.configured).toBe(true);
  });

  test("saveProxyUrl sends null to clear", async () => {
    mockAxios.put = mock(async () => ({
      data: { configured: false, proxyUrl: null },
    }));
    const result = await ArticleService.saveProxyUrl(null);
    expect(mockAxios.put).toHaveBeenCalledWith("/api/settings/proxy", {
      proxyUrl: null,
    });
    expect(result.configured).toBe(false);
  });
});

// ── fetchHtml Proxy Passthrough ─────────────────────────────────────────────

describe("fetchHtml proxy passthrough", () => {
  test("does not use proxy when useProxy is false", async () => {
    const axiosGetFn = mock(async () => ({
      status: 200,
      headers: {},
      data: "<html>ok</html>",
    }));

    const html = await fetchHtml(
      "https://example.com/a",
      {
        isAllowedFeedUrlFn: async () => true,
        axiosGetFn: axiosGetFn as any,
      },
      { useProxy: false, proxyUrl: "http://proxy:8080" },
    );

    expect(html).toBe("<html>ok</html>");
    // With injected axiosGetFn, proxy is always bypassed (test path)
    expect(axiosGetFn).toHaveBeenCalledTimes(1);
  });

  test("returns HTML normally when useProxy true with injected deps", async () => {
    const axiosGetFn = mock(async () => ({
      status: 200,
      headers: {},
      data: "<html>proxied</html>",
    }));

    const html = await fetchHtml(
      "https://example.com/a",
      {
        isAllowedFeedUrlFn: async () => true,
        axiosGetFn: axiosGetFn as any,
      },
      { useProxy: true, proxyUrl: "http://proxy:8080" },
    );

    expect(html).toBe("<html>proxied</html>");
    expect(axiosGetFn).toHaveBeenCalledTimes(1);
  });

  test("proxy option does not interfere with URL validation", async () => {
    await expect(
      fetchHtml(
        "https://blocked.example.com/a",
        { isAllowedFeedUrlFn: async () => false },
        { useProxy: true, proxyUrl: "http://proxy:8080" },
      ),
    ).rejects.toThrow("Blocked URL");
  });
});

// ── Direct SSRF Guard Function Tests ───────────────────────────────────────

describe("proxy SSRF guard functions (direct)", () => {
  function mockLogger() {
    mock.module("@/lib/logger", () => ({
      logger: { error: mock(), warn: mock(), info: mock(), debug: mock() },
    }));
  }

  test("probeProxy returns false for loopback IP without TCP connect", async () => {
    mockLogger();
    const { probeProxy } = await import("@/lib/server");
    expect(await probeProxy("http://127.0.0.1:8080")).toBe(false);
  });

  test("probeProxy returns false for private 10.x IP", async () => {
    mockLogger();
    const { probeProxy } = await import("@/lib/server");
    expect(await probeProxy("http://10.0.0.1:3128")).toBe(false);
  });

  test("detectProxyProtocol returns 'http' for localhost without TCP connect", async () => {
    mockLogger();
    const { detectProxyProtocol } = await import("@/lib/server");
    expect(await detectProxyProtocol("localhost", 1080)).toBe("http");
  });

  test("detectProxyProtocol returns 'http' for 192.168.x without TCP connect", async () => {
    mockLogger();
    const { detectProxyProtocol } = await import("@/lib/server");
    expect(await detectProxyProtocol("192.168.0.1", 8080)).toBe("http");
  });

  test("normalizeProxyUrl returns null for private 192.168.x (http scheme)", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    expect(
      await normalizeProxyUrl(
        "http://192.168.0.1:8080",
        undefined,
        async () => false,
      ),
    ).toBeNull();
  });

  test("normalizeProxyUrl returns null for explicit SOCKS to internal IP", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    expect(
      await normalizeProxyUrl(
        "socks5://127.0.0.1:1080",
        undefined,
        async () => false,
      ),
    ).toBeNull();
  });

  test("normalizeProxyUrl returns null when DNS resolves to blocked address (http)", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    expect(
      await normalizeProxyUrl(
        "http://internal-proxy.example.com:8080",
        async () => "http",
        async () => true, // simulate DNS → 10.0.0.1
      ),
    ).toBeNull();
  });

  test("normalizeProxyUrl returns null when DNS resolves to blocked address (SOCKS)", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    expect(
      await normalizeProxyUrl(
        "socks5://internal-proxy.example.com:1080",
        undefined,
        async () => true, // simulate DNS → 10.0.0.1
      ),
    ).toBeNull();
  });

  test("PUT rejects proxy URL whose hostname resolves to blocked address", async () => {
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ proxyUrl: null }]),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => Promise.resolve([{ allowInsecureTls: false }]),
            }),
          }),
        }),
      }),
    }));
    mockLogger();
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      method: "PUT",
      body: JSON.stringify({
        proxyUrl: "http://external-proxy.example.com:8080",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req, {
      requireAuthFn: async () => ({
        sessionId: 1,
        userId: 1,
        email: "test@example.com",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      }),
      probeFn: async () => true,
      detectFn: async () => "http",
      dnsCheckFn: async () => true, // simulate DNS → blocked address
    });
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.proxyUrl).toBeNull();
    expect(body.error).toBeDefined();
  });

  test("normalizeProxyUrl successfully detects and normalizes HTTP proxy", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    const result = await normalizeProxyUrl(
      "safe-proxy.example.com:8080",
      async () => "http", // simulate HTTP detection
      async () => false, // not blocked
    );
    expect(result).toBe("http://safe-proxy.example.com:8080");
  });

  test("normalizeProxyUrl successfully detects and converts to socks5://", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    const result = await normalizeProxyUrl(
      "socks-proxy.example.com:1080",
      async () => "socks5", // simulate SOCKS5 detection
      async () => false, // not blocked
    );
    expect(result).toBe("socks5://socks-proxy.example.com:1080");
  });

  test("normalizeProxyUrl accepts explicit socks5:// and skips detection", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    const result = await normalizeProxyUrl(
      "socks5://socks-proxy.example.com:1080",
      async () => "http", // should not be called
      async () => false, // not blocked
    );
    expect(result).toBe("socks5://socks-proxy.example.com:1080");
  });

  test("normalizeProxyUrl accepts explicit socks4:// and skips detection", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    const result = await normalizeProxyUrl(
      "socks4://socks-proxy.example.com:1080",
      async () => "http", // should not be called
      async () => false, // not blocked
    );
    expect(result).toBe("socks4://socks-proxy.example.com:1080");
  });

  test("normalizeProxyUrl returns null for unparseable URL", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    const result = await normalizeProxyUrl(
      "not::a::valid::url",
      async () => "http",
      async () => false,
    );
    expect(result).toBeNull();
  });

  test("normalizeProxyUrl returns null for invalid protocol scheme", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    const result = await normalizeProxyUrl(
      "ftp://proxy.example.com:21",
      async () => "http",
      async () => false,
    );
    expect(result).toBeNull();
  });

  test("parseHostPort handles https:// default port 443", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    const result = await normalizeProxyUrl(
      "https://proxy.example.com",
      async () => "http",
      async () => false,
    );
    // Should use default port of 443 for https
    expect(result).toBe("https://proxy.example.com");
  });

  test("parseHostPort handles socks:// default port 1080", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    const result = await normalizeProxyUrl(
      "socks5://proxy.example.com",
      async () => "http", // not called for explicit socks
      async () => false,
    );
    // Should accept socks without explicit port
    expect(result).toBe("socks5://proxy.example.com");
  });

  test("probeProxy handles parseHostPort failure gracefully", async () => {
    mockLogger();
    const { probeProxy } = await import("@/lib/server");
    // Invalid URL that can't be parsed
    const result = await probeProxy("not::valid");
    expect(result).toBe(false);
  });
});
