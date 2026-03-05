export const ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE =
  "Failed to fetch article content from upstream";
export const ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE = "Upstream request failed";
export const ARTICLE_EXTRACTION_ERROR_MESSAGE =
  "Failed to extract article content";

export const ARTICLE_EXTRACT_CACHE_TTL_MS = 10 * 60 * 1000;
export const ARTICLE_EXTRACT_CACHE_MAX_ENTRIES = 500;

// How many additional attempts to make after the initial try when a 403 is returned.
// Total attempts = 1 + EXTRACT_403_RETRIES. Each retry uses a different UA fingerprint
// and a fresh cookie jar — many bot systems pass the request through on retry once
// they have logged the initial probe.
export const EXTRACT_403_RETRIES = 2;

// Chrome 130 fingerprint pool — Windows, macOS, and Linux variants.
// Rotated on each retry attempt so successive requests look like different users.
// All three share the same sec-ch-ua brand list (only sec-ch-ua-platform differs).
// Chrome 131 pool — Windows, macOS, Linux variants. Aligned with PROXY_FINGERPRINT_POOL
// lead version so both paths present the same generation to bot detectors.
// Chrome 131 uses the "Not A(Brand";v="8" brand token format.
export const EXTRACT_FINGERPRINT_POOL = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="131", "Google Chrome";v="131", "Not A(Brand";v="8"',
    secChUaPlatform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="131", "Google Chrome";v="131", "Not A(Brand";v="8"',
    secChUaPlatform: '"macOS"',
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="131", "Google Chrome";v="131", "Not A(Brand";v="8"',
    secChUaPlatform: '"Linux"',
  },
] as const;

// Fingerprint pool index 0 is the canonical default used by injected callers (tests/overrides).
export const ARTICLE_EXTRACT_SEC_CH_UA = EXTRACT_FINGERPRINT_POOL[0].secChUa;

// Fingerprint pool used by the proxy extraction path (got-scraping).
// Each entry pairs an OS with a Chrome version — got-scraping uses both to generate
// browser-like TLS (JA3) and HTTP/2 fingerprints, giving each attempt a distinct
// network identity.
// Windows first: largest desktop population, least bot-flagged by PerimeterX/Cloudflare
// IP heuristics. Chrome versions are deliberately varied so successive attempts produce
// different JA3 hashes — TLS-level fingerprint rotation rather than UA-only rotation.
// secChUa: the "not-a-brand" token rotates format every few Chrome releases.
// Specifying it explicitly per-version avoids a mismatch between the generated UA and
// the sec-ch-ua header that bot detection uses as a consistency signal.
// accept: Chrome navigation requests always include signed-exchange; omitting it
// is a detectable gap that triggers higher bot scores on Cloudflare and PerimeterX.
export const PROXY_FINGERPRINT_POOL = [
  {
    os: "windows" as const,
    chromeVersion: 131,
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    secChUa: '"Chromium";v="131", "Google Chrome";v="131", "Not A(Brand";v="8"',
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  },
  {
    os: "macos" as const,
    chromeVersion: 130,
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa:
      '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  },
  {
    os: "linux" as const,
    chromeVersion: 128,
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    secChUa:
      '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  },
];

// ─── Module types (merged from types.ts) ─────────────────────────────────────

export type ExtractResponsePayload = {
  content: string;
  title: string | null;
  source: string | null;
};

export type CachedExtractResponse = {
  expiresAt: number;
  payload: ExtractResponsePayload;
};

export type PlaceholderSnapshotHit = {
  html: string;
  snapshotPath: string;
};

export type ExtractRequestContext = {
  extractAttemptId: string;
  requestId: string | null;
};
