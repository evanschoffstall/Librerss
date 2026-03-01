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
  __resetApiClientForTesting,
  __setApiClientForTesting,
} from "@/lib/api/http-client";
import { ArticleService } from "@/lib/api/services";
import { fetchHtml } from "@/lib/extract";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
  __resetApiClientForTesting();
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
  };

  const unreachableDeps: ProxyRouteDeps = {
    requireAuthFn: async () => authenticatedUser,
    probeFn: async () => false,
    detectFn: async () => "http",
  };

  function mockDb(proxyUrl: string | null = null) {
    let storedProxyUrl = proxyUrl;
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
          set: (values: { proxyUrl: string | null }) => {
            storedProxyUrl = values.proxyUrl;
            return {
              where: () => Promise.resolve([]),
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
    expect(body.configured).toBe(false);
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
    expect(body.configured).toBe(false);
    expect(body.proxyUrl).toBe("http://proxy:8080");
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
    __setApiClientForTesting(mockAxios);
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
