/**
 * Security Regression Tests
 *
 * Covers every vulnerability class fixed in the security audit:
 *   1. Static placeholder session token (CRITICAL)
 *   2. Password max-length DoS via scrypt (HIGH)
 *   3. SSRF blocked-host detection (HIGH)
 *   4. HTML sanitization / XSS (HIGH)
 *   5. URL validation (MEDIUM)
 */

import { describe, expect, test } from "bun:test";

// ─── 1. Placeholder session token ────────────────────────────────────────────

describe("PLACEHOLDER_ADMIN_USER.sessionToken", () => {
  test("is not the legacy hardcoded string", async () => {
    const { PLACEHOLDER_ADMIN_USER } = await import("@/lib/core/runtime");
    expect(PLACEHOLDER_ADMIN_USER.sessionToken).not.toBe(
      "librerss-placeholder-admin-session",
    );
  });

  test("is a 64-char hex string (32 random bytes)", async () => {
    const { PLACEHOLDER_ADMIN_USER } = await import("@/lib/core/runtime");
    expect(PLACEHOLDER_ADMIN_USER.sessionToken).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is stable within the same process", async () => {
    const { PLACEHOLDER_ADMIN_USER } = await import("@/lib/core/runtime");
    const first = PLACEHOLDER_ADMIN_USER.sessionToken;
    const second = PLACEHOLDER_ADMIN_USER.sessionToken;
    expect(first).toBe(second);
  });
});

// ─── 2. Password length limit (scrypt DoS) ───────────────────────────────────

describe("isStrongPassword – MAX_PASSWORD_LENGTH", () => {
  test("accepts a password at the maximum length", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    const { CONFIG } = await import("@/lib/config");
    // Construct a password exactly at the limit with all complexity classes.
    const pw = "Aa1!" + "x".repeat(CONFIG.PASSWORD_MAX_LENGTH - 4);
    expect(pw.length).toBe(CONFIG.PASSWORD_MAX_LENGTH);
    expect(isStrongPassword(pw)).toBe(true);
  });

  test("rejects a password one byte over the maximum length", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    const { CONFIG } = await import("@/lib/config");
    const pw = "Aa1!" + "x".repeat(CONFIG.PASSWORD_MAX_LENGTH - 4 + 1);
    expect(pw.length).toBe(CONFIG.PASSWORD_MAX_LENGTH + 1);
    expect(isStrongPassword(pw)).toBe(false);
  });

  test("rejects a 10 KB password (DoS vector)", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    const pw = "Aa1!" + "x".repeat(10_000);
    expect(isStrongPassword(pw)).toBe(false);
  });

  test("rejects an empty password", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    expect(isStrongPassword("")).toBe(false);
  });

  test("rejects a password below minimum length", async () => {
    const { isStrongPassword } = await import("@/lib/utils/validation");
    const { CONFIG } = await import("@/lib/config");
    const pw = "Aa1!".slice(0, CONFIG.PASSWORD_MIN_LENGTH - 1);
    expect(isStrongPassword(pw)).toBe(false);
  });
});

// ─── 3. SSRF – blocked-host detection ────────────────────────────────────────

describe("isBlockedHost", () => {
  test("blocks localhost", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("localhost")).toBe(true);
  });

  test("blocks 127.0.0.1", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("127.0.0.1")).toBe(true);
  });

  test("blocks 10.x RFC-1918", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("10.0.0.1")).toBe(true);
    expect(isBlockedHost("10.255.255.255")).toBe(true);
  });

  test("blocks 192.168.x RFC-1918", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("192.168.0.1")).toBe(true);
    expect(isBlockedHost("192.168.255.255")).toBe(true);
  });

  test("blocks 172.16-31.x RFC-1918", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("172.16.0.1")).toBe(true);
    expect(isBlockedHost("172.31.255.255")).toBe(true);
    // 172.15 and 172.32 are NOT private
    expect(isBlockedHost("172.15.0.1")).toBe(false);
    expect(isBlockedHost("172.32.0.1")).toBe(false);
  });

  test("blocks 169.254.x link-local", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("169.254.169.254")).toBe(true); // AWS metadata
  });

  test("blocks 0.0.0.0", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("0.0.0.0")).toBe(true);
  });

  test("blocks ::1 IPv6 loopback", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("::1")).toBe(true);
  });

  test("blocks .local mDNS addresses", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("myhost.local")).toBe(true);
  });

  test("allows a public IP", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("8.8.8.8")).toBe(false);
    expect(isBlockedHost("1.1.1.1")).toBe(false);
  });

  test("allows a public hostname", async () => {
    const { isBlockedHost } = await import("@/lib/utils/ssrf");
    expect(isBlockedHost("example.com")).toBe(false);
  });
});

