/**
 * Centralized application configuration
 * All magic numbers and constants should be defined here
 */

/**
 * NODE_ENV convenience flags — safe in both server and client contexts
 * because Next.js inlines process.env.NODE_ENV at build time.
 */
export const ENV = {
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
} as const;

export const CONFIG = {
  // Feed settings
  // Auto-refresh TTL: feeds older than this are refreshed on the next page load.
  // The manual refresh button bypasses this cap via forceRefresh.
  FEED_CACHE_TTL_MINUTES: 5,
  FEED_BATCH_MAX_URLS: 64,
  FEED_BATCH_CONCURRENCY: 8,
  // Upstream feeds refresh concurrently inside a batch request.  A long
  // timeout makes the HTTP response wait for the slowest upstream feed.
  // 7 s is a reasonable ceiling: legitimately slow feeds will usually respond
  // by then; truly unresponsive ones stop blocking the batch sooner.
  FEED_REQUEST_TIMEOUT_MS: 7000,
  MAX_FEED_RESPONSE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB

  // Content limits
  MAX_ARTICLE_CONTENT_LENGTH: 100000, // 100KB per article
  MAX_ARTICLES_PER_FEED: 200, // max articles returned per feed
  MAX_ALL_ARTICLES_LIMIT: 500, // max articles returned by the global /api/articles endpoint
  MAX_ARTICLE_TITLE_LENGTH: 500,
  MAX_FEED_NAME_LENGTH: 255,
  MAX_CATEGORY_NAME_LENGTH: 255,
  OPML_MAX_IMPORT_ENTRIES: 500, // max distinct feed URLs accepted from a single OPML upload

  // Authentication
  SESSION_DURATION_DAYS: 30,
  PASSWORD_MIN_LENGTH: 8,
  // SECURITY: scrypt CPU time scales with password length. Cap at a safe upper
  // bound to prevent DoS via extremely long passwords submitted to /api/auth/*.
  PASSWORD_MAX_LENGTH: 1024,
  PASSWORD_COMPLEXITY_REQUIRED_TYPES: 3, // out of 4 types (upper, lower, number, special)
  MAX_SESSIONS_PER_USER: 5,

  // Email
  MAX_EMAIL_LENGTH: 320, // RFC 5321 maximum

  // Rate limiting
  RATE_LIMIT_LOGIN_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_LOGIN_MAX_ATTEMPTS: 5,
  RATE_LIMIT_SIGNUP_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  RATE_LIMIT_SIGNUP_MAX_ATTEMPTS: 3,
  RATE_LIMIT_FEED_WINDOW_MS: 60 * 1000, // 1 minute
  RATE_LIMIT_FEED_MAX_REQUESTS: 30,
  // Article extraction — makes outbound HTTP requests; keep tight to prevent
  // the server being used as an amplification proxy by authenticated users.
  RATE_LIMIT_EXTRACT_WINDOW_MS: 60 * 1000, // 1 minute
  RATE_LIMIT_EXTRACT_MAX_REQUESTS: 10,

  // DNS validation
  DNS_CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  DNS_LOOKUP_TIMEOUT_MS: 3000, // 3 seconds
} as const;
