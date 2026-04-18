import { describe, expect, test } from "bun:test";

import { RateLimiter } from "@/lib/server/rate-limit";

describe("RateLimiter", () => {
  test("allows requests under limit", () => {
    const limiter = new RateLimiter();

    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const config = { maxAttempts: 5, windowMs: 60000 };

    const result1 = limiter.check(request, "test", config);
    expect(result1).toBeNull();

    const result2 = limiter.check(request, "test", config);
    expect(result2).toBeNull();

    limiter.destroy();
  });

  test("blocks requests over limit", () => {
    const limiter = new RateLimiter();

    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.5" },
    });

    const config = { maxAttempts: 2, windowMs: 60000 };

    limiter.check(request, "test", config);
    limiter.check(request, "test", config);
    const result = limiter.check(request, "test", config);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.status).toBe(429);
    }

    limiter.destroy();
  });

  test("resets counter after window expires", () => {
    const limiter = new RateLimiter();

    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.6" },
    });

    const config = { maxAttempts: 1, windowMs: 10 };

    limiter.check(request, "test", config);
    const blocked = limiter.check(request, "test", config);
    expect(blocked).not.toBeNull();

    // Wait for window to expire
    return new Promise((resolve) => {
      setTimeout(() => {
        const allowed = limiter.check(request, "test", config);
        expect(allowed).toBeNull();
        limiter.destroy();
        resolve(undefined);
      }, 15);
    });
  });

  test("extracts client IP from x-forwarded-for with trusted proxy count", () => {
    const limiter = new RateLimiter();

    const request1 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "10.0.0.1, 192.168.1.1" },
    });

    const request2 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "10.0.0.2, 192.168.1.1" },
    });

    const config = { maxAttempts: 1, windowMs: 60000 };

    limiter.check(request1, "test", config);
    const blocked = limiter.check(request1, "test", config);
    expect(blocked).not.toBeNull();

    // Different IP should not be blocked
    const allowed = limiter.check(request2, "test", config);
    expect(allowed).toBeNull();

    limiter.destroy();
  });

  test("treats all requests as unknown when TRUSTED_PROXY_COUNT is 0", () => {
    const previous = process.env.TRUSTED_PROXY_COUNT;
    process.env.TRUSTED_PROXY_COUNT = "0";

    try {
      const limiter = new RateLimiter();
      const config = { maxAttempts: 1, windowMs: 60000 };

      const request1 = new Request("https://example.com", {
        headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
      });
      const request2 = new Request("https://example.com", {
        headers: { "x-forwarded-for": "198.51.100.2, 10.0.0.1" },
      });

      expect(limiter.check(request1, "test", config)).toBeNull();
      const blocked = limiter.check(request2, "test", config);
      expect(blocked).not.toBeNull();

      limiter.destroy();
    } finally {
      if (previous !== undefined) {
        process.env.TRUSTED_PROXY_COUNT = previous;
      } else {
        delete process.env.TRUSTED_PROXY_COUNT;
      }
    }
  });

  test("extracts client IP correctly when TRUSTED_PROXY_COUNT is 2", () => {
    const previous = process.env.TRUSTED_PROXY_COUNT;
    process.env.TRUSTED_PROXY_COUNT = "2";

    try {
      const limiter = new RateLimiter();
      const config = { maxAttempts: 1, windowMs: 60000 };

      const request1 = new Request("https://example.com", {
        headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.2, 10.0.0.3" },
      });
      const request2 = new Request("https://example.com", {
        headers: { "x-forwarded-for": "198.51.100.20, 10.0.0.2, 10.0.0.3" },
      });

      expect(limiter.check(request1, "test", config)).toBeNull();
      expect(limiter.check(request2, "test", config)).toBeNull();

      const blockedFirst = limiter.check(request1, "test", config);
      expect(blockedFirst).not.toBeNull();

      limiter.destroy();
    } finally {
      if (previous !== undefined) {
        process.env.TRUSTED_PROXY_COUNT = previous;
      } else {
        delete process.env.TRUSTED_PROXY_COUNT;
      }
    }
  });

  test("falls back to unknown when TRUSTED_PROXY_COUNT exceeds x-forwarded-for chain length", () => {
    const previous = process.env.TRUSTED_PROXY_COUNT;
    process.env.TRUSTED_PROXY_COUNT = "3";

    try {
      const limiter = new RateLimiter();
      const config = { maxAttempts: 1, windowMs: 60000 };

      const request1 = new Request("https://example.com", {
        headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.5" },
      });
      const request2 = new Request("https://example.com", {
        headers: { "x-forwarded-for": "198.51.100.20, 10.0.0.6" },
      });

      expect(limiter.check(request1, "test", config)).toBeNull();
      const blocked = limiter.check(request2, "test", config);
      expect(blocked).not.toBeNull();

      limiter.destroy();
    } finally {
      if (previous !== undefined) {
        process.env.TRUSTED_PROXY_COUNT = previous;
      } else {
        delete process.env.TRUSTED_PROXY_COUNT;
      }
    }
  });

  test("does not trust x-real-ip when x-forwarded-for is absent", () => {
    const limiter = new RateLimiter();

    const request = new Request("https://example.com", {
      headers: { "x-real-ip": "8.8.8.8" },
    });

    const config = { maxAttempts: 1, windowMs: 60000 };

    expect(limiter.check(request, "test", config)).toBeNull();
    const blocked = limiter.check(request, "test", config);
    expect(blocked).not.toBeNull();

    limiter.destroy();
  });

  test("falls back to unknown when no valid IP headers present", () => {
    const limiter = new RateLimiter();

    const request1 = new Request("https://example.com");
    const request2 = new Request("https://example.com");

    const config = { maxAttempts: 1, windowMs: 60000 };

    limiter.check(request1, "test", config);
    // Both should share the same "unknown" bucket
    const blocked = limiter.check(request2, "test", config);
    expect(blocked).not.toBeNull();

    limiter.destroy();
  });

  test("cleanup removes expired entries", () => {
    const limiter = new RateLimiter();

    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.7" },
    });

    const config = { maxAttempts: 1, windowMs: 10 };

    limiter.check(request, "test", config);

    return new Promise((resolve) => {
      setTimeout(() => {
        // Trigger cleanup by checking again after expiry
        const result = limiter.check(request, "test", config);
        expect(result).toBeNull();
        limiter.destroy();
        resolve(undefined);
      }, 15);
    });
  });

  test("separates rate limits by key", () => {
    const limiter = new RateLimiter();

    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.8" },
    });

    const config = { maxAttempts: 1, windowMs: 60000 };

    limiter.check(request, "key1", config);
    const blocked1 = limiter.check(request, "key1", config);
    expect(blocked1).not.toBeNull();

    // Different key should not be blocked
    const allowed = limiter.check(request, "key2", config);
    expect(allowed).toBeNull();

    limiter.destroy();
  });

  test("skipClientId uses key verbatim – requests with different IPs share one bucket", () => {
    const limiter = new RateLimiter();
    const config = { maxAttempts: 1, windowMs: 60000 };

    // Two requests from entirely different IPs should share the SAME bucket
    // when skipClientId=true (user-scoped key that already encodes identity).
    const req1 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.1.1.1, 10.0.0.1" },
    });
    const req2 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "2.2.2.2, 10.0.0.1" },
    });

    // First request: allowed
    expect(limiter.check(req1, "user-scoped:user:77", config, true)).toBeNull();
    // Second request from a DIFFERENT IP but same verbatim key: blocked
    const blocked = limiter.check(req2, "user-scoped:user:77", config, true);
    expect(blocked).not.toBeNull();
    if (blocked) expect(blocked.status).toBe(429);

    limiter.destroy();
  });

  test("skipClientId=false (default) splits different IPs into separate buckets", () => {
    const limiter = new RateLimiter();
    const config = { maxAttempts: 1, windowMs: 60000 };

    const req1 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "3.3.3.3, 10.0.0.1" },
    });
    const req2 = new Request("https://example.com", {
      headers: { "x-forwarded-for": "4.4.4.4, 10.0.0.1" },
    });

    limiter.check(req1, "ip-scoped", config);
    limiter.check(req1, "ip-scoped", config); // exhausted for 3.3.3.3

    // req1 is now blocked
    expect(limiter.check(req1, "ip-scoped", config)).not.toBeNull();
    // req2 (different IP) is still allowed
    expect(limiter.check(req2, "ip-scoped", config)).toBeNull();

    limiter.destroy();
  });

  test("skipClientId=true different users have independent buckets", () => {
    const limiter = new RateLimiter();
    const config = { maxAttempts: 1, windowMs: 60000 };
    const req = new Request("https://example.com");

    limiter.check(req, "feed-batch:user:1", config, true);
    const blocked = limiter.check(req, "feed-batch:user:1", config, true);
    expect(blocked).not.toBeNull();

    // User 2 has its own independent bucket
    expect(limiter.check(req, "feed-batch:user:2", config, true)).toBeNull();

    limiter.destroy();
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

// ── lib/server/rate-limit – remaining uncovered branches ─────────────────────

describe("lib/server/rate-limit – edge cases", () => {
  test("rateLimiter.check returns null when limit not exceeded", async () => {
    const { rateLimiter } = await import("@/lib/server/rate-limit");
    const { createMockRequest } = await import("./support/test-utils");

    const req = createMockRequest("https://example.com/api/test", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });

    const result = rateLimiter.check(req, "test-rate-limit-key", {
      maxAttempts: 100,
      windowMs: 60_000,
    });

    expect(result).toBeNull();
  });
});

// ── lib/server/rate-limit – cleanup() private method coverage ─────────────────

describe("lib/server/rate-limit – cleanup purges expired entries", () => {
  test("cleanup removes entries whose resetAt is in the past", async () => {
    const { RateLimiter } = await import("@/lib/server/rate-limit");
    const limiter = new RateLimiter();

    // Exhaust rate limit — creates an entry
    const { createMockRequest } = await import("./support/test-utils");
    limiter.check(
      createMockRequest("https://example.com/test", {
        headers: { "x-forwarded-for": "203.0.113.99" },
      }),
      "cleanup-test-key",
      { maxAttempts: 0, windowMs: 1 },
    );

    // Wait for expiry then call cleanup via internal timer trick
    const store = (limiter as any).store as Map<string, any>;
    const entriesBefore = store.size;
    expect(entriesBefore).toBeGreaterThan(0);

    // Manually trigger cleanup
    await new Promise((r) => setTimeout(r, 10));
    (limiter as any).cleanup();

    expect(store.size).toBe(0);
    limiter.destroy();
  });
});
