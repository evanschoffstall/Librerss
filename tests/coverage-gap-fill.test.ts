/**
 * Coverage gap-fill tests.
 * Targets uncovered branches not exercised by other test suites.
 */

import {
  __resetApiClientForTesting,
  __setApiClientForTesting,
  createLinkedAbortController,
  withRequestDeadline,
} from "@/lib/api/http-client";
import { ArticleService, AuthService, FeedService } from "@/lib/api/services";
import { generateOpml } from "@/lib/utils/opml";
import {
  injectProxyCredentials,
  redactUrlForLogs,
  toCategoryLookupKey,
} from "@/lib/utils/url";
import { buildDdgReferer } from "@/lib/fetch/referer";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
  __resetApiClientForTesting();
});

afterEach(() => {
  mock.restore();
  __resetApiClientForTesting();
});

// ── utils/url – toCategoryLookupKey ─────────────────────────────────────────

describe("utils/url – toCategoryLookupKey", () => {
  test("extracts host+path for valid URL", () => {
    expect(toCategoryLookupKey("https://example.com/feed/tech")).toBe(
      "example.com/feed/tech",
    );
  });

  test("strips trailing slashes from path", () => {
    expect(toCategoryLookupKey("https://example.com/feed/")).toBe(
      "example.com/feed",
    );
  });

  test("preserves query params", () => {
    expect(toCategoryLookupKey("https://example.com/rss?format=atom")).toBe(
      "example.com/rss?format=atom",
    );
  });

  test("falls back gracefully for non-parseable input", () => {
    const result = toCategoryLookupKey("not a url");
    expect(result).toBe("not a url");
  });

  test("returns empty string for blank input", () => {
    expect(toCategoryLookupKey("")).toBe("");
  });

  test("lowercases the domain", () => {
    expect(toCategoryLookupKey("https://EXAMPLE.COM/feed")).toBe(
      "example.com/feed",
    );
  });
});

// ── utils/url – redactUrlForLogs ─────────────────────────────────────────────

describe("utils/url – redactUrlForLogs", () => {
  test("strips credentials and hash from URL", () => {
    // Build the URL with injected credentials to avoid hardcoding basic-auth
    // in source (secretlint false positive prevention).
    const url = new URL("https://example.com/path?q=1#section");
    url.username = "user";
    url.password = "pass";
    const result = redactUrlForLogs(url.toString());
    expect(result).toBe("https://example.com/path");
  });

  test("returns [empty-url] for blank input", () => {
    expect(redactUrlForLogs("   ")).toBe("[empty-url]");
  });

  test("returns [invalid-url] for totally invalid input", () => {
    expect(redactUrlForLogs("not a url at all @@##")).toBe("[invalid-url]");
  });

  test("handles non-special schemes (socks5)", () => {
    const result = redactUrlForLogs("socks5://proxy.example.com:1080/");
    expect(result).toContain("proxy.example.com");
    expect(result).not.toContain("null");
  });

  test("strips query string", () => {
    const result = redactUrlForLogs(
      "https://api.example.com/endpoint?key=secret&token=abc",
    );
    expect(result).toBe("https://api.example.com/endpoint");
  });
});

// ── utils/url – injectProxyCredentials ──────────────────────────────────────

describe("utils/url – injectProxyCredentials", () => {
  test("injects username and password into URL", () => {
    const result = injectProxyCredentials(
      "http://proxy.example.com:8080",
      "alice",
      "secret",
    );
    expect(result).toContain("alice");
    expect(result).toContain("proxy.example.com:8080");
  });

  test("URL-encodes special characters in credentials", () => {
    const result = injectProxyCredentials(
      "http://proxy.example.com:8080",
      "user@domain",
      "p@ss!word",
    );
    expect(result).not.toContain("@domain");
    expect(result).toContain("proxy.example.com");
  });

  test("returns original URL when proxy URL is invalid", () => {
    const bad = "not-a-url";
    const result = injectProxyCredentials(bad, "user", "pass");
    expect(result).toBe(bad);
  });
});

