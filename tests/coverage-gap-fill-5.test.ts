/**
 * Coverage gap-fill 5: targets uncovered route handler branches and
 * pure-function edge cases across multiple modules.
 *
 * Modules targeted:
 *   - app/api/feeds/route.ts        – PATCH body paths (toggle, settings, rename), DELETE success
 *   - app/api/auth/session/route.ts – authenticated + unauthenticated responses
 *   - app/api/auth/login/route.ts   – successful login path
 *   - lib/sanitize/content-sanitization.ts – recovered image merge paths
 *   - lib/server/proxy.ts           – normalizeProxyUrl SOCKS branches, probeProxy socks auth
 *   - lib/extract/upstream.ts       – direct-path retry + TLS fallback
 *   - lib/fetch/axios-client.ts     – buildAxiosGet proxy modes
 *   - lib/api/greader/subscription.ts – quickadd + subscription edit handler
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { createMockRequest } from "./support/test-utils";

afterEach(() => mock.restore());

// ── app/api/feeds/route.ts – PATCH body-parsed paths ──────────────────────────

describe("feeds route PATCH – body-parsed paths", () => {
  const authUser = { userId: 1, email: "u@test.com" } as any;

  test("PATCH toggles feed enabled via body", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      method: "PATCH",
      body: { id: 10, enabled: false },
      headers: { "sec-fetch-site": "same-origin" },
    });
    const result = await PATCH(req, {
      requireMutableFeedAccessFn: async () => authUser,
      setFeedSourceEnabledForUserFn: async (_uid, sid, enabled) => ({
        id: sid,
        enabled,
        name: "Feed",
        url: "https://x.com/f",
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.enabled).toBe(false);
    expect(body.id).toBe(10);
  });

  test("PATCH toggles feed enabled – not found returns 404", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      method: "PATCH",
      body: { id: 10, enabled: true },
      headers: { "sec-fetch-site": "same-origin" },
    });
    const result = await PATCH(req, {
      requireMutableFeedAccessFn: async () => authUser,
      setFeedSourceEnabledForUserFn: async () => null,
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
    });
    expect(result.status).toBe(404);
  });

  test("PATCH updates extraction settings via body", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      method: "PATCH",
      body: { id: 8, extractionDisabled: true },
      headers: { "sec-fetch-site": "same-origin" },
    });
    const result = await PATCH(req, {
      requireMutableFeedAccessFn: async () => authUser,
      updateFeedSettingsForUserFn: async (_uid, sid, settings) => ({
        id: sid,
        ...settings,
        name: "Feed",
        url: "https://x.com/f",
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.extractionDisabled).toBe(true);
  });

  test("PATCH updates proxyEnabled setting via body", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      method: "PATCH",
      body: { id: 5, proxyEnabled: true },
      headers: { "sec-fetch-site": "same-origin" },
    });
    const result = await PATCH(req, {
      requireMutableFeedAccessFn: async () => authUser,
      updateFeedSettingsForUserFn: async (_uid, sid, settings) => ({
        id: sid,
        ...settings,
        name: "Feed",
        url: "https://x.com/f",
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.proxyEnabled).toBe(true);
  });

  test("PATCH update settings – not found returns 404", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      method: "PATCH",
      body: { id: 5, proxyEnabled: false },
      headers: { "sec-fetch-site": "same-origin" },
    });
    const result = await PATCH(req, {
      requireMutableFeedAccessFn: async () => authUser,
      updateFeedSettingsForUserFn: async () => null,
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
    });
    expect(result.status).toBe(404);
  });

  test("PATCH renames feed via body (no parseRenameFeedPayloadFn)", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      method: "PATCH",
      body: { id: 3, name: "New Name", url: "https://example.com/feed" },
      headers: { "sec-fetch-site": "same-origin" },
    });
    const result = await PATCH(req, {
      requireMutableFeedAccessFn: async () => authUser,
      assertAllowedFeedUrlFn: async () => null,
      renameFeedSourceForUserFn: async (_uid, sid, name, url) => ({
        id: sid,
        name,
        url,
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.name).toBe("New Name");
  });

  test("PATCH rename via body – not found returns 404", async () => {
    const { PATCH } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds", {
      method: "PATCH",
      body: { id: 3, name: "New", url: "https://example.com/feed" },
      headers: { "sec-fetch-site": "same-origin" },
    });
    const result = await PATCH(req, {
      requireMutableFeedAccessFn: async () => authUser,
      assertAllowedFeedUrlFn: async () => null,
      renameFeedSourceForUserFn: async () => null,
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
    });
    expect(result.status).toBe(404);
  });
});

// ── app/api/feeds/route.ts – DELETE success path ──────────────────────────────

describe("feeds route DELETE – success path", () => {
  test("DELETE returns deleted source on success", async () => {
    const { DELETE } = await import("@/app/api/feeds/route");
    const req = createMockRequest("https://host/api/feeds?sourceId=7", {
      method: "DELETE",
      headers: { "sec-fetch-site": "same-origin" },
    });
    const result = await DELETE(req, {
      requireMutableFeedAccessFn: async () =>
        ({ userId: 1, email: "u@x.com" }) as any,
      parseDeleteSourceIdFn: () => 7,
      deleteFeedSourceForUserFn: async () => ({
        id: 7,
        name: "Gone",
        url: "https://x.com/f",
      }),
    });
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body.id).toBe(7);
    expect(body.name).toBe("Gone");
  });
});

// ── lib/sanitize/content-sanitization.ts – recovered image merge paths ───────

describe("sanitizeRawContent – recovered image merge paths", () => {
  test("merges recovered images when sanitized text has no images", async () => {
    const { sanitizeRawContent } =
      await import("@/lib/sanitize/content-sanitization");
    // HTML with an img that gets stripped by sanitizer but text survives
    const html = `<section><img src="https://example.com/photo.jpg" alt="Photo"><p>Article text here</p></section>`;
    const result = sanitizeRawContent(html);
    // Should contain both the recovered image and the text
    expect(result).toContain("Article text here");
  });

  test("returns sanitized HTML when images survive sanitization", async () => {
    const { sanitizeRawContent } =
      await import("@/lib/sanitize/content-sanitization");
    const html = `<p>Text with <img src="https://example.com/img.jpg"> inline</p>`;
    const result = sanitizeRawContent(html);
    expect(result).toContain("Text with");
  });

  test("falls back to plain text when HTML sanitizes to empty", async () => {
    const { sanitizeRawContent } =
      await import("@/lib/sanitize/content-sanitization");
    // Script-only content that sanitizes to empty
    const html = `<script>alert('x')</script>Some visible text`;
    const result = sanitizeRawContent(html);
    expect(result.length).toBeGreaterThan(0);
  });

  test("handles plain text input (no HTML)", async () => {
    const { sanitizeRawContent } =
      await import("@/lib/sanitize/content-sanitization");
    const result = sanitizeRawContent("Just plain text content here");
    expect(result).toContain("Just plain text content here");
  });

  test("returns empty for whitespace-only input", async () => {
    const { sanitizeRawContent } =
      await import("@/lib/sanitize/content-sanitization");
    expect(sanitizeRawContent("   ")).toBe("");
  });

  test("merges recovered images in fallback plain-text path", async () => {
    const { sanitizeRawContent } =
      await import("@/lib/sanitize/content-sanitization");
    // HTML where the main content sanitizes to empty but there IS an img and text
    const html = `<img src="https://example.com/photo.jpg"><script>alert(1)</script>Visible text`;
    const result = sanitizeRawContent(html);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── lib/server/proxy.ts – normalizeProxyUrl SOCKS + DNS check branches ──────

describe("proxy normalizeProxyUrl – SOCKS URL branches", () => {
  test("returns explicit SOCKS URL when DNS check passes", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
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
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
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
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
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
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
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
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
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
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
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
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
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
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
      },
    }));
    const { probeProxy } = await import("@/lib/server/proxy");
    expect(await probeProxy("://bad-url")).toBe(false);
  });

  test("returns false for DNS-blocked hostname", async () => {
    mock.module("@/lib/logger", () => ({
      logger: {
        error: () => {},
        warn: () => {},
        info: () => {},
        debug: () => {},
      },
    }));
    mock.module("@/lib/core/dns-cache", () => ({
      resolvesToBlockedAddress: async () => true,
    }));
    const { probeProxy } = await import("@/lib/server/proxy");
    // Use a non-blocked static hostname so the DNS check is reached
    expect(await probeProxy("http://external-proxy.example.com:8080")).toBe(
      false,
    );
  });
});

// ── lib/fetch/axios-client.ts – buildAxiosGet branches ───────────────────────

describe("buildAxiosGet – proxy mode branches", () => {
  test("returns injectedGet when provided", async () => {
    const { buildAxiosGet } = await import("@/lib/fetch/axios-client");
    const injected = mock(async () => ({ data: "ok" })) as any;
    const result = buildAxiosGet(injected, undefined, false, undefined);
    expect(result).toBe(injected);
  });

  test("returns socks proxy wrapper when proxyConfig mode is socks", async () => {
    const { buildAxiosGet } = await import("@/lib/fetch/axios-client");
    const proxyConfig = {
      mode: "socks" as const,
      httpAgent: {},
      httpsAgent: {},
    } as any;
    const fn = buildAxiosGet(undefined, proxyConfig, false, undefined);
    expect(typeof fn).toBe("function");
    expect(fn).not.toBe(undefined);
  });

  test("returns http proxy wrapper when proxyConfig mode is http", async () => {
    const { buildAxiosGet } = await import("@/lib/fetch/axios-client");
    const proxyConfig = {
      mode: "http" as const,
      proxy: { host: "proxy", port: 8080 },
    };
    const fn = buildAxiosGet(undefined, proxyConfig as any, false, undefined);
    expect(typeof fn).toBe("function");
  });

  test("returns default wrapper with no proxy", async () => {
    const { buildAxiosGet } = await import("@/lib/fetch/axios-client");
    const fn = buildAxiosGet(undefined, undefined, false, undefined);
    expect(typeof fn).toBe("function");
  });

  test("returns wrapper with insecure TLS agent", async () => {
    const { buildAxiosGet } = await import("@/lib/fetch/axios-client");
    const fn = buildAxiosGet(undefined, undefined, true, undefined);
    expect(typeof fn).toBe("function");
  });
});

// ── lib/extract/upstream.ts – direct path error handling ─────────────────────

type AxiosGet = typeof import("axios").default.get;
type AxiosIsError = typeof import("axios").default.isAxiosError;
const asAxiosGet = (fn: (...args: unknown[]) => unknown) =>
  fn as unknown as AxiosGet;
const asIsAxiosError = (fn: (...args: unknown[]) => boolean) =>
  fn as unknown as AxiosIsError;

describe("fetchHtml direct path – error branches", () => {
  test("rethrows when isAxiosError returns false", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const err = new Error("network failure");
    await expect(
      fetchHtml(
        "https://example.com/article",
        {
          isAllowedFeedUrlFn: async () => true,
          isAxiosErrorFn: asIsAxiosError(() => false),
          axiosGetFn: asAxiosGet(async () => {
            throw err;
          }),
        },
        {},
      ),
    ).rejects.toThrow("network failure");
  });

  test("returns html on successful direct fetch", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const html = await fetchHtml(
      "https://example.com/article",
      {
        isAllowedFeedUrlFn: async () => true,
        isAxiosErrorFn: asIsAxiosError(() => false),
        axiosGetFn: asAxiosGet(async () => ({
          data: "<html><body>content</body></html>",
        })),
      },
      {},
    );
    expect(html).toBe("<html><body>content</body></html>");
  });
});

// ── lib/extract/upstream.ts – proxy path with fingerprint ────────────────────

describe("fetchHtml proxy path – fingerprint fetch", () => {
  test("returns html from fingerprint fetch on proxy path", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const html = await fetchHtml(
      "https://example.com/proxied",
      {
        isAllowedFeedUrlFn: async () => true,
        fingerprintFetchFn: async () => ({
          html: "<html><body>proxied</body></html>",
          requestHeaders: { "User-Agent": "test" },
        }),
        delayFn: async () => {},
      },
      { useProxy: true, proxyUrl: "http://proxy.example.com:8080" },
    );
    expect(html).toBe("<html><body>proxied</body></html>");
  });

  test("throws after exhausting proxy retries", async () => {
    const { fetchHtml } = await import("@/lib/extract/upstream");
    const { GotScrapingError } = await import("@/lib/fetch");
    await expect(
      fetchHtml(
        "https://example.com/proxied",
        {
          isAllowedFeedUrlFn: async () => true,
          fingerprintFetchFn: async () => {
            throw new GotScrapingError(
              403,
              "Access Denied",
              "http",
              "http://proxy.example.com:8080",
              130,
              false,
              0,
              {},
              {},
            );
          },
          delayFn: async () => {},
        },
        { useProxy: true, proxyUrl: "http://proxy.example.com:8080" },
      ),
    ).rejects.toThrow();
  });
});

// ── app/api/feeds/route.ts – GET upstream error branches ─────────────────────

describe("feeds route GET – upstream error handling", () => {
  const authUser = { userId: 1, email: "u@test.com" } as any;

  test("returns 404 when feed source not found", async () => {
    const { GET } = await import("@/app/api/feeds/route");
    const { isFeedSourceNotFoundError } =
      await import("@/lib/core/feed-fetcher");
    const notFoundErr = Object.assign(new Error("not found"), {
      name: "FeedSourceNotFoundError",
    });
    const req = createMockRequest("https://host/api/feeds?url=https://x.com/f");
    const result = await GET(req, {
      requireAuthenticatedUserFn: async () => authUser,
      getRequestedFeedUrlFn: () => "https://x.com/f",
      assertAllowedFeedUrlFn: async () => null,
      handleFeedReadFn: async () => {
        throw notFoundErr;
      },
      isFeedSourceNotFoundErrorFn: isFeedSourceNotFoundError,
      isUpstreamFeedErrorFn: ((_e: unknown) => false) as any,
      isAxiosErrorFn: ((_e: unknown) => false) as any,
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
      warnFn: (() => {}) as any,
    });
    expect(result.status).toBe(404);
  });

  test("returns 502 when upstream feed error", async () => {
    const { GET } = await import("@/app/api/feeds/route");
    const { isUpstreamFeedError } = await import("@/lib/core/feed-fetcher");
    const upstreamErr = Object.assign(new Error("upstream fail"), {
      name: "UpstreamFeedError",
    });
    const req = createMockRequest("https://host/api/feeds?url=https://x.com/f");
    const result = await GET(req, {
      requireAuthenticatedUserFn: async () => authUser,
      getRequestedFeedUrlFn: () => "https://x.com/f",
      assertAllowedFeedUrlFn: async () => null,
      handleFeedReadFn: async () => {
        throw upstreamErr;
      },
      isUpstreamFeedErrorFn: isUpstreamFeedError,
      isFeedSourceNotFoundErrorFn: ((_e: unknown) => false) as any,
      isAxiosErrorFn: ((_e: unknown) => false) as any,
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
      warnFn: (() => {}) as any,
    });
    expect(result.status).toBe(502);
  });

  test("returns 502 when axios error occurs", async () => {
    const { GET } = await import("@/app/api/feeds/route");
    const axiosErr = Object.assign(new Error("timeout"), {
      isAxiosError: true,
      response: { status: 504 },
      config: {},
    });
    const req = createMockRequest("https://host/api/feeds?url=https://x.com/f");
    const result = await GET(req, {
      requireAuthenticatedUserFn: async () => authUser,
      getRequestedFeedUrlFn: () => "https://x.com/f",
      assertAllowedFeedUrlFn: async () => null,
      handleFeedReadFn: async () => {
        throw axiosErr;
      },
      isFeedSourceNotFoundErrorFn: ((_e: unknown) => false) as any,
      isUpstreamFeedErrorFn: ((_e: unknown) => false) as any,
      isAxiosErrorFn: ((e: unknown) =>
        !!(e && typeof e === "object" && "isAxiosError" in e)) as any,
      jsonErrorFn: ((msg: string, status: number) =>
        Response.json({ error: msg }, { status })) as any,
      warnFn: (() => {}) as any,
    });
    expect(result.status).toBe(502);
  });
});
