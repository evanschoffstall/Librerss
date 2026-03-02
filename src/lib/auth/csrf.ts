import { forbiddenResponse } from "@/lib/api/http";
import type { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site"]);

function getExpectedOrigin(request: Request): string | null {
  const host = request.headers.get("host");
  if (!host) {
    return null;
  }

  const requestUrl = new URL(request.url);
  return new URL(`${requestUrl.protocol}//${host}`).origin.toLowerCase();
}

function isSameOrigin(value: string, expectedOrigin: string): boolean {
  return new URL(value).origin.toLowerCase() === expectedOrigin;
}

export function requireSameOrigin(request: Request): NextResponse | null {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return null;
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && !ALLOWED_FETCH_SITES.has(secFetchSite)) {
    return forbiddenResponse();
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (
    !origin &&
    !referer &&
    secFetchSite &&
    ALLOWED_FETCH_SITES.has(secFetchSite)
  ) {
    return null;
  }

  try {
    // Use Host-derived origin because request.url may resolve to 0.0.0.0.
    const expectedOrigin = getExpectedOrigin(request);
    if (!expectedOrigin) {
      return forbiddenResponse();
    }

    if (origin) {
      if (!isSameOrigin(origin, expectedOrigin)) {
        return forbiddenResponse();
      }
      return null;
    }

    if (referer) {
      if (!isSameOrigin(referer, expectedOrigin)) {
        return forbiddenResponse();
      }
      return null;
    }

    return forbiddenResponse();
  } catch {
    return forbiddenResponse();
  }
}
