import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// SECURITY: Prevent memory exhaustion during sustained attacks
const MAX_RATE_LIMIT_ENTRIES = 100000;
const IPV4_SEGMENT_RE = /^\d{1,3}$/;
const IPV6_SEGMENT_RE = /^[\da-f]{1,4}$/i;
const IP_TOKEN_RE = /^[\da-f:.]{1,64}$/i;

/**
 * In-memory rate limiter with bounded size.
 * Evicts expired entries immediately during check() and limits total size.
 * For production with multiple servers, use Redis-based rate limiting.
 */
export class RateLimiter {
  /** Cached once per instance so env is not re-read on every request. */
  private _trustedProxyCount: number | undefined;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;
  private store = new Map<string, RateLimitEntry>();

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
    const cleanupTimer = this.cleanupTimer as unknown as {
      unref?: (() => void) | undefined;
    };
    if (typeof cleanupTimer.unref === "function") {
      cleanupTimer.unref();
    }
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

    // Evict expired entry immediately (don't wait for periodic cleanup)
    if (entry && entry.resetAt < now) {
      this.store.delete(rateLimitKey);
    }

    // No entry or expired entry
    if (!entry || entry.resetAt < now) {
      this.store.set(rateLimitKey, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      // SECURITY: Enforce bound after every insertion to prevent OOM
      this.enforceBound();
      return null;
    }

    // Increment count
    entry.count += 1;

    // Check if limit exceeded
    if (entry.count > config.maxAttempts) {
      const resetInSeconds = Math.ceil((entry.resetAt - now) / 1000);
      const warn =
        typeof logger.warn === "function" ? logger.warn.bind(logger) : undefined;

      warn?.("Rate limit exceeded", {
        clientId,
        count: entry.count,
        key,
        maxAttempts: config.maxAttempts,
      });

      return NextResponse.json(
        {
          error: `Too many requests. Please try again in ${resetInSeconds} seconds.`,
        },
        {
          headers: {
            "Retry-After": String(resetInSeconds),
            "X-RateLimit-Limit": String(config.maxAttempts),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
          },
          status: 429,
        },
      );
    }

    return null;
  }

  /** Cancels the periodic cleanup interval. Call during test teardown. */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  private cleanup(): void {
    const now = Date.now();
    // Snapshot entries to avoid mutation-during-iteration edge cases
    for (const [key, entry] of Array.from(this.store.entries())) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }
  }

  /** Enforce max size by evicting oldest expired entries first, then random */
  private enforceBound(): void {
    if (this.store.size <= MAX_RATE_LIMIT_ENTRIES) return;

    const now = Date.now();
    const entries = Array.from(this.store.entries());

    // First pass: remove all expired
    let removed = 0;
    for (const [key, entry] of entries) {
      if (entry.resetAt < now) {
        this.store.delete(key);
        removed++;
      }
    }

    // Second pass: if still over limit, evict oldest resetAt entries
    if (this.store.size > MAX_RATE_LIMIT_ENTRIES) {
      const remaining = Array.from(this.store.entries()).sort(
        (a, b) => a[1].resetAt - b[1].resetAt,
      );
      const toRemove = remaining.slice(
        0,
        this.store.size - MAX_RATE_LIMIT_ENTRIES,
      );
      for (const [key] of toRemove) {
        this.store.delete(key);
      }
      const warn =
        typeof logger.warn === "function" ? logger.warn.bind(logger) : undefined;
      warn?.("Rate limiter evicted entries to enforce size bound", {
        evicted: toRemove.length,
        expiredRemoved: removed,
      });
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
    if (this._trustedProxyCount === undefined) {
      const raw = Number(process.env.TRUSTED_PROXY_COUNT ?? "1");
      if (!Number.isFinite(raw)) {
        const configuredProxyCount =
          process.env.TRUSTED_PROXY_COUNT ?? "undefined";
        const logError =
          typeof logger.error === "function"
            ? logger.error.bind(logger)
            : undefined;
        logError?.(
          `Invalid TRUSTED_PROXY_COUNT: "${configuredProxyCount}". Defaulting to 1.`,
        );
        this._trustedProxyCount = 1;
        return "unknown";
      }
      this._trustedProxyCount = Math.max(0, raw);
    }
    const trustedProxies = this._trustedProxyCount;

    if (trustedProxies > 0) {
      const forwarded = request.headers.get("x-forwarded-for");
      if (forwarded) {
        const ips = forwarded
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        // Require at least one untrusted client hop in front of the trusted
        // proxy chain. Without this, a client can provide an undersized or
        // malformed chain that would otherwise fall back to a different header.
        if (ips.length <= trustedProxies) {
          return "unknown";
        }

        // XFF is ordered: client, proxy1, proxy2, ..., proxyN.
        // Remove the right-most trusted proxy hops and read the client that
        // precedes them.
        const clientIndex = ips.length - trustedProxies - 1;
        if (clientIndex >= 0) {
          const clientIp = ips[clientIndex];
          if (clientIp && isLikelyIpAddress(clientIp)) {
            return clientIp;
          }
        }

        return "unknown";
      }
    }

    // No usable proxy header — bucket all unidentified clients together.
    // User-agent is intentionally NOT used: a shared UA across many genuine
    // users funnels them into one bucket; an automated client that rotates a
    // unique UA escapes.
    return "unknown";
  }
}

/**
 * Edge-safe, conservative IP token validation.
 *
 * The rate limiter only needs a stable bucket key, not full RFC-perfect IP
 * parsing. False negatives degrade to the shared "unknown" bucket; false
 * positives would let attackers manufacture buckets, so this validator stays
 * intentionally strict.
 */
function isLikelyIpAddress(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || !IP_TOKEN_RE.test(candidate)) {
    return false;
  }

  if (candidate.includes(".")) {
    return isValidIpv4Address(candidate);
  }

  if (candidate.includes(":")) {
    return isValidIpv6Address(candidate);
  }

  return false;
}

function isValidIpv4Address(value: string): boolean {
  const segments = value.split(".");
  if (segments.length !== 4) {
    return false;
  }

  return segments.every((segment) => {
    if (!IPV4_SEGMENT_RE.test(segment)) {
      return false;
    }

    const numeric = Number(segment);
    return numeric >= 0 && numeric <= 255;
  });
}

function isValidIpv6Address(value: string): boolean {
  const normalized = value.trim();
  if (!normalized.includes(":")) {
    return false;
  }

  if (normalized.indexOf("::") !== normalized.lastIndexOf("::")) {
    return false;
  }

  const segments = normalized.split(":");
  if (segments.length < 3 || segments.length > 8) {
    return false;
  }

  if (
    !normalized.includes("::") &&
    segments.some((segment) => segment === "")
  ) {
    return false;
  }

  return segments.every(
    (segment) => segment === "" || IPV6_SEGMENT_RE.test(segment),
  );
}

// Export singleton instance
export const rateLimiter = new RateLimiter();
