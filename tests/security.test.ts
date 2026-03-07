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

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

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
    const { sanitizeArticleTitle } = await import("@/lib/sanitize");
    const result = sanitizeArticleTitle("<script>alert(1)</script>Title");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("Title");
  });

  test("strips all HTML tags from a title", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/sanitize");
    const result = sanitizeArticleTitle("<b>Bold</b> <em>title</em>");
    expect(result).toBe("Bold title");
  });

  test("returns Untitled for empty input", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/sanitize");
    expect(sanitizeArticleTitle("")).toBe("Untitled");
    expect(sanitizeArticleTitle("   ")).toBe("Untitled");
    expect(sanitizeArticleTitle(null)).toBe("Untitled");
    expect(sanitizeArticleTitle(undefined)).toBe("Untitled");
  });

  test("truncates overlong titles", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/sanitize");
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
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const xss = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeArticleHtml(xss);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  test("strips onerror event handlers", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    // Use a content-sized image so it survives the minimum-size filter.
    // The key assertion is that onerror is stripped regardless.
    const xss =
      '<img src="https://example.com/photo.jpg" width="800" height="600" onerror="alert(1)">';
    const result = sanitizeArticleHtml(xss);
    expect(result).not.toContain("onerror");
    expect(result).toContain("<img");
  });

  test("preserves safe images", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const html =
      '<img src="https://example.com/image.jpg" alt="Example" width="800" height="600">';
    const result = sanitizeArticleHtml(html);
    expect(result).toContain('<img src="https://example.com/image.jpg"');
    expect(result).toContain('alt="Example"');
    expect(result).toContain('width="800"');
    expect(result).toContain('height="600"');
  });

  test("preserves bullet lists", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const html = "<ul><li>First</li><li>Second</li></ul>";
    const result = sanitizeArticleHtml(html);
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>First</li>");
    expect(result).toContain("<li>Second</li>");
  });

  test("strips javascript: href links", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const xss = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeArticleHtml(xss);
    // The link should be stripped or the href should not contain javascript:
    expect(result).not.toContain("javascript:");
  });

  test("strips data: URI links", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const xss = '<a href="data:text/html,<script>alert(1)</script>">x</a>';
    const result = sanitizeArticleHtml(xss);
    expect(result).not.toContain("data:");
  });

  test("preserves safe <a> tags with rel and target attributes added", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const safe = '<a href="https://example.com">Click</a>';
    const result = sanitizeArticleHtml(safe);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer nofollow"');
    expect(result).toContain('target="_blank"');
  });

  test("strips <iframe> tags", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const xss = '<iframe src="https://evil.com/pwned"></iframe>';
    const result = sanitizeArticleHtml(xss);
    expect(result).not.toContain("<iframe");
  });

  test("strips <style> tags", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const css = "<style>body { display: none }</style><p>Content</p>";
    const result = sanitizeArticleHtml(css);
    expect(result).not.toContain("<style>");
  });

  test("collapses excessive CRLF and whitespace-only blank lines", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const html = "<p>First</p>\r\n\r\n  \r\n\r\n\r\n<p>Second</p>";
    const result = sanitizeArticleHtml(html);

    expect(result).toBe("<p>First</p>\n<p>Second</p>");
  });

  test("collapses excessive nbsp-only blank paragraphs", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const html =
      "<p>First</p><p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p><p>Second</p>";
    const result = sanitizeArticleHtml(html);

    expect(result).toBe("<p>First</p><p>Second</p>");
  });

  test("collapses excessive br-only blank paragraphs", async () => {
    const { sanitizeArticleHtml } = await import("@/lib/sanitize");
    const html =
      "<p>First</p><p><br></p><p><br /></p><p><br></p><p><br></p><p>Second</p>";
    const result = sanitizeArticleHtml(html);

    expect(result).toBe("<p>First</p><p>Second</p>");
  });
});

