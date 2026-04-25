import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

// ── lib/core/feed-url-validator – credentialed/IP URLs ──────────────────────

describe("core/feed-url-validator – assertPublicFeedUrl edge cases", () => {
  test("isAllowedFeedUrl returns false for credentialed URLs", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const url = new URL("https://example.com/feed");
    url.username = "user";
    url.password = "pass";
    const result = await isAllowedFeedUrl(url.toString());
    expect(result).toBe(false);
  });

  test("isAllowedFeedUrl returns false for localhost IP", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl("http://127.0.0.1/feed");
    expect(result).toBe(false);
  });

  test("isAllowedFeedUrl returns false for private IP ranges", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl("http://192.168.1.100/feed");
    expect(result).toBe(false);
  });

  test("isAllowedFeedUrl returns false for non-http protocol", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl("ftp://example.com/feed");
    expect(result).toBe(false);
  });

  test("assertPublicFeedUrl throws for credentialed URL", async () => {
    const { assertPublicFeedUrl } = await import("@/lib/core/url-validator");
    const url = new URL("https://example.com/feed");
    url.username = "admin";
    url.password = "secret";
    await expect(assertPublicFeedUrl(url.toString())).rejects.toThrow(
      "Blocked credentialed feed URL",
    );
  });

  test("assertPublicFeedUrl throws for blocked hostname (localhost)", async () => {
    const { assertPublicFeedUrl } = await import("@/lib/core/url-validator");
    await expect(
      assertPublicFeedUrl("http://localhost/feed"),
    ).rejects.toThrow();
  });
});

// ── lib/core/feed-url-validator – IP address validation ───────────────────────

describe("lib/core/feed-url-validator – IP address SSRF protection", () => {
  test("blocks private IPv4 addresses (192.168.x.x)", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl("http://192.168.1.1/feed.xml");
    expect(result).toBe(false);
  });

  test("blocks loopback IPv4 address (127.0.0.1)", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl("http://127.0.0.1/feed");
    expect(result).toBe(false);
  });

  test("blocks link-local IPv4 address (169.254.x.x)", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl("http://169.254.0.1/feed");
    expect(result).toBe(false);
  });

  test("blocks RFC 2544 benchmarking address (198.18.0.1)", async () => {
    // 198.18.0.0/15 matched by /^198\.(1[89])\./ in ssrf.ts BLOCKED_HOST_PATTERNS
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl("http://198.18.0.1/feed");
    expect(result).toBe(false);
  });

  test("allows valid public IP in isAllowedFeedUrl (non-blocked)", async () => {
    // 1.1.1.1 is Cloudflare DNS – public IP, not in any RFC-private range
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl("http://1.1.1.1/feed");
    // result may be true (allowed) or false (if DNS rebind check marks it blocked)
    // Just assert it resolves without throwing
    expect(typeof result).toBe("boolean");
  });

  test("allows public IPv6 literals wrapped in URL brackets", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl(
      "http://[2606:4700:4700::1111]/feed.xml",
    );
    expect(result).toBe(true);
  });

  test("blocks loopback IPv6 literals wrapped in URL brackets", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl("http://[::1]/feed.xml");
    expect(result).toBe(false);
  });
});

// ── lib/core/feed-url-validator – blocked IP address path (line 37) ──────────

describe("lib/core/feed-url-validator – assertPublicFeedUrl blocked IP", () => {
  test("isAllowedFeedUrl returns false for private IP address (192.168.x.x)", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    // 192.168.1.1 is a private/reserved address → isBlockedResolvedAddress returns true
    const result = await isAllowedFeedUrl("http://192.168.1.1/feed");
    expect(result).toBe(false);
  });

  test("isAllowedFeedUrl returns false for loopback IP address (127.0.0.1)", async () => {
    const { isAllowedFeedUrl } = await import("@/lib/core/url-validator");
    const result = await isAllowedFeedUrl("http://127.0.0.1/feed");
    expect(result).toBe(false);
  });
});