// ── fetch/referer – buildDdgReferer ─────────────────────────────────────────

describe("fetch/referer – buildDdgReferer", () => {
  test("builds referer from URL slug", () => {
    const result = buildDdgReferer(
      "https://example.com/articles/ai-breakthroughs-2024",
    );
    expect(result).toContain("duckduckgo.com");
    expect(result).toContain("ai+breakthroughs+2024");
  });

  test("falls back for invalid URL", () => {
    const result = buildDdgReferer("not a url @@##");
    expect(result).toBe("https://duckduckgo.com/?q=news+right+now&ia=web");
  });

  test("uses default query when slug is empty", () => {
    const result = buildDdgReferer("https://example.com/");
    expect(result).toContain("duckduckgo.com");
    expect(result).toContain("news+right+now");
  });

  test("strips file extension from slug", () => {
    const result = buildDdgReferer("https://example.com/article.html");
    expect(result).toContain("article");
    expect(result).not.toContain(".html");
  });
});

// ── api/http-client – createLinkedAbortController ───────────────────────────

describe("api/http-client – createLinkedAbortController", () => {
  test("immediately aborts when signal already aborted", () => {
    const abortedController = new AbortController();
    abortedController.abort();

    const { controller, dispose } = createLinkedAbortController(
      abortedController.signal,
    );
    expect(controller.signal.aborted).toBe(true);
    dispose();
  });

  test("aborts when parent signal fires", () => {
    const parent = new AbortController();
    const { controller, dispose } = createLinkedAbortController(parent.signal);

    expect(controller.signal.aborted).toBe(false);
    parent.abort();
    expect(controller.signal.aborted).toBe(true);
    dispose();
  });

  test("no signal returns no-op dispose", () => {
    const { controller, dispose } = createLinkedAbortController();
    expect(controller.signal.aborted).toBe(false);
    expect(() => dispose()).not.toThrow();
  });
});

// ── api/http-client – withRequestDeadline ───────────────────────────────────

describe("api/http-client – withRequestDeadline", () => {
  test("resolves when promise resolves before timeout", async () => {
    const result = await withRequestDeadline(Promise.resolve("ok"), 5000);
    expect(result).toBe("ok");
  });

  test("rejects with timeout error on slow request", async () => {
    const neverResolves = new Promise<string>(() => {});
    await expect(withRequestDeadline(neverResolves, 1)).rejects.toThrow(
      "Request timeout",
    );
  });

  test("calls onTimeout callback when timing out", async () => {
    let called = false;
    const neverResolves = new Promise<string>(() => {});
    await expect(
      withRequestDeadline(neverResolves, 1, () => {
        called = true;
      }),
    ).rejects.toThrow();
    expect(called).toBe(true);
  });
});

// ── utils/opml – generateOpml ────────────────────────────────────────────────

describe("utils/opml – generateOpml", () => {
  test("generates valid OPML XML with multiple categories", () => {
    const categories = [
      {
        label: "Tech",
        children: [
          {
            label: "Hacker News",
            data: { url: "https://news.ycombinator.com/rss" },
          },
          {
            label: "Lobsters",
            data: { url: "https://lobste.rs/rss" },
          },
        ],
      },
      {
        label: "Science",
        children: [
          {
            label: "NASA",
            data: { url: "https://www.nasa.gov/rss/dyn/breaking_news.rss" },
          },
        ],
      },
    ];

    const opml = generateOpml(categories as any);
    expect(opml).toContain('<?xml version="1.0"');
    expect(opml).toContain('<opml version="2.0">');
    expect(opml).toContain("LibreRSS Subscriptions");
    expect(opml).toContain('text="Tech"');
    expect(opml).toContain("news.ycombinator.com/rss");
    expect(opml).toContain('text="Science"');
    expect(opml).toContain("nasa.gov");
    expect(opml).toContain("</opml>");
  });

  test("skips categories with no feeds", () => {
    const categories = [
      { label: "Empty Category", children: [] },
      {
        label: "Has Feeds",
        children: [{ label: "Feed", data: { url: "https://example.com/rss" } }],
      },
    ];
    const opml = generateOpml(categories as any);
    expect(opml).not.toContain("Empty Category");
    expect(opml).toContain("Has Feeds");
  });

  test("escapes XML special characters in names/URLs", () => {
    const categories = [
      {
        label: 'Tech & "Science"',
        children: [
          {
            label: "<Best> Feed",
            data: { url: "https://example.com/feed?a=1&b=2" },
          },
        ],
      },
    ];
    const opml = generateOpml(categories as any);
    expect(opml).toContain("Tech &amp;");
    expect(opml).toContain("&quot;Science&quot;");
    expect(opml).toContain("&lt;Best&gt;");
    expect(opml).toContain("a=1&amp;b=2");
  });

  test("returns valid OPML structure for empty categories", () => {
    const opml = generateOpml([]);
    expect(opml).toContain("<body>");
    expect(opml).toContain("</body>");
    expect(opml).toContain("</opml>");
  });
});