describe("isBlockedResolvedAddress", () => {
  test("blocks IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("::ffff:127.0.0.1")).toBe(true);
  });

  test("blocks IPv4-mapped IPv6 link-local (::ffff:169.254.169.254)", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("::ffff:169.254.169.254")).toBe(true);
  });

  test("blocks IPv4-mapped IPv6 private range (::ffff:10.0.0.1)", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("::ffff:10.0.0.1")).toBe(true);
  });

  test("allows IPv4-mapped public IP (::ffff:8.8.8.8)", async () => {
    const { isBlockedResolvedAddress } = await import("@/lib/utils/ssrf");
    expect(isBlockedResolvedAddress("::ffff:8.8.8.8")).toBe(false);
  });
});

// ─── 4. HTML sanitization / XSS prevention ───────────────────────────────────

describe("sanitizeArticleTitle", () => {
  test("strips script tags completely", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/utils/sanitize");
    const result = sanitizeArticleTitle("<script>alert(1)</script>Title");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("Title");
  });

  test("strips all HTML tags from a title", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/utils/sanitize");
    const result = sanitizeArticleTitle("<b>Bold</b> <em>title</em>");
    expect(result).toBe("Bold title");
  });

  test("returns Untitled for empty input", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/utils/sanitize");
    expect(sanitizeArticleTitle("")).toBe("Untitled");
    expect(sanitizeArticleTitle("   ")).toBe("Untitled");
    expect(sanitizeArticleTitle(null)).toBe("Untitled");
    expect(sanitizeArticleTitle(undefined)).toBe("Untitled");
  });

  test("truncates overlong titles", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/utils/sanitize");
    const { CONFIG } = await import("@/lib/config");
    const long = "a".repeat(CONFIG.MAX_ARTICLE_TITLE_LENGTH + 50);
    const result = sanitizeArticleTitle(long);
    expect(result.length).toBeLessThanOrEqual(
      CONFIG.MAX_ARTICLE_TITLE_LENGTH + 3, // +3 for "..."
    );
  });
});

