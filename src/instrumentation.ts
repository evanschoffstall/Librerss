/**
 * Next.js instrumentation hook — runs once when the server starts, after env
 * files are loaded but before any request handler executes.
 *
 * Validates that every required environment variable is present so
 * misconfiguration surfaces as a clear startup error instead of a cryptic
 * runtime failure on the first request that reads a missing key.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

const REQUIRED_ENV_KEYS = [
  "DNS_CACHE_MAX_ENTRIES",
  "DNS_CACHE_TTL_MS",
  "DNS_LOOKUP_TIMEOUT_MS",
  "FEED_BATCH_CONCURRENCY",
  "FEED_BATCH_MAX_URLS",
  "FEED_CACHE_TTL_MINUTES",
  "FEED_FORCE_REFRESH_TTL_MINUTES",
  "FEED_REFRESH_DIAGNOSTICS_ENABLED",
  "FEED_REQUEST_ACCEPT",
  "FEED_REQUEST_TIMEOUT_MS",
  "FEED_REQUEST_USER_AGENT",
  "LOG_LEVEL",
  "MAX_ALL_ARTICLES_LIMIT",
  "MAX_ARTICLE_CONSECUTIVE_BLANK_LINES",
  "MAX_ARTICLE_CONTENT_LENGTH",
  "MAX_ARTICLE_TITLE_LENGTH",
  "MAX_ARTICLES_PER_FEED",
  "MAX_CATEGORY_NAME_LENGTH",
  "MAX_EMAIL_LENGTH",
  "MAX_FEED_NAME_LENGTH",
  "MAX_FEED_RESPONSE_SIZE_BYTES",
  "MAX_JSON_BODY_BYTES",
  "MAX_SESSIONS_PER_USER",
  "MIN_ARTICLE_IMAGE_HEIGHT_PX",
  "MIN_ARTICLE_IMAGE_WIDTH_PX",
  "OPML_MAX_IMPORT_ENTRIES",
  "PASSWORD_COMPLEXITY_REQUIRED_TYPES",
  "PASSWORD_MAX_LENGTH",
  "PASSWORD_MIN_LENGTH",
  "RATE_LIMIT_EXTRACT_MAX_REQUESTS",
  "RATE_LIMIT_EXTRACT_WINDOW_MS",
  "RATE_LIMIT_FEED_BATCH_MAX_REQUESTS",
  "RATE_LIMIT_FEED_BATCH_WINDOW_MS",
  "RATE_LIMIT_FEED_MAX_REQUESTS",
  "RATE_LIMIT_FEED_WINDOW_MS",
  "RATE_LIMIT_LOGIN_MAX_ATTEMPTS",
  "RATE_LIMIT_LOGIN_WINDOW_MS",
  "RATE_LIMIT_PROXY_COMPATIBILITY_MAX_ATTEMPTS",
  "RATE_LIMIT_PROXY_COMPATIBILITY_WINDOW_MS",
  "RATE_LIMIT_SIGNUP_MAX_ATTEMPTS",
  "RATE_LIMIT_SIGNUP_WINDOW_MS",
  "SESSION_DURATION_DAYS",
] as const;

export function register() {
  const missing = REQUIRED_ENV_KEYS.filter(
    (key) => !process.env[key] || process.env[key].trim() === "",
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables at server startup:\n` +
        missing.map((key) => `  - ${key}`).join("\n") +
        `\n\nEnsure these are set in .env, .env.local, or your deployment dashboard.`,
    );
  }
}
