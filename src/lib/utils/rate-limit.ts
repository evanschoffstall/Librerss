import { logger } from "@/lib/utils/logger";
import { NextResponse } from "next/server";

interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limiter
 * For production with multiple servers, use Redis-based rate limiting
 */
class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  // Clean up expired entries every 5 minutes
  constructor() {
    this.cleanupTimer = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000,
    );

    // In Node.js, unref() prevents the interval from keeping the process alive
    // when it is the only remaining handle — important during tests and
    // hot-module reload where the module may be discarded before the timer fires.
    this.cleanupTimer.unref();
  }

  /** Cancels the periodic cleanup interval. Call during test teardown. */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }
  }

  private getClientIdentifier(request: Request): string {
    // A client can forge any left-hand entries in X-Forwarded-For. The
    // rightmost entry is appended by the last trusted proxy (i.e. your load
    // balancer), making it the safest value to key on.
    //
    // TRUSTED_PROXY_COUNT (default: 1) — number of proxy hops you control.
    // Set to 0 in direct-to-internet deployments where no proxy header is
    // present; all clients will share a single "unknown" bucket in that case.
    const trustedProxies = Math.max(
      0,
      Number(process.env.TRUSTED_PROXY_COUNT ?? "1"),
    );

    if (trustedProxies > 0) {
      const forwarded = request.headers.get("x-forwarded-for");
      if (forwarded) {
        const ips = forwarded
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        // Strip the last (trustedProxies - 1) proxy-appended entries;
        // what remains at the tail is the real client IP.
        const clientIp = ips[ips.length - trustedProxies];
        if (clientIp) return clientIp;
      }

      const realIp = request.headers.get("x-real-ip")?.trim();
      if (realIp) return realIp;
    }

    // No usable proxy header — bucket all unidentified clients together.
    // User-agent is intentionally NOT used: a shared UA across many genuine
    // users funnels them into one bucket; a bot that picks a unique UA escapes.
    return "unknown";
  }

  check(
    request: Request,
    key: string,
    config: RateLimitConfig,
  ): NextResponse | null {
    const clientId = this.getClientIdentifier(request);
    const rateLimitKey = `${key}:${clientId}`;
    const now = Date.now();

    const entry = this.store.get(rateLimitKey);

    // No entry or expired entry
    if (!entry || entry.resetAt < now) {
      this.store.set(rateLimitKey, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return null;
    }

    // Increment count
    entry.count += 1;

    // Check if limit exceeded
    if (entry.count > config.maxAttempts) {
      const resetInSeconds = Math.ceil((entry.resetAt - now) / 1000);

      logger.warn("Rate limit exceeded", {
        key,
        clientId,
        count: entry.count,
        maxAttempts: config.maxAttempts,
      });

      return NextResponse.json(
        {
          error: `Too many requests. Please try again in ${resetInSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(resetInSeconds),
            "X-RateLimit-Limit": String(config.maxAttempts),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(entry.resetAt),
          },
        },
      );
    }

    return null;
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();
