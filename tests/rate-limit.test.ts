import { RateLimiter } from "@/lib/server";
import { describe, expect, test } from "bun:test";

describe("RateLimiter", () => {
  test("allows requests under limit", () => {
    const limiter = new RateLimiter();

    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const config = { windowMs: 60000, maxAttempts: 5 };

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

    const config = { windowMs: 60000, maxAttempts: 2 };

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

    const config = { windowMs: 10, maxAttempts: 1 };

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

    const config = { windowMs: 60000, maxAttempts: 1 };

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
      const config = { windowMs: 60000, maxAttempts: 1 };

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
      const config = { windowMs: 60000, maxAttempts: 1 };

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
      const config = { windowMs: 60000, maxAttempts: 1 };

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

    const config = { windowMs: 60000, maxAttempts: 1 };

    expect(limiter.check(request, "test", config)).toBeNull();
    const blocked = limiter.check(request, "test", config);
    expect(blocked).not.toBeNull();

    limiter.destroy();
  });

  test("falls back to unknown when no valid IP headers present", () => {
    const limiter = new RateLimiter();

    const request1 = new Request("https://example.com");
    const request2 = new Request("https://example.com");

    const config = { windowMs: 60000, maxAttempts: 1 };

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

    const config = { windowMs: 10, maxAttempts: 1 };

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

    const config = { windowMs: 60000, maxAttempts: 1 };

    limiter.check(request, "key1", config);
    const blocked1 = limiter.check(request, "key1", config);
    expect(blocked1).not.toBeNull();

    // Different key should not be blocked
    const allowed = limiter.check(request, "key2", config);
    expect(allowed).toBeNull();

    limiter.destroy();
  });
});
