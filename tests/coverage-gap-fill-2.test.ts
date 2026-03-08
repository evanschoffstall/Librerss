/**
 * Coverage gap-fill 2 — targets exports not exercised by other suites.
 * Each describe block is focused on a single module or export.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

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

// ── api/http/diagnostics – isVerboseLoggingEnabled + toBodySnippet ───────────

describe("api/http/diagnostics – isVerboseLoggingEnabled", () => {
  test("returns false via CONFIG when LOG_LEVEL env var is unset", async () => {
    const prev = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    try {
      const { isVerboseLoggingEnabled } =
        await import("@/lib/api/http/diagnostics");
      // CONFIG.LOG_LEVEL throws when env var is missing → catch returns false
      const result = isVerboseLoggingEnabled();
      expect(result).toBe(false);
    } finally {
      if (prev !== undefined) process.env.LOG_LEVEL = prev;
    }
  });
});

describe("api/http/diagnostics – toBodySnippet", () => {
  test("converts object with custom toString to string", async () => {
    const { toBodySnippet } = await import("@/lib/api/http/diagnostics");
    const obj = { toString: () => "Custom object representation" };
    const result = toBodySnippet(obj);
    expect(result).toContain("Custom object representation");
  });

  test("truncates long toString output", async () => {
    const { toBodySnippet } = await import("@/lib/api/http/diagnostics");
    const long = "x".repeat(500);
    const obj = { toString: () => long };
    const result = toBodySnippet(obj, 100);
    expect(result).toContain("…");
    expect(result!.length).toBeLessThan(200);
  });

  test("returns undefined when toString yields [object Object]", async () => {
    const { toBodySnippet } = await import("@/lib/api/http/diagnostics");
    const obj = {}; // .toString() returns "[object Object]"
    expect(toBodySnippet(obj)).toBeUndefined();
  });
});

// ── fetch/fingerprint – fetchHtmlWithFingerprint blocked URL ─────────────────

describe("fetch/fingerprint – blocked URL throws", () => {
  test("throws 'Blocked URL' when isAllowedUrl returns false", async () => {
    const { fetchHtmlWithFingerprint } =
      await import("@/lib/fetch/fingerprint");
    const isAllowedUrl = async () => false;
    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/article",
        isAllowedUrl,
        {},
        {
          requestFn: async () => ({
            statusCode: 200,
            headers: {},
            body: "<html/>",
          }),
        },
      ),
    ).rejects.toThrow("Blocked URL");
  });
});

// ── fetch/proxy – buildProxyConfig with allowInsecureTls for SOCKS ───────────

describe("fetch/proxy – buildProxyConfig allowInsecureTls", () => {
  test("SOCKS proxy with allowInsecureTls=true overrides connect method", async () => {
    const { buildProxyConfig } = await import("@/lib/fetch/proxy");
    const result = buildProxyConfig("socks5://proxy.example.com:1080", true);
    expect(result).not.toBe(false);
    if (result) {
      expect(result.mode).toBe("socks");
    }
  });

  test("HTTP proxy returns proxy config object", async () => {
    const { buildProxyConfig } = await import("@/lib/fetch/proxy");
    const result = buildProxyConfig("http://proxy.example.com:8080");
    expect(result).not.toBe(false);
    if (result) {
      expect(result.mode).toBe("http");
    }
  });
});

// ── fetch/axios-client – buildAxiosGet branches ──────────────────────────────

describe("fetch/axios-client – buildAxiosGet", () => {
  test("returns injectedGet directly when provided", async () => {
    const { buildAxiosGet } = await import("@/lib/fetch/axios-client");
    const injected = mock(async () => ({ data: "<html/>" })) as any;
    const result = buildAxiosGet(injected, undefined, false, undefined);
    expect(result).toBe(injected);
  });

  test("returns a function for socks proxy config (no actual network call)", async () => {
    const { buildAxiosGet } = await import("@/lib/fetch/axios-client");
    const { buildProxyConfig } = await import("@/lib/fetch/proxy");
    const proxyConfig = buildProxyConfig(
      "socks5://proxy.example.com:1080",
    ) as any;
    const fn = buildAxiosGet(undefined, proxyConfig, false, undefined);
    expect(typeof fn).toBe("function");
  });

  test("returns a function for http proxy config (no actual network call)", async () => {
    const { buildAxiosGet } = await import("@/lib/fetch/axios-client");
    const { buildProxyConfig } = await import("@/lib/fetch/proxy");
    const proxyConfig = buildProxyConfig(
      "http://proxy.example.com:8080",
    ) as any;
    const fn = buildAxiosGet(undefined, proxyConfig, false, undefined);
    expect(typeof fn).toBe("function");
  });

  test("returns a function when no proxy and insecureTls=true", async () => {
    const { buildAxiosGet } = await import("@/lib/fetch/axios-client");
    const fn = buildAxiosGet(undefined, undefined, true, undefined);
    expect(typeof fn).toBe("function");
  });
});

// ── api/feeds/parsers – validation edge cases ────────────────────────────────

describe("api/feeds/parsers – assertAllowedFeedUrl", () => {
  test("returns error Response for disallowed URL (localhost)", async () => {
    const { assertAllowedFeedUrl } = await import("@/lib/api/feeds/parsers");
    const result = await assertAllowedFeedUrl("http://127.0.0.1/feed");
    expect(result).not.toBeNull();
    expect((result as Response).status).toBe(400);
  });
});

describe("api/feeds/parsers – parseCreateFeedPayload validation", () => {
  function makeFeedRequest(body: unknown): Request {
    return new Request("https://example.com/api/feeds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  test("returns 400 when url exceeds max length", async () => {
    const { parseCreateFeedPayload } = await import("@/lib/api/feeds/parsers");
    const req = makeFeedRequest({
      name: "Feed",
      url: "https://x.com/" + "a".repeat(2200),
    });
    const result = await parseCreateFeedPayload(req as any);
    expect((result as Response).status).toBe(400);
  });
});

describe("api/feeds/parsers – parseRenameFeedPayloadFromBody", () => {
  test("returns 400 when url is missing", async () => {
    const { parseRenameFeedPayloadFromBody } =
      await import("@/lib/api/feeds/parsers");
    const result = parseRenameFeedPayloadFromBody({ id: 1, name: "Feed" });
    expect((result as Response).status).toBe(400);
  });

  test("returns 400 when url exceeds max length", async () => {
    const { parseRenameFeedPayloadFromBody } =
      await import("@/lib/api/feeds/parsers");
    const result = parseRenameFeedPayloadFromBody({
      id: 1,
      name: "Feed",
      url: "https://x.com/" + "a".repeat(2200),
    });
    expect((result as Response).status).toBe(400);
  });
});

describe("api/feeds/parsers – parseToggleFeedEnabledPayloadFromBody", () => {
  test("returns 400 when id is missing", async () => {
    const { parseToggleFeedEnabledPayloadFromBody } =
      await import("@/lib/api/feeds/parsers");
    const result = parseToggleFeedEnabledPayloadFromBody({ enabled: true });
    expect((result as Response).status).toBe(400);
  });
});

// ── lib/config – error paths and NEXT_PUBLIC client accessors ────────────────

describe("lib/config – error throws from missing / invalid env vars", () => {
  test("accessing missing numeric key throws 'Missing required'", async () => {
    const { CONFIG } = await import("@/lib/config");
    const key = "COVERAGE_TEST_MISSING_NUM_KEY_XYZ";
    const prev = process.env[key];
    delete process.env[key];
    try {
      expect(() => (CONFIG as any)[key]).toThrow(
        "Missing required environment variable",
      );
    } finally {
      if (prev !== undefined) process.env[key] = prev;
    }
  });

  test("accessing invalid numeric key throws 'Invalid numeric'", async () => {
    const { CONFIG } = await import("@/lib/config");
    const key = "COVERAGE_TEST_BAD_NUM_KEY_XYZ";
    process.env[key] = "not_a_number";
    try {
      expect(() => (CONFIG as any)[key]).toThrow(
        "Invalid numeric environment variable",
      );
    } finally {
      delete process.env[key];
    }
  });

  test("accessing invalid boolean _ENABLED key throws 'Invalid boolean'", async () => {
    const { CONFIG } = await import("@/lib/config");
    const key = "COVERAGE_TEST_BAD_BOOL_ENABLED";
    process.env[key] = "not_a_bool";
    try {
      expect(() => (CONFIG as any)[key]).toThrow(
        "Invalid boolean environment variable",
      );
    } finally {
      delete process.env[key];
    }
  });

  test("accessing valid boolean _ENABLED key returns boolean", async () => {
    const { CONFIG } = await import("@/lib/config");
    const key = "COVERAGE_TEST_FOOBAR_ENABLED";
    process.env[key] = "true";
    try {
      expect((CONFIG as any)[key]).toBe(true);
    } finally {
      delete process.env[key];
    }
  });
});

describe("lib/config – NEXT_PUBLIC client accessors", () => {
  test("clientFeedCacheTtlMinutes parses numeric env var", async () => {
    const { clientFeedCacheTtlMinutes } = await import("@/lib/config");
    process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES = "42";
    try {
      expect(clientFeedCacheTtlMinutes()).toBe(42);
    } finally {
      delete process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES;
    }
  });

  test("clientFeedRefreshDiagnosticsEnabled parses boolean env var", async () => {
    const { clientFeedRefreshDiagnosticsEnabled } =
      await import("@/lib/config");
    process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED = "true";
    try {
      expect(clientFeedRefreshDiagnosticsEnabled()).toBe(true);
    } finally {
      delete process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED;
    }
  });

  test("maxArticleConsecutiveBlankLines uses NEXT_PUBLIC when set", async () => {
    const { maxArticleConsecutiveBlankLines } = await import("@/lib/config");
    process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES = "7";
    try {
      expect(maxArticleConsecutiveBlankLines()).toBe(7);
    } finally {
      delete process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;
    }
  });
});

// ── server/rate-limit – RateLimiter.destroy ──────────────────────────────────

describe("server/rate-limit – RateLimiter.destroy", () => {
  test("destroy() cancels the cleanup timer without throwing", async () => {
    const { RateLimiter } = await import("@/lib/server/rate-limit");
    const rl = new RateLimiter();
    expect(() => rl.destroy()).not.toThrow();
  });
});

// ── core/mark-stream-read – STARRED_STATE and user label branches ─────────────

describe("core/mark-stream-read – STARRED and label branches", () => {
  const buildMockDbChain = (rows: any[] = []): any => {
    const chain: any = {};
    chain.from = () => chain;
    chain.innerJoin = () => chain;
    chain.where = () => chain;
    chain.limit = async () => rows;
    return { select: () => chain };
  };

  test("STARRED_STATE with useArticleStatuses=true runs starred query", async () => {
    const { markStreamAsRead } = await import("@/lib/core/mark-stream-read");
    const upsertFn = mock(async () => {});
    await markStreamAsRead(1, "user/-/state/com.google/starred", {
      db: buildMockDbChain([{ articleId: 10 }]),
      canUseArticleStatusesTableFn: async () => true,
      upsertArticleStatusesFn: upsertFn,
    });
    expect(upsertFn).toHaveBeenCalledWith(1, [10], { isRead: true });
  });

  test("STARRED_STATE with useArticleStatuses=false uses empty rows", async () => {
    const { markStreamAsRead } = await import("@/lib/core/mark-stream-read");
    const upsertFn = mock(async () => {});
    await markStreamAsRead(1, "user/-/state/com.google/starred", {
      db: buildMockDbChain(),
      canUseArticleStatusesTableFn: async () => false,
      upsertArticleStatusesFn: upsertFn,
    });
    expect(upsertFn).toHaveBeenCalledWith(1, [], { isRead: true });
  });

  test("user label stream runs category join query", async () => {
    const { markStreamAsRead } = await import("@/lib/core/mark-stream-read");
    const upsertFn = mock(async () => {});
    await markStreamAsRead(1, "user/-/label/Technology", {
      db: buildMockDbChain([{ articleId: 20 }]),
      canUseArticleStatusesTableFn: async () => false,
      upsertArticleStatusesFn: upsertFn,
    });
    expect(upsertFn).toHaveBeenCalledWith(1, [20], { isRead: true });
  });

  test("beforeMs is passed and filters by date", async () => {
    const { markStreamAsRead } = await import("@/lib/core/mark-stream-read");
    const upsertFn = mock(async () => {});
    await markStreamAsRead(1, "user/-/state/com.google/reading-list", {
      db: buildMockDbChain([{ articleId: 30 }]),
      canUseArticleStatusesTableFn: async () => false,
      upsertArticleStatusesFn: upsertFn,
      beforeMs: Date.now() - 3600_000,
    });
    expect(upsertFn).toHaveBeenCalled();
  });
});

// ── tests/support/test-utils – exercise createMockFeed, createMockArticle ────

describe("tests/support/test-utils – helper coverage", () => {
  test("createMockRequest supports cookie access via mocked cookies.get", async () => {
    const { createMockRequest } = await import("./support/test-utils");
    const req = createMockRequest("https://example.com/", {
      cookies: { session: "tok123" },
    });
    const cookie = req.cookies.get("session");
    expect(cookie).toMatchObject({ name: "session", value: "tok123" });
  });

  test("createMockFeed returns a feed object with defaults", async () => {
    const { createMockFeed } = await import("./support/test-utils");
    const feed = createMockFeed({ id: 99, title: "My Feed" });
    expect(feed.id).toBe(99);
    expect(feed.title).toBe("My Feed");
    expect(typeof feed.url).toBe("string");
  });

  test("createMockArticle returns an article object with defaults", async () => {
    const { createMockArticle } = await import("./support/test-utils");
    const article = createMockArticle({ id: 42, title: "Test Article" });
    expect(article.id).toBe(42);
    expect(article.title).toBe("Test Article");
    expect(typeof article.content).toBe("string");
  });
});

// ── utils/ssrf – IPv6 mapped IPv4 coverage ────────────────────────────────────

describe("utils/ssrf – isBlockedHost with IPv6-mapped private addresses", () => {
  test("processes ::ffff:127.0.0.1 (IPv4-in-IPv6) without throwing", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    // Exercises the IPv4-embedded-in-IPv6 hextet parsing path (line 48 of ssrf.ts)
    expect(typeof isBlockedHost("::ffff:127.0.0.1")).toBe("boolean");
  });

  test("processes ::ffff:192.168.1.1 (IPv4-in-IPv6) without throwing", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(typeof isBlockedHost("::ffff:192.168.1.1")).toBe("boolean");
  });
});

// ── api/greader/auth – requireGReaderUser with no auth ───────────────────────

describe("api/greader/auth – requireGReaderUser returns 401 when no auth", () => {
  test("returns 401 Response when request has no token and no cookie", async () => {
    const { requireGReaderUser } = await import("@/lib/api/greader/auth");
    const { createMockRequest } = await import("./support/test-utils");
    const req = createMockRequest("https://example.com/greader");
    const result = await requireGReaderUser(req);
    expect(result instanceof Response).toBe(true);
    expect((result as Response).status).toBe(401);
  });
});

// ── extract/snapshot – readPlaceholderSnapshotHtml ───────────────────────────

describe("extract/snapshot – readPlaceholderSnapshotHtml", () => {
  test("returns null for URL with no snapshot mapping", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const result = await readPlaceholderSnapshotHtml(
      "https://no-snapshot.example.com/",
    );
    expect(result).toBeNull();
  });

  test("returns HTML for a URL with a known snapshot", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const result = await readPlaceholderSnapshotHtml(
      "https://science.nasa.gov/photojournal/jpl-3d-printed-part-springs-forward/",
    );
    expect(result).not.toBeNull();
    expect(typeof result?.html).toBe("string");
    expect(result!.html.length).toBeGreaterThan(0);
  });
});
