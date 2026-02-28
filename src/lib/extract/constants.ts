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
export const EXTRACT_FINGERPRINT_POOL = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa:
      '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    secChUaPlatform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa:
      '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    secChUaPlatform: '"macOS"',
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    secChUa:
      '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    secChUaPlatform: '"Linux"',
  },
] as const;

// Fingerprint pool index 0 is the canonical default used by injected callers (tests/overrides).
export const ARTICLE_EXTRACT_SEC_CH_UA = EXTRACT_FINGERPRINT_POOL[0].secChUa;

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
