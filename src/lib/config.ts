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
} as const;

export const CONFIG = {
  // Feed settings
  FEED_REFRESH_DIAGNOSTICS_ENABLED: false,
  // Non-force refresh TTL: feeds older than this are refreshed on the next
  // background/page-load fetch.
  FEED_CACHE_TTL_MINUTES: 15,
  // Force-refresh cooldown: manual refresh requests are capped to at most once
  // per feed per this many minutes.
  FEED_FORCE_REFRESH_TTL_MINUTES: 5,
  FEED_BATCH_MAX_URLS: 64,
  FEED_BATCH_CONCURRENCY: 8,
  // Upstream feeds refresh concurrently inside a batch request.  A long
  // timeout makes the HTTP response wait for the slowest upstream feed.
  // 14 s is a reasonable ceiling: legitimately slow feeds will usually respond
  // by then; truly unresponsive ones stop blocking the batch sooner.
  FEED_REQUEST_TIMEOUT_MS: 14_000,
  MAX_FEED_RESPONSE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  FEED_REQUEST_USER_AGENT:
    process.env.FEED_REQUEST_USER_AGENT ??
    "Mozilla/5.0 (compatible; Librerss/1.0; +https://github.com/evanschoffstall/librerss)",
  FEED_REQUEST_ACCEPT:
    "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",

  // Content limits
  MAX_ARTICLE_CONTENT_LENGTH: 100000, // 100KB per article
  MAX_ARTICLES_PER_FEED: 200, // max articles returned per feed
  MAX_ALL_ARTICLES_LIMIT: 500, // max articles returned by the global /api/articles endpoint
  MAX_ARTICLE_TITLE_LENGTH: 500,
  MAX_ARTICLE_CONSECUTIVE_BLANK_LINES: 3,
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
  RATE_LIMIT_FEED_BATCH_WINDOW_MS: 60 * 1000, // 1 minute
  RATE_LIMIT_FEED_BATCH_MAX_REQUESTS: 20,
  // Article extraction — makes outbound HTTP requests; keep tight to prevent
  // the server being used as an amplification proxy by authenticated users.
  RATE_LIMIT_EXTRACT_WINDOW_MS: 60 * 1000, // 1 minute
  RATE_LIMIT_EXTRACT_MAX_REQUESTS: 10,

  // DNS validation
  DNS_CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  DNS_LOOKUP_TIMEOUT_MS: 3000, // 3 seconds

  // Request parsing
  MAX_JSON_BODY_BYTES: 64 * 1024, // 64KB

  // GReader API
  GREADER_MAX_STREAM_ITEMS: 250,
  GREADER_DEFAULT_STREAM_ITEMS: 50,
  GREADER_NETNEWSWIRE_MAX_ITEMS: 250,

  // Batch operations
  MARK_ALL_READ_LIMIT: 10_000,

  // Caching limits
  DNS_CACHE_MAX_ENTRIES: 10_000,
  MAX_FAVICON_CACHE_ENTRIES: 400,
  FEED_LOADING_FAILSAFE_MS: 20_000,
} as const;
