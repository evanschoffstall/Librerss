import { RateLimiter } from "@/lib/server";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

// Create fresh rate limiter instance for each test
let testRateLimiter: RateLimiter;

beforeEach(() => {
  mock.restore();
  testRateLimiter = new RateLimiter();
});

afterEach(() => {
  mock.restore();
  if (testRateLimiter) {
    testRateLimiter.destroy();
  }
});

describe("Next.js proxy function", () => {
  test("sets all required security headers (except CSP)", async () => {
    const { proxy } = await import("@/proxy");
    const req = new NextRequest("http://localhost:3000/dashboard");

    const res = proxy(req);

    // CSP is handled in next.config.ts, not proxy
    expect(res.headers.get("Content-Security-Policy")).toBeNull();
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("Permissions-Policy")).toContain("geolocation=()");
    expect(res.headers.get("Strict-Transport-Security")).toContain(
      "max-age=31536000",
    );
  });

  test("enforces universal rate limiting", async () => {
    // Mock the module to use our test rate limiter
    mock.module("@/lib/server/rate-limit", () => ({
      rateLimiter: testRateLimiter,
      RateLimiter,
    }));

    // Set aggressive rate limit for this test
    const originalProxyWindow = process.env.RATE_LIMIT_PROXY_WINDOW_MS;
    const originalProxyMax = process.env.RATE_LIMIT_PROXY_MAX_REQUESTS;
    const originalDisabled = process.env.RATE_LIMIT_DISABLED_IN_DEV;
    process.env.RATE_LIMIT_PROXY_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_PROXY_MAX_REQUESTS = "3";
    process.env.RATE_LIMIT_DISABLED_IN_DEV = "false";

    const { proxy } = await import("@/proxy");

    const clientIp = "203.0.113.42";

    try {
      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const req = new NextRequest("http://localhost:3000/dashboard", {
          headers: { "x-forwarded-for": `${clientIp}, 10.0.0.1` },
        });
        const res = proxy(req);
        expect(res.status).not.toBe(429);
      }

      // 4th request should be rate limited
      const req4 = new NextRequest("http://localhost:3000/dashboard", {
        headers: { "x-forwarded-for": `${clientIp}, 10.0.0.1` },
      });
      const res4 = proxy(req4);
      expect(res4.status).toBe(429);
    } finally {
      // Restore env vars
      if (originalProxyWindow !== undefined) {
        process.env.RATE_LIMIT_PROXY_WINDOW_MS = originalProxyWindow;
      }
      if (originalProxyMax !== undefined) {
        process.env.RATE_LIMIT_PROXY_MAX_REQUESTS = originalProxyMax;
      }
      if (originalDisabled !== undefined) {
        process.env.RATE_LIMIT_DISABLED_IN_DEV = originalDisabled;
      }
    }
  });

  test("rate limiting is per-client (different IPs have separate buckets)", async () => {
    mock.module("@/lib/server/rate-limit", () => ({
      rateLimiter: testRateLimiter,
      RateLimiter,
    }));

    const originalProxyWindow = process.env.RATE_LIMIT_PROXY_WINDOW_MS;
    const originalProxyMax = process.env.RATE_LIMIT_PROXY_MAX_REQUESTS;
    const originalDisabled = process.env.RATE_LIMIT_DISABLED_IN_DEV;
    process.env.RATE_LIMIT_PROXY_WINDOW_MS = "60000";
    process.env.RATE_LIMIT_PROXY_MAX_REQUESTS = "2";
    process.env.RATE_LIMIT_DISABLED_IN_DEV = "false";

    const { proxy } = await import("@/proxy");

    const client1 = "203.0.113.10";
    const client2 = "203.0.113.20";

    try {
      // Client 1: exhaust limit
      for (let i = 0; i < 2; i++) {
        const req = new NextRequest("http://localhost:3000/dashboard", {
          headers: { "x-forwarded-for": `${client1}, 10.0.0.1` },
        });
        const res = proxy(req);
        expect(res.status).not.toBe(429);
      }

      // Client 1: should be rate limited
      const req1Limited = new NextRequest("http://localhost:3000/dashboard", {
        headers: { "x-forwarded-for": `${client1}, 10.0.0.1` },
      });
      const res1Limited = proxy(req1Limited);
      expect(res1Limited.status).toBe(429);

      // Client 2: should still have available quota
      const req2 = new NextRequest("http://localhost:3000/dashboard", {
        headers: { "x-forwarded-for": `${client2}, 10.0.0.1` },
      });
      const res2 = proxy(req2);
      expect(res2.status).not.toBe(429);
    } finally {
      if (originalProxyWindow !== undefined) {
        process.env.RATE_LIMIT_PROXY_WINDOW_MS = originalProxyWindow;
      }
      if (originalProxyMax !== undefined) {
        process.env.RATE_LIMIT_PROXY_MAX_REQUESTS = originalProxyMax;
      }
      if (originalDisabled !== undefined) {
        process.env.RATE_LIMIT_DISABLED_IN_DEV = originalDisabled;
      }
    }
  });

  test("handles requests without X-Forwarded-For header", async () => {
    mock.module("@/lib/server/rate-limit", () => ({
      rateLimiter: testRateLimiter,
      RateLimiter,
    }));

    const { proxy } = await import("@/proxy");
    const req = new NextRequest("http://localhost:3000/dashboard");

    const res = proxy(req);

    // Should not crash and should still set security headers
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