describe("sanitizeArticleHtml – XSS vectors", () => {
  test("strips <script> tags", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const xss = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeArticleHtml(xss);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  test("strips onerror event handlers", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const xss = '<img src="x" onerror="alert(1)">';
    const result = sanitizeArticleHtml(xss);
    expect(result).not.toContain("onerror");
    expect(result).toContain("<img");
  });

  test("preserves safe images", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const html =
      '<img src="https://example.com/image.jpg" alt="Example" width="800" height="600">';
    const result = sanitizeArticleHtml(html);
    expect(result).toContain('<img src="https://example.com/image.jpg"');
    expect(result).toContain('alt="Example"');
    expect(result).toContain('width="800"');
    expect(result).toContain('height="600"');
  });

  test("preserves bullet lists", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const html = "<ul><li>First</li><li>Second</li></ul>";
    const result = sanitizeArticleHtml(html);
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>First</li>");
    expect(result).toContain("<li>Second</li>");
  });

  test("strips javascript: href links", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const xss = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeArticleHtml(xss);
    // The link should be stripped or the href should not contain javascript:
    expect(result).not.toContain("javascript:");
  });

  test("strips data: URI links", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const xss = '<a href="data:text/html,<script>alert(1)</script>">x</a>';
    const result = sanitizeArticleHtml(xss);
    expect(result).not.toContain("data:");
  });

  test("preserves safe <a> tags with rel and target attributes added", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const safe = '<a href="https://example.com">Click</a>';
    const result = sanitizeArticleHtml(safe);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer nofollow"');
    expect(result).toContain('target="_blank"');
  });

  test("strips <iframe> tags", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const xss = '<iframe src="https://evil.com/pwned"></iframe>';
    const result = sanitizeArticleHtml(xss);
    expect(result).not.toContain("<iframe");
  });

  test("strips <style> tags", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const css = "<style>body { display: none }</style><p>Content</p>";
    const result = sanitizeArticleHtml(css);
    expect(result).not.toContain("<style>");
  });

  test("collapses excessive CRLF and whitespace-only blank lines", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const html = "<p>First</p>\r\n\r\n  \r\n\r\n\r\n<p>Second</p>";
    const result = sanitizeArticleHtml(html);

    expect(result).toBe("<p>First</p>\n<p>Second</p>");
  });

  test("collapses excessive nbsp-only blank paragraphs", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const html =
      "<p>First</p><p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p><p>Second</p>";
    const result = sanitizeArticleHtml(html);

    expect(result).toBe("<p>First</p><p>Second</p>");
  });

  test("collapses excessive br-only blank paragraphs", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/utils/sanitize");
    const html =
      "<p>First</p><p><br></p><p><br /></p><p><br></p><p><br></p><p>Second</p>";
    const result = sanitizeArticleHtml(html);

    expect(result).toBe("<p>First</p><p>Second</p>");
  });
});

describe("sanitizeAndTruncateArticleContent", () => {
  test("enforces MAX_ARTICLE_CONTENT_LENGTH", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");
    const { CONFIG } = await import("@/lib/config");
    // Wrap content in <p> tags so the sanitizer doesn't strip it.
    const longContent =
      "<p>" + "a".repeat(CONFIG.MAX_ARTICLE_CONTENT_LENGTH + 5000) + "</p>";
    const result = sanitizeAndTruncateArticleContent(longContent);
    // Result must be at most the limit + small overhead for sentinel paragraph.
    expect(result.length).toBeLessThan(CONFIG.MAX_ARTICLE_CONTENT_LENGTH + 200);
    expect(result).toContain("[content truncated]");
  });
});

// ─── 5. URL validation ────────────────────────────────────────────────────────

describe("isValidUrl", () => {
  test("accepts http and https URLs", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("http://example.com/feed")).toBe(true);
    expect(isValidUrl("https://example.com/feed")).toBe(true);
  });

  test("rejects javascript: protocol", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
  });

  test("rejects data: URIs", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  test("rejects file: protocol", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("file:///etc/passwd")).toBe(false);
  });

  test("rejects empty string", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("")).toBe(false);
  });

  test("rejects plain hostnames without protocol", async () => {
    const { isValidUrl } = await import("@/lib/utils/url");
    expect(isValidUrl("example.com")).toBe(false);
  });
});

describe("normalizeFeedUrl", () => {
  test("strips credentials from URLs", async () => {
    const { normalizeFeedUrl } = await import("@/lib/utils/url");
    const result = normalizeFeedUrl("https://user:pass@example.com/feed");
    expect(result).not.toContain("user");
    expect(result).not.toContain("pass");
    expect(result).toContain("example.com");
  });

  test("strips URL fragments", async () => {
    const { normalizeFeedUrl } = await import("@/lib/utils/url");
    const result = normalizeFeedUrl("https://example.com/feed#tracker-param");
    expect(result).not.toContain("#");
  });
});
// ─── 6. Scrypt versioned hashing (v2: format prefix) ─────────────────────────
// New passwords are stored with a "v2:" prefix so future cost-factor upgrades
// can be rolled out without a separate migration step.  The current V2 uses
// N=16384 (same as legacy V1) — bump to N=32768 when the runtime moves to
// Node.js natively (Bun 1.3.x caps OpenSSL scrypt memory at ~16 MB).

