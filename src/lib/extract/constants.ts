// ══════════════════════════════════════════════════════════════════════════════
// Extraction Configuration
// ══════════════════════════════════════════════════════════════════════════════

const EXTRACT = {
  cacheMaxEntries: 500,
  cacheTtlMs: 10 * 60 * 1000,
  cacheVersion: 2,
  errors: {
    extraction: "Failed to extract article content",
    upstreamFetch: "Failed to fetch article content from upstream",
    upstreamRequest: "Upstream request failed",
  },
  retries403: 0,
} as const;

/**
 * Additional HTTPCloak retries for article extraction after the initial
 * attempt. This is pinned to zero so extract failures surface immediately.
 */
export const EXTRACT_403_RETRIES = EXTRACT.retries403;
export const ARTICLE_EXTRACT_CACHE_VERSION = EXTRACT.cacheVersion;
export const ARTICLE_EXTRACT_CACHE_TTL_MS = EXTRACT.cacheTtlMs;
export const ARTICLE_EXTRACT_CACHE_MAX_ENTRIES = EXTRACT.cacheMaxEntries;

export const ARTICLE_UPSTREAM_FETCH_ERROR_MESSAGE =
  EXTRACT.errors.upstreamFetch;
export const ARTICLE_UPSTREAM_REQUEST_ERROR_MESSAGE =
  EXTRACT.errors.upstreamRequest;
export const ARTICLE_EXTRACTION_ERROR_MESSAGE = EXTRACT.errors.extraction;

// ─── Module types (merged from types.ts) ─────────────────────────────────────

export interface CachedExtractResponse {
  expiresAt: number;
  payload: ExtractResponsePayload;
  version?: number;
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
