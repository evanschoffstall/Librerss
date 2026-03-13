import { CHROME } from "@/lib/fetch/constants";

// ══════════════════════════════════════════════════════════════════════════════
// Extraction Configuration
// ══════════════════════════════════════════════════════════════════════════════

const EXTRACT = {
  cacheMaxEntries: 500,
  cacheTtlMs: 10 * 60 * 1000,
  errors: {
    extraction: "Failed to extract article content",
    upstreamFetch: "Failed to fetch article content from upstream",
    upstreamRequest: "Upstream request failed",
  },
  retries403: 2,
} as const;

export const EXTRACT_FINGERPRINT_POOL = [
  {
    secChUa: CHROME.secChUa,
    secChUaPlatform: CHROME.secChUaPlatform,
    ua: CHROME.userAgent,
  },
] as const;

export const PROXY_FINGERPRINT_POOL = [
  {
    accept: CHROME.accept,
    chromeVersion: CHROME.version,
    secChUa: CHROME.secChUa,
    ua: CHROME.userAgent,
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

export interface CachedExtractResponse {
  expiresAt: number;
  payload: ExtractResponsePayload;
}

export interface ExtractRequestContext {
  extractAttemptId: string;
  requestId: null | string;
}

export interface ExtractResponsePayload {
  content: string;
  source: null | string;
  title: null | string;
}

export interface PlaceholderSnapshotHit {
  html: string;
  snapshotPath: string;
}
