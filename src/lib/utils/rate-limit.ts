import { NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";

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

  // Clean up expired entries every 5 minutes
  constructor() {
    setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
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
    // Try to get IP from headers (for proxies/load balancers)
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }

    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
      return realIp;
    }

    // Fallback to user agent as a weak identifier
    return request.headers.get("user-agent") || "unknown";
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
