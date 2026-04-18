import { forbiddenResponse } from "@/lib/api/http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site"]);

/**
 * @param request
 */
export function requireSameOrigin(request: Request): null | Response {
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

  if (allowsSameSiteFallback(origin, referer, secFetchSite)) {
    return null;
  }

  try {
    // Use Host-derived origin because request.url may resolve to 0.0.0.0.
    const expectedOrigin = getExpectedOrigin(request);
    if (!expectedOrigin) {
      return forbiddenResponse();
    }

    const candidateOrigin = getOriginCandidate(origin, referer);
    if (!candidateOrigin) {
      return forbiddenResponse();
    }

    return isSameOrigin(candidateOrigin, expectedOrigin)
      ? null
      : forbiddenResponse();
  } catch {
    return forbiddenResponse();
  }
}

/**
 * @param origin
 * @param referer
 * @param secFetchSite
 */
function allowsSameSiteFallback(
  origin: null | string,
  referer: null | string,
  secFetchSite: null | string,
): boolean {
  return (
    !origin &&
    !referer &&
    typeof secFetchSite === "string" &&
    ALLOWED_FETCH_SITES.has(secFetchSite)
  );
}

/**
 * @param request
 */
function getExpectedOrigin(request: Request): null | string {
  const host = request.headers.get("host");
  if (!host) {
    return null;
  }

  const requestUrl = new URL(request.url);
  return new URL(`${requestUrl.protocol}//${host}`).origin.toLowerCase();
}

/**
 * @param origin
 * @param referer
 */
function getOriginCandidate(
  origin: null | string,
  referer: null | string,
): null | string {
  return origin ?? referer;
}

/**
 * @param value
 * @param expectedOrigin
 */
function isSameOrigin(value: string, expectedOrigin: string): boolean {
  return new URL(value).origin.toLowerCase() === expectedOrigin;
}
