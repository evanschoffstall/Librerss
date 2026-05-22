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

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = applySecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
  );
  response.headers.set(
    "Content-Security-Policy",
    buildNonceContentSecurityPolicy(nonce),
  );
  return response;
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
 * Builds the per-request Content-Security-Policy header value using a freshly
 * generated nonce so that `'unsafe-inline'` is never needed in `script-src`.
 *
 * `'strict-dynamic'` propagates trust to scripts loaded by nonce-authorised
 * loaders. `'self'` is kept for older browsers that do not understand
 * `'strict-dynamic'`. Development adds `'unsafe-eval'` for React tooling and
 * extends `connect-src` with `ws:`/`wss:` for HMR.
 * @param nonce - Per-request nonce injected into the script policy.
 * @returns The complete CSP header value for the current request.
 */
function buildNonceContentSecurityPolicy(nonce: string): string {
  const isDevelopment = process.env.NODE_ENV === "development";
  const connectSources = ["'self'"];
  const scriptSources = [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'"];

  if (isDevelopment) {
    connectSources.push("ws:", "wss:");
    scriptSources.push("'unsafe-eval'");
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self'",
  ].join("; ");
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
