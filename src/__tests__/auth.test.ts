/**
 * Unit Tests: Authentication & Session
 * Tests for src/lib/auth/
 */

import { describe, expect, test } from "bun:test";

// ─── Session Management ───────────────────────────────────────────────────────

describe("session", () => {
  test("hashPassword creates v2 prefixed hash", async () => {
    const { hashPassword } = await import("@/lib/auth/session");
    const hash = await hashPassword("TestPass123!");
    expect(hash).toMatch(/^v2:[0-9a-f]+:[0-9a-f]+$/);
  });

  test("hashPassword creates unique hashes for same password", async () => {
    const { hashPassword } = await import("@/lib/auth/session");
    const password = "TestPass123!";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    // Hashes should differ due to unique salts
    expect(hash1).not.toBe(hash2);
  });

  test("verifyPassword validates correct password", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/session");
    const password = "TestPass123!";
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
  });

  test("verifyPassword rejects incorrect password", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/auth/session");
    const hash = await hashPassword("TestPass123!");
    expect(await verifyPassword("WrongPass123!", hash)).toBe(false);
  });

  test("verifyPassword handles legacy v1 hashes", async () => {
    const { verifyPassword } = await import("@/lib/auth/session");
    // This is a pre-computed v1 hash for testing backward compatibility
    // Real production code should only generate v2 hashes
    const legacyHash =
      "0123456789abcdef:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    // Should not throw - just verifies it can handle legacy format
    const result = await verifyPassword("testpass", legacyHash);
    expect(typeof result).toBe("boolean");
  });

  test("SESSION_COOKIE_NAME is defined", async () => {
    const { SESSION_COOKIE_NAME } = await import("@/lib/auth/session");
    expect(SESSION_COOKIE_NAME).toBe("librerss_session");
  });
});

// ─── CSRF Protection ──────────────────────────────────────────────────────────

describe("csrf", () => {
  test("requireSameOrigin allows same-origin requests", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        host: "example.com",
      },
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("requireSameOrigin blocks cross-origin requests", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        origin: "https://evil.com",
      },
    });
    const result = requireSameOrigin(request);
    expect(result?.status).toBe(403);
  });

  test("requireSameOrigin allows safe methods", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const request = new Request("https://example.com/api/test", {
      method: "GET",
      headers: {
        origin: "https://evil.com",
      },
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("requireSameOrigin checks Sec-Fetch-Site header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const sameOrigin = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        "sec-fetch-site": "same-origin",
      },
    });
    const crossOrigin = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
      },
    });

    expect(requireSameOrigin(sameOrigin)).toBeNull();
    expect(requireSameOrigin(crossOrigin)?.status).toBe(403);
  });
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────

describe("rate-limit", () => {
  test("RateLimiter allows requests under limit", async () => {
    const { RateLimiter } = await import("@/lib/utils/rate-limit");
    const limiter = new RateLimiter();

    try {
      const request = new Request("https://example.com/api/test");
      const config = { windowMs: 60_000, maxAttempts: 5 };

      // All these should pass
      expect(limiter.check(request, "test", config)).toBeNull();
      expect(limiter.check(request, "test", config)).toBeNull();
      expect(limiter.check(request, "test", config)).toBeNull();
    } finally {
      limiter.destroy();
    }
  });

  test("RateLimiter blocks requests over limit", async () => {
    const { RateLimiter } = await import("@/lib/utils/rate-limit");
    const limiter = new RateLimiter();

    try {
      const request = new Request("https://example.com/api/test");
      const config = { windowMs: 60_000, maxAttempts: 2 };

      expect(limiter.check(request, "test", config)).toBeNull();
      expect(limiter.check(request, "test", config)).toBeNull();

      // This should be blocked
      const blocked = limiter.check(request, "test", config);
      expect(blocked?.status).toBe(429);
    } finally {
      limiter.destroy();
    }
  });

  test("RateLimiter uses client IP", async () => {
    const { RateLimiter } = await import("@/lib/utils/rate-limit");
    const limiter = new RateLimiter();

    try {
      const config = { windowMs: 60_000, maxAttempts: 1 };

      const request1 = new Request("https://example.com/api/test", {
        headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
      });
      const request2 = new Request("https://example.com/api/test", {
        headers: { "x-forwarded-for": "192.168.1.2, 10.0.0.1" },
      });

      // Different IPs should be tracked separately
      expect(limiter.check(request1, "test", config)).toBeNull();
      expect(limiter.check(request2, "test", config)).toBeNull();
    } finally {
      limiter.destroy();
    }
  });

  test("RateLimiter resets after window", async () => {
    const { RateLimiter } = await import("@/lib/utils/rate-limit");
    const limiter = new RateLimiter();

    try {
      const request = new Request("https://example.com/api/test");
      const config = { windowMs: 100, maxAttempts: 1 };

      expect(limiter.check(request, "test", config)).toBeNull();

      // Should be blocked immediately
      expect(limiter.check(request, "test", config)?.status).toBe(429);

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      expect(limiter.check(request, "test", config)).toBeNull();
    } finally {
      limiter.destroy();
    }
  });
});