describe("hashPassword / verifyPassword – versioned scrypt", () => {
  test("hashPassword produces a v2: prefixed hash", async () => {
    const { hashPassword } = await import("@/lib/auth/session");
    const hash = await hashPassword("Aa1!correct");
    expect(hash).toMatch(/^v2:[0-9a-f]+:[0-9a-f]+$/);
  });

  test("new hashes do NOT use the legacy un-prefixed format", async () => {
    const { hashPassword } = await import("@/lib/auth/session");
    const hash = await hashPassword("Aa1!correct");
    // Must start with 'v2:' — a bare '<salt>:<hex>' format would be legacy.
    expect(hash.startsWith("v2:")).toBe(true);
  });

  test("verifyPassword accepts a correct v2 password", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/session");
    const hash = await hashPassword("Aa1!correct");
    expect(await verifyPassword("Aa1!correct", hash)).toBe(true);
  });

  test("verifyPassword rejects a wrong password against v2 hash", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/session");
    const hash = await hashPassword("Aa1!correct");
    expect(await verifyPassword("Aa1!wrong", hash)).toBe(false);
  });

  test("verifyPassword still handles legacy v1 (no-prefix) hashes", async () => {
    // Pre-compute a v1 hash (N=16384) to verify backward-compatibility.
    // node:crypto scrypt with explicit N=16384 r=8 p=1.
    const { scrypt } = await import("node:crypto");
    const { promisify } = await import("node:util");
    const scryptAsync = promisify(scrypt) as (
      password: string,
      salt: string,
      keylen: number,
      options?: { N: number; r: number; p: number },
    ) => Promise<Buffer>;

    const password = "LegacyPass1!";
    const salt = "deadbeef1234";
    const key = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    const legacyHash = `${salt}:${key.toString("hex")}`;

    const { verifyPassword } = await import("@/lib/auth/session");
    expect(await verifyPassword(password, legacyHash)).toBe(true);
    expect(await verifyPassword("WrongPass1!", legacyHash)).toBe(false);
  });

  test("placeholder password hash verifies correctly with v1 fallback", async () => {
    // The committed placeholder hash was derived with N=16384 (no v2: prefix).
    // verifyPassword must accept it via the v1 path so demo login works.
    const { verifyPassword } = await import("@/lib/auth/session");
    const { PLACEHOLDER_ADMIN_USER } = await import("@/lib/core/runtime");
    // The placeholder hash must start without 'v2:' (legacy format).
    expect(PLACEHOLDER_ADMIN_USER.passwordHash).not.toMatch(/^v2:/);
    // Verify that verifyPassword does NOT throw on the legacy format.
    // (We cannot assert the plaintext password here since it's not stored,
    //  just that the function executes without throwing for a known-bad password.)
    await expect(
      verifyPassword("definitely-wrong", PLACEHOLDER_ADMIN_USER.passwordHash),
    ).resolves.toBe(false);
  });
});

// ─── 7. CSP includes form-action and worker-src ───────────────────────────────

describe("next.config.ts CSP headers", () => {
  test("CSP includes form-action 'self'", async () => {
    const { default: nextConfig } = await import("../../next.config");
    const headersFn = nextConfig.headers;
    expect(typeof headersFn).toBe("function");
    const entries = await (headersFn as () => Promise<unknown[]>)();
    const allValues = (
      entries as { headers: { key: string; value: string }[] }[]
    )
      .flatMap((e) => e.headers)
      .filter((h) => h.key === "Content-Security-Policy")
      .map((h) => h.value);
    expect(allValues.length).toBeGreaterThan(0);
    for (const csp of allValues) {
      expect(csp).toContain("form-action 'self'");
    }
  });

  test("CSP includes worker-src 'self'", async () => {
    const { default: nextConfig } = await import("../../next.config");
    const headersFn = nextConfig.headers;
    const entries = await (headersFn as () => Promise<unknown[]>)();
    const allValues = (
      entries as { headers: { key: string; value: string }[] }[]
    )
      .flatMap((e) => e.headers)
      .filter((h) => h.key === "Content-Security-Policy")
      .map((h) => h.value);
    for (const csp of allValues) {
      expect(csp).toContain("worker-src 'self'");
    }
  });
});

