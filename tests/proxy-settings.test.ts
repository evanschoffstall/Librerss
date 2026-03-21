/**
 * Tests: Proxy Settings
 * Covers proxy URL validation, settings API route behavior,
 * client service methods, and fetchHtml proxy passthrough.
 *
 * No mock.module() used. Route tests use deps injection for auth bypass.
 * DB is mocked via mock.module("@/lib/db/db") which is restored by setup.ts.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

import type { ProxyRouteDeps } from "@/app/api/settings/proxy/route";

import {
  resetApiClientForTesting,
  setApiClientForTesting,
} from "@/lib/api/http";
import { ArticleService } from "@/lib/api/services";
import { fetchHtml } from "@/lib/extract";

afterEach(() => mock.restore());

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
  resetApiClientForTesting();
});

// ── Proxy Settings API Route ────────────────────────────────────────────────

describe("proxy settings API route", () => {
  const originalProxyEncryptionKey =
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY;
  const authenticatedUser = {
    email: "test@example.com",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    sessionId: 1,
    userId: 1,
  };

  const routeDeps: ProxyRouteDeps = {
    detectFn: async () => "http",
    dnsCheckFn: async () => false,
    probeFn: async () => true,
    requireAuthFn: async () => authenticatedUser,
  };

  const unreachableDeps: ProxyRouteDeps = {
    detectFn: async () => "http",
    dnsCheckFn: async () => false,
    probeFn: async () => false,
    requireAuthFn: async () => authenticatedUser,
  };

  beforeEach(() => {
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY =
      "proxy-settings-test-encryption-key-0123456789abcdef";
  });

  afterEach(() => {
    if (originalProxyEncryptionKey === undefined) {
      delete process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY;
      return;
    }

    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY = originalProxyEncryptionKey;
  });

  function mockDb(
    proxyUrlOrOptions:
      | null
      | string
      | {
          proxyPassword?: null | string;
          proxyUrl?: null | string;
          proxyUsername?: null | string;
        } = null,
  ) {
    const options =
      typeof proxyUrlOrOptions === "object" && proxyUrlOrOptions !== null
        ? proxyUrlOrOptions
        : { proxyUrl: proxyUrlOrOptions };
    let storedProxyPassword = options.proxyPassword ?? null;
    let storedProxyUrl = options.proxyUrl ?? null;
    let storedAllowInsecureTls = false;
    let storedProxyUsername = options.proxyUsername ?? null;
    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    allowInsecureTls: storedAllowInsecureTls,
                    proxyPassword: storedProxyPassword,
                    proxyUrl: storedProxyUrl,
                    proxyUsername: storedProxyUsername,
                  },
                ]),
            }),
          }),
        }),
        update: () => ({
          set: (values: {
            allowInsecureTls?: boolean;
            proxyPassword?: null | string;
            proxyUrl?: null | string;
            proxyUsername?: null | string;
          }) => {
            if (values.proxyUrl !== undefined) storedProxyUrl = values.proxyUrl;
            if (values.allowInsecureTls !== undefined)
              storedAllowInsecureTls = values.allowInsecureTls;
            if (values.proxyPassword !== undefined)
              storedProxyPassword = values.proxyPassword;
            if (values.proxyUsername !== undefined)
              storedProxyUsername = values.proxyUsername;
            return {
              where: () => ({
                returning: () =>
                  Promise.resolve([
                    {
                      allowInsecureTls: storedAllowInsecureTls,
                      proxyPassword: storedProxyPassword,
                      proxyUsername: storedProxyUsername,
                    },
                  ]),
              }),
            };
          },
        }),
      }),
    }));
    mock.module("@/lib/logger", () => ({
      logger: { debug: mock(), error: mock(), info: mock(), warn: mock() },
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

  test("GET strips embedded proxy credentials from the returned URL", async () => {
    const legacyEmbeddedProxyUrl = `http://${"legacy-user"}:${"legacy-pass"}@proxy:8080`;

    mockDb({
      proxyPassword: null,
      proxyUrl: legacyEmbeddedProxyUrl,
      proxyUsername: null,
    });
    const { GET } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy");
    const res = await GET(req, routeDeps);
    const body = await res.json();

    expect(body.configured).toBe(true);
    expect(body.hasProxyPassword).toBe(true);
    expect(body.proxyUrl).toBe("http://proxy:8080");
    expect(body.proxyUsername).toBe("legacy-user");
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
      body: JSON.stringify({ proxyUrl: "http://proxy:8080" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      body: JSON.stringify({ proxyUrl: "socks5://proxy:1080" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.proxyUrl).toBe("socks5://proxy:1080");
    expect(body.status).toBe("reachable");
  });

  test("PUT migrates embedded proxy credentials into dedicated fields", async () => {
    const legacyEmbeddedProxyUrl = `http://${"legacy-user"}:${"legacy-pass"}@proxy:8080`;

    mockDb(null);
    const { GET, PUT } = await import("@/app/api/settings/proxy/route");
    const putRequest = new NextRequest("http://localhost/api/settings/proxy", {
      body: JSON.stringify({
        proxyUrl: legacyEmbeddedProxyUrl,
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });

    const putResponse = await PUT(putRequest, routeDeps);
    const putBody = await putResponse.json();
    expect(putBody.configured).toBe(true);
    expect(putBody.hasProxyPassword).toBe(true);
    expect(putBody.proxyUrl).toBe("http://proxy:8080");
    expect(putBody.proxyUsername).toBe("legacy-user");

    const getResponse = await GET(
      new NextRequest("http://localhost/api/settings/proxy"),
      routeDeps,
    );
    const getBody = await getResponse.json();
    expect(getBody.proxyUrl).toBe("http://proxy:8080");
    expect(getBody.proxyUsername).toBe("legacy-user");
    expect(getBody.hasProxyPassword).toBe(true);
  });

  test("PUT returns 200 with error for invalid protocol", async () => {
    mockDb(null);
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      body: JSON.stringify({ proxyUrl: "ftp://proxy:21" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      body: JSON.stringify({ proxyUrl: "not-a-url" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      body: JSON.stringify({ proxyUrl: longUrl }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      body: JSON.stringify({ proxyUrl: "176.105.212.219:8080" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      detectFn: async () => "socks5",
      dnsCheckFn: async () => false,
      probeFn: async () => true,
      requireAuthFn: async () => authenticatedUser,
    };
    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      body: JSON.stringify({ proxyUrl: "184.178.172.3:4145" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      body: JSON.stringify({ proxyUrl: "http://proxy:8080" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      body: JSON.stringify({ proxyUrl: "null" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      body: JSON.stringify({ proxyUrl: "undefined" }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      body: JSON.stringify({ proxyUrl: null }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      body: JSON.stringify({ proxyUrl: "  http://proxy:8080  " }),
      headers: { "content-type": "application/json" },
      method: "PUT",
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
      body: JSON.stringify({ proxyUrl }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    const res = await PUT(req, routeDeps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.proxyUrl).toBeNull();
    expect(body.error).toBeDefined();
  });

  test("PUT encrypts proxy passwords before storage", async () => {
    let storedProxyPassword: null | string = null;

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
          set: (values: { proxyPassword?: null | string }) => {
            storedProxyPassword = values.proxyPassword ?? null;
            return {
              where: () => ({
                returning: () =>
                  Promise.resolve([
                    {
                      allowInsecureTls: false,
                      proxyPassword: storedProxyPassword,
                      proxyUsername: null,
                    },
                  ]),
              }),
            };
          },
        }),
      }),
    }));
    mock.module("@/lib/logger", () => ({
      logger: { debug: mock(), error: mock(), info: mock(), warn: mock() },
    }));

    const { PUT } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy", {
      body: JSON.stringify({
        proxyPassword: "super-secret-pass",
        proxyUrl: "http://proxy:8080",
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    const res = await PUT(req, routeDeps);

    expect(res.status).toBe(200);
    expect(storedProxyPassword).not.toBeNull();
    expect(storedProxyPassword).not.toBe("super-secret-pass");
    const persistedProxyPassword = String(storedProxyPassword);
    expect(persistedProxyPassword.startsWith("enc-v1:")).toBe(true);
  });

  test("GET upgrades a plaintext saved proxy password after reading it", async () => {
    let storedProxyPassword: null | string = "legacy-plaintext-pass";

    mock.module("@/lib/db/db", () => ({
      getDb: () => ({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    allowInsecureTls: false,
                    proxyPassword: storedProxyPassword,
                    proxyUrl: "http://proxy:8080",
                    proxyUsername: "alice",
                  },
                ]),
            }),
          }),
        }),
        update: () => ({
          set: (values: { proxyPassword?: null | string }) => {
            storedProxyPassword = values.proxyPassword ?? null;
            return {
              where: () => ({ returning: () => Promise.resolve([]) }),
            };
          },
        }),
      }),
    }));
    mock.module("@/lib/logger", () => ({
      logger: { debug: mock(), error: mock(), info: mock(), warn: mock() },
    }));

    const { GET } = await import("@/app/api/settings/proxy/route");
    const req = new NextRequest("http://localhost/api/settings/proxy");
    const res = await GET(req, routeDeps);

    expect(res.status).toBe(200);
    expect(storedProxyPassword).not.toBe("legacy-plaintext-pass");
    const rewrittenProxyPassword = String(storedProxyPassword);
    expect(rewrittenProxyPassword.startsWith("enc-v1:")).toBe(true);
  });
});

// ── Client Service Methods ──────────────────────────────────────────────────

describe("ArticleService proxy methods", () => {
  const mockAxios: any = {
    delete: mock(async () => ({ data: {} })),
    get: mock(async () => ({ data: {} })),
    patch: mock(async () => ({ data: {} })),
    post: mock(async () => ({ data: {} })),
    put: mock(async () => ({ data: {} })),
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
      data: "<html>ok</html>",
      headers: {},
      status: 200,
    }));

    const html = await fetchHtml(
      "https://example.com/a",
      {
        axiosGetFn: axiosGetFn as any,
        isAllowedFeedUrlFn: async () => true,
      },
      { proxyUrl: "http://proxy:8080", useProxy: false },
    );

    expect(html).toBe("<html>ok</html>");
    // With injected axiosGetFn, proxy is always bypassed (test path)
    expect(axiosGetFn).toHaveBeenCalledTimes(1);
  });

  test("returns HTML normally when useProxy true with injected deps", async () => {
    const axiosGetFn = mock(async () => ({
      data: "<html>proxied</html>",
      headers: {},
      status: 200,
    }));

    const html = await fetchHtml(
      "https://example.com/a",
      {
        axiosGetFn: axiosGetFn as any,
        isAllowedFeedUrlFn: async () => true,
      },
      { proxyUrl: "http://proxy:8080", useProxy: true },
    );

    expect(html).toBe("<html>proxied</html>");
    expect(axiosGetFn).toHaveBeenCalledTimes(1);
  });

  test("proxy option does not interfere with URL validation", async () => {
    await expect(
      fetchHtml(
        "https://blocked.example.com/a",
        { isAllowedFeedUrlFn: async () => false },
        { proxyUrl: "http://proxy:8080", useProxy: true },
      ),
    ).rejects.toThrow("Blocked URL");
  });
});

// ── Direct SSRF Guard Function Tests ───────────────────────────────────────

describe("proxy SSRF guard functions (direct)", () => {
  function mockLogger() {
    mock.module("@/lib/logger", () => ({
      logger: { debug: mock(), error: mock(), info: mock(), warn: mock() },
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
      body: JSON.stringify({
        proxyUrl: "http://external-proxy.example.com:8080",
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    const res = await PUT(req, {
      detectFn: async () => "http",
      dnsCheckFn: async () => true, // simulate DNS → blocked address
      probeFn: async () => true,
      requireAuthFn: async () => ({
        email: "test@example.com",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        sessionId: 1,
        userId: 1,
      }),
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

  test("normalizeProxyUrl strips embedded credentials from explicit URLs", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    const embeddedProxyUrl = `http://${"alice"}:${"secret"}@proxy.example.com:8080`;
    const result = await normalizeProxyUrl(
      embeddedProxyUrl,
      async () => "http",
      async () => false,
    );
    expect(result).toBe("http://proxy.example.com:8080");
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

  test("parseHostPort canonicalizes socks:// to include the default port", async () => {
    mockLogger();
    const { normalizeProxyUrl } = await import("@/lib/server");
    const result = await normalizeProxyUrl(
      "socks5://proxy.example.com",
      async () => "http", // not called for explicit socks
      async () => false,
    );
    expect(result).toBe("socks5://proxy.example.com:1080");
  });

  test("probeProxy handles parseHostPort failure gracefully", async () => {
    mockLogger();
    const { probeProxy } = await import("@/lib/server");
    // Invalid URL that can't be parsed
    const result = await probeProxy("not::valid");
    expect(result).toBe(false);
  });
});

// ── server/proxy – normalizeProxyUrl (injectable probeFn + dnsCheckFn) ───────

describe("server/proxy – normalizeProxyUrl", () => {
  const neverCalled = async () => false as boolean;
  const dnsAllow = async () => false; // not blocked
  const dnsBlock = async () => true; // blocked
  const probeHttp = async () => "http" as const;
  const probeSocks = async () => "socks5" as const;

  test("returns null for unparseable URL", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    expect(
      await normalizeProxyUrl(":::invalid:::", probeHttp, dnsAllow),
    ).toBeNull();
  });

  test("returns null for unsupported protocol (ftp)", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    expect(
      await normalizeProxyUrl("ftp://proxy.example.com/", probeHttp, dnsAllow),
    ).toBeNull();
  });

  test("SOCKS: returns null when hostname is blocked (127.0.0.1)", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    expect(
      await normalizeProxyUrl(
        "socks5://127.0.0.1:1080",
        probeHttp,
        neverCalled,
      ),
    ).toBeNull();
  });

  test("SOCKS: returns null when DNS resolves to blocked address", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    expect(
      await normalizeProxyUrl(
        "socks5://external.example.com:1080",
        probeHttp,
        dnsBlock,
      ),
    ).toBeNull();
  });

  test("SOCKS: returns normalised socks URL when allowed", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "socks5://external.example.com:1080",
      probeHttp,
      dnsAllow,
    );
    expect(result).toContain("socks5");
    expect(result).toContain("external.example.com");
  });

  test("SOCKS: canonicalizes missing explicit ports to 1080", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    expect(
      await normalizeProxyUrl(
        "socks5://external.example.com",
        probeHttp,
        dnsAllow,
      ),
    ).toBe("socks5://external.example.com:1080");
  });

  test("SOCKS: accepts public IPv6 literals and passes unbracketed host to DNS checks", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "socks5://[2606:4700:4700::1111]:1080",
      async () => {
        throw new Error("explicit SOCKS URLs should skip protocol detection");
      },
      async (host) => {
        expect(host).toBe("2606:4700:4700::1111");
        return false;
      },
    );
    expect(result).toBe("socks5://[2606:4700:4700::1111]:1080");
  });

  test("HTTP: returns null when hostname is blocked (localhost)", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    expect(
      await normalizeProxyUrl("http://localhost:8080", probeHttp, dnsAllow),
    ).toBeNull();
  });

  test("HTTP: returns null when DNS resolves to blocked address", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    expect(
      await normalizeProxyUrl(
        "http://external.example.com:8080",
        probeHttp,
        dnsBlock,
      ),
    ).toBeNull();
  });

  test("HTTP: probe says 'http' → returns the http URL", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "http://external.example.com:8080",
      probeHttp,
      dnsAllow,
    );
    expect(result).not.toBeNull();
    expect(result).toContain("external.example.com");
  });

  test("HTTP: accepts public IPv6 literals and probes with an unbracketed host", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "http://[2606:4700:4700::1111]:8080",
      async (host, port) => {
        expect(host).toBe("2606:4700:4700::1111");
        expect(port).toBe(8080);
        return "http";
      },
      async (host) => {
        expect(host).toBe("2606:4700:4700::1111");
        return false;
      },
    );
    expect(result).toBe("http://[2606:4700:4700::1111]:8080");
  });

  test("HTTP: probe says 'socks5' → returns socks5:// URL", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "http://external.example.com:8080",
      probeSocks,
      dnsAllow,
    );
    expect(result).toMatch(/^socks5:\/\//);
  });

  test("bare host:port is accepted and prefixed with http://", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "external.example.com:8080",
      probeHttp,
      dnsAllow,
    );
    expect(result).toContain("external.example.com");
  });

  test("bare host:port with out-of-range port returns null", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    // Port 65536 is above the valid TCP max; normalizeProxyUrl should reject it.
    const result = await normalizeProxyUrl(
      "external.example.com:65536",
      probeHttp,
      dnsAllow,
    );
    expect(result).toBeNull();
  });
});

// ── server/proxy – probeProxy SSRF early exits ────────────────────────────────

describe("server/proxy – probeProxy SSRF early exits", () => {
  test("returns false for an unparseable URL", async () => {
    const { probeProxy } = await import("@/lib/server/proxy");
    const result = await probeProxy(":::invalid");
    expect(result).toBe(false);
  });

  test("returns false for a blocked hostname (localhost)", async () => {
    const { probeProxy } = await import("@/lib/server/proxy");
    const result = await probeProxy("http://localhost:8080");
    expect(result).toBe(false);
  });
});

// ── server/proxy – detectProxyProtocol SSRF early exit ───────────────────────

describe("server/proxy – detectProxyProtocol SSRF guard", () => {
  test("returns 'http' immediately for a blocked host (127.0.0.1)", async () => {
    const { detectProxyProtocol } = await import("@/lib/server/proxy");
    const result = await detectProxyProtocol("127.0.0.1", 1080);
    expect(result).toBe("http");
  });
});

// ── lib/server/proxy – detectProxyProtocol and probeProxy error paths ─────────

describe("lib/server/proxy – detectProxyProtocol error path via unreachable host", () => {
  test("returns 'http' for external hostname when DNS fails (NXDOMAIN)", async () => {
    const { detectProxyProtocol } = await import("@/lib/server/proxy");
    // Use a domain guaranteed not to resolve. DNS NXDOMAIN → socket error → "http"
    const result = await detectProxyProtocol(
      "no-such-host-detect.external.invalid",
      1080,
    );
    expect(result).toBe("http");
  });
});

describe("lib/server/proxy – probeProxy error path via unreachable host", () => {
  test("returns false for external hostname that refuses connection", async () => {
    const { probeProxy } = await import("@/lib/server/proxy");
    // DNS NXDOMAIN → socket error → returns false (covered but not blocked by SSRF)
    const result = await probeProxy(
      "http://no-such-host-probe.external.invalid:9999",
    );
    expect(result).toBe(false);
  });
});

// ── lib/server/proxy – normalizeProxyUrl additional branches ─────────────────

describe("lib/server/proxy – normalizeProxyUrl additional branches", () => {
  test("returns null for bare unparseable string (many colons)", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "not::a::valid::url",
      async () => "http",
      async () => false,
    );
    expect(result).toBeNull();
  });

  test("returns null for unsupported protocol (ftp://)", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "ftp://proxy.example.com:21",
      async () => "http",
      async () => false,
    );
    expect(result).toBeNull();
  });

  test("returns socks5 URL when probe returns socks5 for bare host:port", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "proxy.example.com:9050",
      async () => "socks5",
      async () => false,
    );
    expect(result).toBe("socks5://proxy.example.com:9050");
  });

  test("returns null for https:// with DNS-blocked host (injected dnsCheck)", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "https://proxy.example.com:443",
      async () => "http",
      async () => true, // DNS check returns blocked
    );
    expect(result).toBeNull();
  });

  test("accepts https:// proxy when checks pass and probe returns http", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "https://proxy.example.com:443",
      async () => "http",
      async () => false,
    );
    expect(result).toBe("https://proxy.example.com");
  });

  test("returns null for socks5:// with DNS-blocked host (injected dnsCheck)", async () => {
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "socks5://proxy.example.com:1080",
      async () => "http",
      async () => true, // DNS rebinding blocked
    );
    expect(result).toBeNull();
  });
});

// ── lib/server/proxy.ts – normalizeProxyUrl SOCKS + DNS check branches ──────

describe("proxy normalizeProxyUrl – SOCKS URL branches", () => {
  test("returns explicit SOCKS URL when DNS check passes", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
    }));
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "socks5://proxy.example.com:1080",
      async () => "http",
      async () => false, // DNS check passes
    );
    expect(result).toBe("socks5://proxy.example.com:1080");
  });

  test("rejects SOCKS URL when DNS check finds blocked address", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
    }));
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "socks5://proxy.example.com:1080",
      async () => "http",
      async () => true, // DNS resolves to blocked
    );
    expect(result).toBeNull();
  });

  test("rejects invalid protocol", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
    }));
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "ftp://proxy.example.com:21",
      async () => "http",
      async () => false,
    );
    expect(result).toBeNull();
  });

  test("rejects unparseable URL", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
    }));
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "://broken",
      async () => "http",
      async () => false,
    );
    expect(result).toBeNull();
  });

  test("normalizes bare host:port to socks5 when detected", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
    }));
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "proxy.example.com:1080",
      async () => "socks5",
      async () => false,
    );
    expect(result).toBe("socks5://proxy.example.com:1080");
  });

  test("normalizes bare host:port to http when detected as http", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
    }));
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "proxy.example.com:8080",
      async () => "http",
      async () => false,
    );
    expect(result).toBe("http://proxy.example.com:8080");
  });

  test("rejects http URL when DNS resolves to blocked", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
    }));
    const { normalizeProxyUrl } = await import("@/lib/server/proxy");
    const result = await normalizeProxyUrl(
      "http://proxy.example.com:8080",
      async () => "http",
      async () => true, // blocked
    );
    expect(result).toBeNull();
  });
});

// ── lib/server/proxy.ts – probeProxy branches ───────────────────────────────

describe("probeProxy – branch coverage", () => {
  test("returns false for unparseable URL", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
    }));
    const { probeProxy } = await import("@/lib/server/proxy");
    expect(await probeProxy("://bad-url")).toBe(false);
  });

  test("returns false for DNS-blocked hostname", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
    }));
    const { probeProxy } = await import("@/lib/server/proxy");
    // Use a non-blocked static hostname so the DNS check is reached
    expect(
      await probeProxy(
        "http://external-proxy.example.com:8080",
        async () => true,
      ),
    ).toBe(false);
  });
});

// ── lib/server/proxy – probeProxy SOCKS5 with credentials → error on connect ──

describe("lib/server/proxy – probeProxy SOCKS5 credential path (socket error)", () => {
  test("returns false for socks5 URL with credentials to unreachable host", async () => {
    const { probeProxy } = await import("@/lib/server/proxy");
    // External unreachable hosts always fail with socket error → covers
    // socks5AuthProbe socket.on('error') path (lines 77-79).
    const result = await probeProxy(
      "socks5://user:pass@no-such-socks-host-xyz.invalid:1080",
    );
    expect(result).toBe(false);
  });

  test("probeProxy returns false for SOCKS5 URL to blocked private IP (SSRF guard)", async () => {
    const { probeProxy } = await import("@/lib/server/proxy");
    // 10.0.0.1 is private — SSRF guard returns false immediately
    const result = await probeProxy("socks5://user:pass@10.0.0.1:1080");
    expect(result).toBe(false);
  });
});
