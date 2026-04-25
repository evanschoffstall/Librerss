import { forbiddenResponse } from "@/lib/api/http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site"]);

/**
 * Process the require same origin.
 * @param request - The request.
 * @returns The require same origin.
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
 * Process the allows same site fallback.
 * @param origin - The origin.
 * @param referer - The referer.
 * @param secFetchSite - The sec fetch site.
 * @returns Whether allows same site fallback.
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
 * Return the expected origin.
 * @param request - The request.
 * @returns The expected origin.
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
 * Return the origin candidate.
 * @param origin - The origin.
 * @param referer - The referer.
 * @returns The origin candidate.
 */
function getOriginCandidate(
  origin: null | string,
  referer: null | string,
): null | string {
  return origin ?? referer;
}

/**
 * Return whether is same origin.
 * @param value - The value.
 * @param expectedOrigin - The expected origin.
 * @returns Whether is same origin.
 */
function isSameOrigin(value: string, expectedOrigin: string): boolean {
  return new URL(value).origin.toLowerCase() === expectedOrigin;
}