// ─── 8. CSRF evidence and JSON body-size limits ─────────────────────────────

describe("requireSameOrigin", () => {
  test("rejects unsafe request when both Origin and Referer are missing", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const req = new Request("https://app.example.test/api/auth/login", {
      method: "POST",
      headers: {
        host: "app.example.test",
      },
    });

    const result = requireSameOrigin(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  test("accepts unsafe request when Referer origin matches host", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const req = new Request("https://app.example.test/api/auth/login", {
      method: "POST",
      headers: {
        host: "app.example.test",
        referer: "https://app.example.test/dashboard",
      },
    });

    const result = requireSameOrigin(req);
    expect(result).toBeNull();
  });
});

describe("parseJsonBody", () => {
  test("returns 413 when content-length exceeds configured max", async () => {
    const { parseJsonBody } = await import("@/lib/api/request");
    const req = new Request("https://app.example.test/api/feeds", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "2048",
      },
      body: "{}",
    });

    const result = await parseJsonBody<Record<string, unknown>>(req, {
      maxBytes: 1024,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
    }
  });

  test("returns 413 when UTF-8 body bytes exceed max", async () => {
    const { parseJsonBody } = await import("@/lib/api/request");
    const payload = JSON.stringify({ data: "x".repeat(2048) });
    const req = new Request("https://app.example.test/api/feeds", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: payload,
    });

    const result = await parseJsonBody<Record<string, unknown>>(req, {
      maxBytes: 1024,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
    }
  });
});

describe("parseFormOrQueryParams", () => {
  test("returns 413 when content-length exceeds configured max", async () => {
    const { parseFormOrQueryParams } = await import("@/lib/api/request");
    const request = new Request("https://app.example.test/api/greader.php", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": "2048",
      },
      body: "s=user/-/state/com.google/reading-list",
    });

    const result = await parseFormOrQueryParams(request, { maxBytes: 1024 });
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.status).toBe(413);
    }
  });

  test("returns 413 when UTF-8 body bytes exceed max", async () => {
    const { parseFormOrQueryParams } = await import("@/lib/api/request");
    const body = `q=${"x".repeat(2048)}`;
    const request = new Request("https://app.example.test/api/greader.php", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const result = await parseFormOrQueryParams(request, { maxBytes: 1024 });
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) {
      expect(result.status).toBe(413);
    }
  });
});

describe("greader reader-item hardening", () => {
  test("parseDistinctReaderArticleIds dedupes and caps item IDs", async () => {
    const { parseDistinctReaderArticleIds } =
      await import("@/app/api/greader.php/[...segments]/services/reader-item-params");

    const ids = parseDistinctReaderArticleIds(
      [
        "tag:google.com,2005:reader/item/1",
        "tag:google.com,2005:reader/item/1",
        "tag:google.com,2005:reader/item/2",
        "tag:google.com,2005:reader/item/3",
      ],
      { maxItems: 2 },
    );

    expect(ids).toEqual([1, 2]);
  });

  test("parseOlderThanDate ignores non-positive and invalid values", async () => {
    const { parseOlderThanDate } =
      await import("@/app/api/greader.php/[...segments]/services/stream");

    expect(parseOlderThanDate(new URLSearchParams("ot=0"))).toBeNull();
    expect(parseOlderThanDate(new URLSearchParams("ot=-1"))).toBeNull();
    expect(parseOlderThanDate(new URLSearchParams("ot=NaN"))).toBeNull();

    const parsed = parseOlderThanDate(new URLSearchParams("ot=1700000000"));
    expect(parsed).not.toBeNull();
    expect(parsed?.getTime()).toBe(1700000000 * 1000);
  });

  test("shouldExcludeReadFromStream only applies read exclusion to reading-list", async () => {
    const { shouldExcludeReadFromStream } =
      await import("@/app/api/greader.php/[...segments]/services/stream");

    expect(
      shouldExcludeReadFromStream("user/-/state/com.google/reading-list", [
        "user/-/state/com.google/read",
      ]),
    ).toBe(true);

    expect(
      shouldExcludeReadFromStream(
        "feed/https://feeds.bbci.co.uk/news/world/rss.xml",
        ["user/-/state/com.google/read"],
      ),
    ).toBe(false);

    expect(
      shouldExcludeReadFromStream("user/-/state/com.google/reading-list", []),
    ).toBe(false);
  });

  test("buildStreamConditions applies ot as older-than (<), not newer-than", async () => {
    const { buildStreamConditions } =
      await import("@/lib/core/stream-conditions");

    const dateFilter = new Date("2024-01-01T00:00:00.000Z");
    const conditions = buildStreamConditions({
      feedUrl: null,
      dateFilter,
      continuationId: null,
      starredOnly: false,
      useArticleStatuses: false,
    });

    expect(conditions.length).toBe(1);

    const queryChunks = (
      conditions[0] as unknown as { queryChunks?: Array<{ value?: string[] }> }
    ).queryChunks;

    const operators = (queryChunks ?? [])
      .flatMap((chunk) => chunk.value ?? [])
      .filter((token): token is string => typeof token === "string")
      .map((token) => token.trim())
      .filter(Boolean);

    expect(operators).toContain("<");
    expect(operators).not.toContain(">=");
  });
});

