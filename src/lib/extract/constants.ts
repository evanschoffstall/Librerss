import { CHROME } from "@/lib/fetch/constants";

// ══════════════════════════════════════════════════════════════════════════════
// Extraction Configuration
// ══════════════════════════════════════════════════════════════════════════════

const EXTRACT = {
  retries403: 2,
  cacheTtlMs: 10 * 60 * 1000,
  cacheMaxEntries: 500,
  errors: {
    upstreamFetch: "Failed to fetch article content from upstream",
    upstreamRequest: "Upstream request failed",
    extraction: "Failed to extract article content",
  },
} as const;

export const EXTRACT_FINGERPRINT_POOL = [
  {
    ua: CHROME.userAgent,
    secChUa: CHROME.secChUa,
    secChUaPlatform: CHROME.secChUaPlatform,
  },
] as const;

export const PROXY_FINGERPRINT_POOL = [
  {
    chromeVersion: CHROME.version,
    ua: CHROME.userAgent,
    secChUa: CHROME.secChUa,
    accept: CHROME.accept,
  },
] as const;

export const EXTRACT_403_RETRIES = EXTRACT.retries403;
export const ARTICLE_EXTRACT_CACHE_TTL_MS = EXTRACT.cacheTtlMs;
export const ARTICLE_EXTRACT_CACHE_MAX_ENTRIES = EXTRACT.cacheMaxEntries;

export const ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE =
  EXTRACT.errors.upstreamFetch;
export const ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE =
  EXTRACT.errors.upstreamRequest;
export const ARTICLE_EXTRACTION_ERROR_MESSAGE = EXTRACT.errors.extraction;

export const ARTICLE_EXTRACT_SEC_CH_UA = CHROME.secChUa;

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