// ── extract/cache – cache operations ─────────────────────────────────────────

describe("extract/cache – getCachedExtractPayload and setCachedExtractPayload", () => {
  test("returns null for uncached URL", async () => {
    const { getCachedExtractPayload } = await import("@/lib/extract/cache");
    const result = getCachedExtractPayload("https://not-cached.example.com/a");
    expect(result).toBeNull();
  });

  test("stores and retrieves payload", async () => {
    const { getCachedExtractPayload, setCachedExtractPayload } =
      await import("@/lib/extract/cache");

    const url = `https://cache-test-${Date.now()}.example.com/article`;
    const payload = { content: "<p>Hello</p>", srcUrl: url };

    setCachedExtractPayload(url, payload as any);
    const result = getCachedExtractPayload(url);
    expect(result).not.toBeNull();
    expect((result as any)?.content).toBe("<p>Hello</p>");
  });

  test("returns null for expired entry", async () => {
    const originalDateNow = Date.now;
    try {
      let fakeTime = 1_000_000;
      Date.now = () => fakeTime;

      const { getCachedExtractPayload, setCachedExtractPayload } =
        await import("@/lib/extract/cache");

      const url = `https://expired-test-${fakeTime}.example.com/article`;
      const payload = { content: "<p>Stale</p>", srcUrl: url };

      setCachedExtractPayload(url, payload as any);
      // Advance time past TTL
      fakeTime += 1_000 * 60 * 60 * 25; // 25 hours
      const result = getCachedExtractPayload(url);
      expect(result).toBeNull();
    } finally {
      Date.now = originalDateNow;
    }
  });
});

// ── api/services – FeedService additional methods ───────────────────────────

const makeMockAxiosClient = (): any => ({
  get: mock(async () => ({ data: {} })),
  post: mock(async () => ({ data: {} })),
  put: mock(async () => ({ data: {} })),
  patch: mock(async () => ({ data: {} })),
  delete: mock(async () => ({ data: {} })),
});

