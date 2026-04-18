import { NextRequest, NextResponse } from "next/server";

import { rateLimiter } from "@/lib/rate-limit";

import {
  createBlockedRequestResponse,
  matchBlockedRequestPolicy,
} from "./blocked-requests";

/**
 * @param request
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
 * @param response
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
 *
 */
function getProxyRateLimitConfig() {
  return {
    maxAttempts: Number(process.env.RATE_LIMIT_PROXY_MAX_REQUESTS ?? "100"),
    windowMs: Number(process.env.RATE_LIMIT_PROXY_WINDOW_MS ?? "60000"),
  };
}

/**
 * @param request
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
 *
 */
function shouldSkipRateLimit(): boolean {
  const isDevelopment = process.env.NODE_ENV === "development";
  const rateLimitDisabledInDev =
    process.env.RATE_LIMIT_DISABLED_IN_DEV === "true";

  return isDevelopment && rateLimitDisabledInDev;
}