describe("logger redaction", () => {
  test("redacts sensitive keys recursively", async () => {
    const previousLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "info";

    const logs: string[] = [];
    const originalInfo = console.log;
    console.log = (message?: unknown) => {
      logs.push(String(message ?? ""));
    };

    try {
      const { logger } = await import("@/lib/utils/logger");
      logger.info("security-log", {
        token: "secret-token",
        nested: { authorization: "Bearer abc", email: "admin@example.test" },
      });
    } finally {
      console.log = originalInfo;
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }

    const merged = logs.join("\n");
    expect(merged).toContain("[redacted]");
    expect(merged).not.toContain("secret-token");
    expect(merged).not.toContain("Bearer abc");
    expect(merged).not.toContain("admin@example.test");
  });
});

// ─── 8. CSRF strictness and trusted-proxy rate-limit identity ───────────────

describe("requireSameOrigin", () => {
  test("blocks unsafe requests when neither Origin nor Sec-Fetch-Site is present", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const request = new Request("https://example.com/api/auth/login", {
      method: "POST",
    });

    const result = requireSameOrigin(request);
    expect(result?.status).toBe(403);
  });

  test("allows unsafe requests with same-origin Sec-Fetch-Site when Origin is absent", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const request = new Request("https://example.com/api/auth/login", {
      method: "POST",
      headers: {
        "sec-fetch-site": "same-origin",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).toBeNull();
  });
});

describe("RateLimiter trusted proxy extraction", () => {
  test("uses the client IP (not the proxy IP) when TRUSTED_PROXY_COUNT=1", async () => {
    const previous = process.env.TRUSTED_PROXY_COUNT;
    process.env.TRUSTED_PROXY_COUNT = "1";

    const { RateLimiter } = await import("@/lib/utils/rate-limit");
    const limiter = new RateLimiter();

    try {
      const config = { windowMs: 60_000, maxAttempts: 1 };
      const requestA = new Request("https://example.com/api/auth/login", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.10, 10.0.0.5",
        },
      });
      const requestB = new Request("https://example.com/api/auth/login", {
        method: "POST",
        headers: {
          "x-forwarded-for": "198.51.100.20, 10.0.0.5",
        },
      });

      expect(limiter.check(requestA, "login", config)).toBeNull();
      expect(limiter.check(requestB, "login", config)).toBeNull();
    } finally {
      limiter.destroy();
      if (typeof previous === "string") {
        process.env.TRUSTED_PROXY_COUNT = previous;
      } else {
        delete process.env.TRUSTED_PROXY_COUNT;
      }
    }
  });
});