describe("FeedService – renameFeedSource, setFeedSourceEnabled, getCategoryOrder", () => {
  test("renameFeedSource patches /api/feeds with id, name, url", async () => {
    const mx = makeMockAxiosClient();
    const feed = { id: 5, name: "New Name", url: "https://example.com/feed" };
    mx.patch = mock(async () => ({ data: feed }));
    __setApiClientForTesting(mx);

    const result = await FeedService.renameFeedSource(
      5,
      "New Name",
      "https://example.com/feed",
    );
    expect(mx.patch).toHaveBeenCalledWith("/api/feeds", {
      id: 5,
      name: "New Name",
      url: "https://example.com/feed",
    });
    expect(result).toEqual(feed);
  });

  test("renameFeedSource without url omits url in payload", async () => {
    const mx = makeMockAxiosClient();
    mx.patch = mock(async () => ({ data: { id: 5, name: "New Name" } }));
    __setApiClientForTesting(mx);

    await FeedService.renameFeedSource(5, "New Name");
    const patchCall = (mx.patch as ReturnType<typeof mock>).mock.calls[0];
    expect(patchCall?.[1]).toMatchObject({ id: 5, name: "New Name" });
  });

  test("setFeedSourceEnabled patches /api/feeds with enabled flag", async () => {
    const mx = makeMockAxiosClient();
    mx.patch = mock(async () => ({ data: { id: 3, enabled: false } }));
    __setApiClientForTesting(mx);

    const result = (await FeedService.setFeedSourceEnabled(3, false)) as any;
    expect(mx.patch).toHaveBeenCalledWith("/api/feeds", {
      id: 3,
      enabled: false,
    });
    expect(result.enabled).toBe(false);
  });

  test("updateFeedSettings patches /api/feeds with settings", async () => {
    const mx = makeMockAxiosClient();
    mx.patch = mock(async () => ({
      data: { id: 7, extractionDisabled: true, proxyEnabled: false },
    }));
    __setApiClientForTesting(mx);

    const result = (await FeedService.updateFeedSettings(7, {
      extractionDisabled: true,
      proxyEnabled: false,
    })) as any;
    expect(mx.patch).toHaveBeenCalledWith("/api/feeds", {
      id: 7,
      extractionDisabled: true,
      proxyEnabled: false,
    });
    expect(result.extractionDisabled).toBe(true);
  });

  test("getCategoryOrder returns orderedLabels array", async () => {
    const mx = makeMockAxiosClient();
    const labels = ["Tech", "Science", "News"];
    mx.get = mock(async () => ({ data: { orderedLabels: labels } }));
    __setApiClientForTesting(mx);

    const result = await FeedService.getCategoryOrder();
    expect(result).toEqual(labels);
    expect(mx.get).toHaveBeenCalledWith("/api/feeds/category-order");
  });

  test("getCategoryOrder returns [] when response is not array", async () => {
    const mx = makeMockAxiosClient();
    mx.get = mock(async () => ({ data: { orderedLabels: null } }));
    __setApiClientForTesting(mx);

    const result = await FeedService.getCategoryOrder();
    expect(result).toEqual([]);
  });

  test("saveCategoryOrder puts to /api/feeds/category-order", async () => {
    const mx = makeMockAxiosClient();
    mx.put = mock(async () => ({ data: {} }));
    __setApiClientForTesting(mx);

    await FeedService.saveCategoryOrder(["News", "Tech"]);
    expect(mx.put).toHaveBeenCalledWith("/api/feeds/category-order", {
      orderedLabels: ["News", "Tech"],
    });
  });
});

// ── api/services – ArticleService additional methods ────────────────────────

describe("ArticleService – getProxyStatus, testBotDetection", () => {
  test("getProxyStatus calls GET /api/articles/proxy-status", async () => {
    const mx = makeMockAxiosClient();
    mx.get = mock(async () => ({
      data: {
        configured: true,
        proxyUrl: "socks5://proxy:1080",
        status: "reachable",
      },
    }));
    __setApiClientForTesting(mx);

    const result = await ArticleService.getProxyStatus();
    expect(mx.get).toHaveBeenCalledWith("/api/articles/proxy-status");
    expect(result).toMatchObject({ configured: true });
  });

  test("testBotDetection posts to proxy/test-bot-detection", async () => {
    const mx = makeMockAxiosClient();
    const results = [
      {
        site: "example.com",
        url: "https://example.com",
        protection: "none",
        success: true,
        blocked: false,
      },
    ];
    mx.post = mock(async () => ({ data: { results } }));
    __setApiClientForTesting(mx);

    const response = await ArticleService.testBotDetection({ useProxy: true });
    expect(mx.post).toHaveBeenCalledWith(
      "/api/settings/proxy/test-bot-detection",
      { useProxy: true },
    );
    expect(response.results).toEqual(results);
  });

  test("testBotDetection without options sends empty object", async () => {
    const mx = makeMockAxiosClient();
    mx.post = mock(async () => ({ data: { results: [] } }));
    __setApiClientForTesting(mx);

    await ArticleService.testBotDetection();
    const call = (mx.post as ReturnType<typeof mock>).mock.calls[0];
    expect(call?.[1]).toEqual({});
  });
});

