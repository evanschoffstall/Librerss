import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site"]);

export function requireSameOrigin(request: Request): NextResponse | null {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return null;
  }

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && !ALLOWED_FETCH_SITES.has(secFetchSite)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  // Use the Host header to derive the expected origin, since request.url may
  // resolve to 0.0.0.0 when Next.js listens on all interfaces (e.g. WSL2).
  const host = request.headers.get("host");
  if (!host) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const requestUrl = new URL(request.url);
    const expectedOrigin = `${requestUrl.protocol}//${host}`.toLowerCase();
    if (origin) {
      const normalizedOrigin = new URL(origin).origin.toLowerCase();
      if (normalizedOrigin !== expectedOrigin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    }

    if (referer) {
      const normalizedRefererOrigin = new URL(referer).origin.toLowerCase();
      if (normalizedRefererOrigin !== expectedOrigin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