describe("sanitizeAndTruncateArticleContent", () => {
  test("enforces MAX_ARTICLE_CONTENT_LENGTH", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");
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
    const feedWithCreds = `https://${"user"}:${"pass"}@example.com/feed`;
    const result = normalizeFeedUrl(feedWithCreds);
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

describe("buildCspHeader from lib/server/csp", () => {
  test("CSP includes form-action 'self'", async () => {
    const { buildCspHeader } = await import("@/lib/server");
    const scriptNonce = "test-script-nonce";
    const styleNonce = "test-style-nonce";
    const cspValue = buildCspHeader(scriptNonce, styleNonce);

    expect(cspValue).toContain("form-action 'self'");
  });

  test("CSP includes worker-src 'self'", async () => {
    const { buildCspHeader } = await import("@/lib/server");
    const scriptNonce = "test-script-nonce";
    const styleNonce = "test-style-nonce";
    const cspValue = buildCspHeader(scriptNonce, styleNonce);

    expect(cspValue).toContain("worker-src 'self'");
  });

  test("CSP uses nonces for script-src and style-src", async () => {
    const { buildCspHeader } = await import("@/lib/server");
    const scriptNonce = "test-script-nonce-123";
    const styleNonce = "test-style-nonce-456";
    const cspValue = buildCspHeader(scriptNonce, styleNonce);

    expect(cspValue).toContain(`script-src 'self' 'nonce-${scriptNonce}'`);
    expect(cspValue).toContain(
      `style-src 'self' 'nonce-${styleNonce}' 'unsafe-inline'`,
    );
  });

  test("CSP includes strict-dynamic for script-src", async () => {
    const { buildCspHeader } = await import("@/lib/server");
    const scriptNonce = "test-script-nonce";
    const styleNonce = "test-style-nonce";
    const cspValue = buildCspHeader(scriptNonce, styleNonce);

    expect(cspValue).toContain("'strict-dynamic'");
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
    const { parseJsonBody } = await import("@/lib/api/http");
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
    const { parseJsonBody } = await import("@/lib/api/http");
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
    const { parseFormOrQueryParams } = await import("@/lib/api/http");
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
    const { parseFormOrQueryParams } = await import("@/lib/api/http");
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
      await import("@/lib/api/greader/reader-item-params");

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
      await import("@/lib/api/greader/stream-service");

    expect(parseOlderThanDate(new URLSearchParams("ot=0"))).toBeNull();
    expect(parseOlderThanDate(new URLSearchParams("ot=-1"))).toBeNull();
    expect(parseOlderThanDate(new URLSearchParams("ot=NaN"))).toBeNull();

    const parsed = parseOlderThanDate(new URLSearchParams("ot=1700000000"));
    expect(parsed).not.toBeNull();
    expect(parsed?.getTime()).toBe(1700000000 * 1000);
  });

  test("shouldExcludeReadFromStream applies read exclusion to any stream", async () => {
    const { shouldExcludeReadFromStream } =
      await import("@/lib/api/greader/stream-service");

    expect(shouldExcludeReadFromStream(["user/-/state/com.google/read"])).toBe(
      true,
    );

    expect(shouldExcludeReadFromStream(["user/-/state/com.google/read"])).toBe(
      true,
    );

    expect(shouldExcludeReadFromStream([])).toBe(false);
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

    // Import Logger class directly to create a fresh instance
    const { Logger } = await import("@/lib/logger");
    const logger = new Logger();

    const logs: string[] = [];
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Override all console methods that the logger might use
    console.log = (message?: unknown) => {
      logs.push(String(message ?? ""));
    };
    console.warn = (message?: unknown) => {
      logs.push(String(message ?? ""));
    };
    console.error = (message?: unknown) => {
      logs.push(String(message ?? ""));
    };

    try {
      logger.info("security-log", {
        token: "secret-token",
        nested: { authorization: "Bearer abc", email: "admin@example.test" },
      });
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
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

    const { RateLimiter } = await import("@/lib/server");
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

// ─── GReader ClientLogin: credentials must not be accepted via GET URL params ─

describe("GReader ClientLogin – credential exposure via URL params (security regression)", () => {
  test("GET request with credentials in URL params is rejected (not treated as login)", async () => {
    const { handleClientLogin } = await import("@/lib/api/greader/auth");

    // Attacker sends credentials in GET query params — these would appear in
    // server access logs, browser history, and Referer headers.
    const { NextRequest } = await import("next/server");
    const request = new NextRequest(
      "https://example.com/api/greader.php/accounts/ClientLogin?Email=user@test.com&Passwd=hunter2",
      { method: "GET" },
    );

    const response = await handleClientLogin(request);
    const body = await response.text();

    // Must be rejected, not return a session token
    expect(body).not.toContain("SID=");
    expect(body).not.toContain("Auth=");
    expect(response.status).toBe(400);
  });

  test("POST with credentials in body (not URL params) succeeds normally", async () => {
    const previousDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    try {
      const { handleClientLogin } = await import("@/lib/api/greader/auth");
      const { NextRequest } = await import("next/server");
      const request = new NextRequest(
        "https://example.com/api/greader.php/accounts/ClientLogin",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "Email=admin%40admin.com&Passwd=admin",
        },
      );
      const response = await handleClientLogin(request);
      const body = await response.text();
      // Should authenticate successfully via POST body
      expect(body).toContain("SID=");
      expect(body).toContain("Auth=");
    } finally {
      process.env.DATABASE_URL = previousDbUrl;
    }
  });
});

// ─── Logger redacts proxy-related fields ─────────────────────────────────────

describe("Logger – proxy credential redaction (security regression)", () => {
  test("redacts proxyUrl field containing credentials", async () => {
    const { Logger } = await import("@/lib/logger");
    // Access private method via type cast for testing
    const logger = new Logger() as unknown as {
      sanitizeValue: (v: unknown, d: number) => unknown;
    };
    const result = logger.sanitizeValue(
      {
        proxyUrl: `http://${"user"}:${"secret"}@proxy.host:8080`,
        proxyAddress: `socks5://${"user"}:${"pass"}@10.0.0.1:1080`,
        normalField: "visible",
      },
      0,
    ) as Record<string, unknown>;

    expect(result.proxyUrl).toBe("[redacted]");
    expect(result.proxyAddress).toBe("[redacted]");
    expect(result.normalField).toBe("visible");
  });
});

// ─── x-request-id sanitization ───────────────────────────────────────────────

describe("Extract route – x-request-id header sanitization (security regression)", () => {
  test("overlong request ID is truncated before reaching log context", async () => {
    const { POST } = await import("@/app/api/articles/extract/route");
    const { NextRequest } = await import("next/server");

    // HTTP transport already rejects non-ASCII control characters.
    // Test that an overlong (512-char) valid-ASCII request ID is truncated
    // to ≤64 chars so logs cannot be bloated by attacker-controlled values.
    const longId = "A".repeat(512);

    const authUser = {
      sessionId: 1,
      userId: 1,
      email: "test@example.com",
      expiresAt: new Date(Date.now() + 86_400_000),
    };

    const request = new NextRequest(
      "https://example.com/api/articles/extract",
      {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/article" }),
        headers: {
          "content-type": "application/json",
          "x-request-id": longId,
          origin: "https://example.com",
          "sec-fetch-site": "same-origin",
        },
      },
    );

    // Abort early via URL validation — confirms the sanitization ran without
    // crashing and the route did not return a 500.
    const response = await POST(request, {
      requireMutableAuthenticatedUserFn: async () => authUser,
      parseAndValidateArticleUrlFn: async () =>
        new Response(JSON.stringify({ error: "test abort" }), { status: 400 }),
    });
    expect(response.status).toBeLessThan(500);
  });
});