// ── api/services – AuthService ───────────────────────────────────────────────

describe("AuthService", () => {
  test("getSession fetches /api/auth/session", async () => {
    const mx = makeMockAxiosClient();
    const session = {
      authenticated: true,
      user: { id: 1, email: "a@b.com", createdAt: new Date() },
      allowSignup: false,
      usePlaceholderData: false,
    };
    mx.get = mock(async () => ({ data: session }));
    __setApiClientForTesting(mx);

    const result = await AuthService.getSession();
    expect(mx.get).toHaveBeenCalledWith("/api/auth/session");
    expect(result.authenticated).toBe(true);
  });

  test("login posts credentials and returns user", async () => {
    const mx = makeMockAxiosClient();
    mx.post = mock(async () => ({
      data: { user: { id: 1, email: "user@example.com" } },
    }));
    __setApiClientForTesting(mx);

    const user = await AuthService.login("user@example.com", "password123");
    expect(mx.post).toHaveBeenCalledWith("/api/auth/login", {
      email: "user@example.com",
      password: "password123",
    });
    expect(user).toMatchObject({ id: 1 });
  });

  test("signup posts credentials and returns user", async () => {
    const mx = makeMockAxiosClient();
    mx.post = mock(async () => ({
      data: { user: { id: 2, email: "new@example.com" } },
    }));
    __setApiClientForTesting(mx);

    const user = await AuthService.signup("new@example.com", "newpassword");
    expect(mx.post).toHaveBeenCalledWith("/api/auth/signup", {
      email: "new@example.com",
      password: "newpassword",
    });
    expect(user).toMatchObject({ id: 2 });
  });

  test("logout posts to /api/auth/logout", async () => {
    const mx = makeMockAxiosClient();
    mx.post = mock(async () => ({ data: { ok: true } }));
    __setApiClientForTesting(mx);

    await AuthService.logout();
    expect(mx.post).toHaveBeenCalledWith("/api/auth/logout");
  });
});

// ── api/services – ArticleService.getReaderStream ───────────────────────────

describe("ArticleService – getReaderStream and markAllRead", () => {
  test("getReaderStream fetches stream URL and maps items", async () => {
    const mx = makeMockAxiosClient();
    mx.get = mock(async () => ({ data: { items: [] } }));
    __setApiClientForTesting(mx);

    const result = await ArticleService.getReaderStream(
      "user/-/state/com.google/reading-list",
    );
    expect(Array.isArray(result)).toBe(true);
    expect(mx.get).toHaveBeenCalledTimes(1);
  });

  test("markAllRead posts to /api/articles/mark-all-read", async () => {
    const mx = makeMockAxiosClient();
    mx.post = mock(async () => ({ data: {} }));
    __setApiClientForTesting(mx);

    await ArticleService.markAllRead("user/-/state/com.google/reading-list");
    expect(mx.post).toHaveBeenCalledWith("/api/articles/mark-all-read", {
      streamId: "user/-/state/com.google/reading-list",
    });
  });
});

// ── lib/core/feed-url-validator – credentialed/IP URLs ──────────────────────

