import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { rateLimiter } from "@/lib/rate-limit";

import {
  createBlockedRequestResponse,
  matchBlockedRequestPolicy,
} from "./blocked-requests";

/**
 * Process the proxy.
 * @param request - The request.
 * @returns The proxy.
 */
export function proxy(request: NextRequest) {
  if (shouldBypassProxy(request)) {
    return NextResponse.next();
  }

  const blockedRequestPolicy = matchBlockedRequestPolicy(
    request.nextUrl.pathname,
  );

  if (blockedRequestPolicy) {
    return applySecurityHeaders(
      createBlockedRequestResponse(request, blockedRequestPolicy),
    );
  }

  if (!shouldSkipRateLimit()) {
    const rateLimitResponse = rateLimiter.check(
      request,
      "proxy-global",
      getProxyRateLimitConfig(),
    );

    if (rateLimitResponse) {
      return rateLimitResponse;
    }
  }

  return applySecurityHeaders(NextResponse.next());
}

/**
 * Process the apply security headers.
 * @param response - The response.
 * @returns The apply security headers.
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
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
 * Return the proxy rate limit config.
 * @returns The proxy rate limit config.
 */
function getProxyRateLimitConfig() {
  return {
    maxAttempts: Number(process.env.RATE_LIMIT_PROXY_MAX_REQUESTS ?? "100"),
    windowMs: Number(process.env.RATE_LIMIT_PROXY_WINDOW_MS ?? "60000"),
  };
}

/**
 * Return whether should bypass proxy.
 * @param request - The request.
 * @returns Whether should bypass proxy.
 */
function shouldBypassProxy(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.svg"
  ) {
    return true;
  }

  return (
    request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch"
  );
}

/**
 * Return whether should skip rate limit.
 * @returns Whether should skip rate limit.
 */
function shouldSkipRateLimit(): boolean {
  const isDevelopment = process.env.NODE_ENV === "development";
  const rateLimitDisabledInDev =
    process.env.RATE_LIMIT_DISABLED_IN_DEV === "true";

  return isDevelopment && rateLimitDisabledInDev;
}
