import { NextRequest, NextResponse } from "next/server";

import { rateLimiter } from "./lib/server/rate-limit";

/**
 * Next.js proxy for request interception, rate limiting, and security
 * hardening.
 *
 * Next.js 16 renamed the file convention from `middleware.ts` to `proxy.ts`.
 * This file must stay at `src/proxy.ts` and export `proxy` so the framework
 * discovers it automatically.
 *
 * Applies universal protections to all matched routes:
 * 1. Rate limiting (per-client IP)
 * 2. Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
 *
 * Note: CSP is handled in next.config.ts to avoid conflicts with Next.js
 * style injection. The headers below intentionally mirror the existing app
 * policy for dynamic routes handled by the proxy runtime.
 */
export function proxy(request: NextRequest) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const rateLimitDisabledInDev =
    process.env.RATE_LIMIT_DISABLED_IN_DEV === "true";
  const shouldSkipRateLimit = isDevelopment && rateLimitDisabledInDev;

  if (!shouldSkipRateLimit) {
    const rateLimitWindowMs = Number(
      process.env.RATE_LIMIT_PROXY_WINDOW_MS ?? "60000",
    );
    const rateLimitMaxRequests = Number(
      process.env.RATE_LIMIT_PROXY_MAX_REQUESTS ?? "100",
    );

    const rateLimitResponse = rateLimiter.check(request, "proxy-global", {
      maxAttempts: rateLimitMaxRequests,
      windowMs: rateLimitWindowMs,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  const response = NextResponse.next();

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );

  return response;
}

/**
 * Apply to all dynamic routes except static assets and internal Next.js
 * infrastructure paths.
 */
export const config = {
  matcher: [
    {
      missing: [
        { key: "next-router-prefetch", type: "header" },
        { key: "purpose", type: "header", value: "prefetch" },
      ],
      source: "/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)",
    },
  ],
};