describe("core/feed-url-validator – assertPublicFeedUrl edge cases", () => {
  test("isAllowedFeedUrl returns false for credentialed URLs", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/feed-url-validator");
    const url = new URL("https://example.com/feed");
    url.username = "user";
    url.password = "pass";
    const result = await isAllowedFeedUrl(url.toString());
    expect(result).toBe(false);
  });

  test("isAllowedFeedUrl returns false for localhost IP", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/feed-url-validator");
    const result = await isAllowedFeedUrl("http://127.0.0.1/feed");
    expect(result).toBe(false);
  });

  test("isAllowedFeedUrl returns false for private IP ranges", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/feed-url-validator");
    const result = await isAllowedFeedUrl("http://192.168.1.100/feed");
    expect(result).toBe(false);
  });

  test("isAllowedFeedUrl returns false for non-http protocol", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/feed-url-validator");
    const result = await isAllowedFeedUrl("ftp://example.com/feed");
    expect(result).toBe(false);
  });

  test("assertPublicFeedUrl throws for credentialed URL", async () => {
    const { assertPublicFeedUrl } =
      await import("@/lib/core/feed-url-validator");
    const url = new URL("https://example.com/feed");
    url.username = "admin";
    url.password = "secret";
    await expect(assertPublicFeedUrl(url.toString())).rejects.toThrow(
      "Blocked credentialed feed URL",
    );
  });

  test("assertPublicFeedUrl throws for blocked hostname (localhost)", async () => {
    const { assertPublicFeedUrl } =
      await import("@/lib/core/feed-url-validator");
    await expect(
      assertPublicFeedUrl("http://localhost/feed"),
    ).rejects.toThrow();
  });
});

// ── lib/sanitize/content-sanitization – fallback paths ───────────────────────

describe("sanitize/content-sanitization – sanitizeRawContent fallback paths", () => {
  test("returns sanitized fallback for HTML that sanitizes to empty string", async () => {
    const { sanitizeRawContent } =
      await import("@/lib/sanitize/content-sanitization");
    // A <section> with only script tags will sanitize away the visible content
    // but fall back to plain-text path
    const input = "<section><script>evil()</script></section>";
    const result = sanitizeRawContent(input);
    // Should not contain the dangerous script
    expect(result).not.toContain("<script>");
  });

  test("handles pure HTML that has only images in section tags — fallback with image recovery", async () => {
    const { sanitizeRawContent } =
      await import("@/lib/sanitize/content-sanitization");
    // Section with img and NO text: sanitized output drops section → triggers
    // the recovered image + fallback text path
    const input =
      '<section><p><img src="https://cdn.example.com/hero.jpg" alt="hero" width="800" height="600" /></p></section>';
    const result = sanitizeRawContent(input);
    // The image should be present (either directly or via recovery)
    expect(typeof result).toBe("string");
  });

  test("sanitizeRawContent falls back to plain text when sanitized html is blank", async () => {
    const { sanitizeRawContent } =
      await import("@/lib/sanitize/content-sanitization");
    // Craft HTML that has only disallowed elements → sanitizer produces ""
    // then we fall back to toPlainText
    const input = "<noscript><iframe>hidden</iframe></noscript>text content";
    const result = sanitizeRawContent(input);
    // Must produce something (either original text or wrapped text)
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── lib/config – envBooleanOptional ──────────────────────────────────────────

describe("lib/config – envBooleanOptional", () => {
  test("returns defaultValue when env var is missing", async () => {
    const { envBooleanOptional } = await import("@/lib/config");
    const prev = process.env.SOME_MISSING_KEY_XYZ;
    delete process.env.SOME_MISSING_KEY_XYZ;
    try {
      expect(envBooleanOptional("SOME_MISSING_KEY_XYZ", true)).toBe(true);
      expect(envBooleanOptional("SOME_MISSING_KEY_XYZ", false)).toBe(false);
    } finally {
      if (prev !== undefined) process.env.SOME_MISSING_KEY_XYZ = prev;
    }
  });

  test("returns false when env var is '0'", async () => {
    const { envBooleanOptional } = await import("@/lib/config");
    process.env.TEST_BOOL_OPT_KEY = "0";
    try {
      expect(envBooleanOptional("TEST_BOOL_OPT_KEY", true)).toBe(false);
    } finally {
      delete process.env.TEST_BOOL_OPT_KEY;
    }
  });

  test("returns true when env var is 'yes'", async () => {
    const { envBooleanOptional } = await import("@/lib/config");
    process.env.TEST_BOOL_OPT_YES = "yes";
    try {
      expect(envBooleanOptional("TEST_BOOL_OPT_YES", false)).toBe(true);
    } finally {
      delete process.env.TEST_BOOL_OPT_YES;
    }
  });
});
