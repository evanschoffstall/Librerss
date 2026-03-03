/**
 * Environment helpers.
 * This module intentionally avoids a centralized per-key config registry.
 *
 * NEXT_PUBLIC_* variables must be referenced via their literal
 * `process.env.NEXT_PUBLIC_*` token — Next.js inlines them at build time
 * and dynamic key lookup does not work.  The `requireEnvValue` +
 * `parseEnvNumber` / `parseEnvBoolean` helpers let client-safe accessors
 * share parsing logic with the server helpers without duplicating it.
 */

export const isDevelopment = process.env.NODE_ENV === "development";

export const ENV = {
  isDevelopment,
} as const;

// ── Low-level parsers (shared by server + client accessors) ──────────────────

function requireEnvValue(value: string | undefined, key: string): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function parseEnvNumber(value: string, key: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${key}`);
  }

  return parsed;
}

function parseEnvBoolean(value: string, key: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment variable: ${key}`);
}

// ── Server env accessors (dynamic key lookup) ────────────────────────────────

const envString = (key: string): string =>
  requireEnvValue(process.env[key], key);

const envNumber = (key: string): number => parseEnvNumber(envString(key), key);

const envBoolean = (key: string): boolean =>
  parseEnvBoolean(envString(key), key);

/**
 * Reads an optional boolean env variable, returning `defaultValue` when the
 * key is missing or empty.  Uses the same true/false vocabulary as
 * {@link envBoolean} ("1", "true", "yes", "on" / "0", "false", "no", "off").
 */
export const envBooleanOptional = (
  key: string,
  defaultValue: boolean,
): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return defaultValue;
  return parseEnvBoolean(raw, key);
};

const envEnum = <T extends string>(
  key: string,
  allowedValues: readonly T[],
): T => {
  const value = envString(key);

  if (!allowedValues.includes(value as T)) {
    throw new Error(
      `Invalid environment variable ${key}; expected one of: ${allowedValues.join(", ")}`,
    );
  }

  return value as T;
};

const getLogLevel = (): "none" | "error" | "warn" | "info" | "verbose" =>
  envEnum("LOG_LEVEL", ["none", "error", "warn", "info", "verbose"] as const);

// ── Client env accessors (literal NEXT_PUBLIC_* references) ──────────────────

export const clientFeedCacheTtlMinutes = (): number => {
  const key = "NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES";
  return parseEnvNumber(
    requireEnvValue(process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES, key),
    key,
  );
};

export const clientFeedRefreshDiagnosticsEnabled = (): boolean => {
  const key = "NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED";
  return parseEnvBoolean(
    requireEnvValue(
      process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED,
      key,
    ),
    key,
  );
};

export const maxArticleConsecutiveBlankLines = (): number => {
  const clientKey = "NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES";
  const clientValue =
    process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;

  if (clientValue !== undefined && clientValue.trim() !== "") {
    return parseEnvNumber(requireEnvValue(clientValue, clientKey), clientKey);
  }

  return envNumber("MAX_ARTICLE_CONSECUTIVE_BLANK_LINES");
};

const resolveConfigValue = (key: string): unknown => {
  if (key === "LOG_LEVEL") {
    return getLogLevel();
  }

  if (key.endsWith("_USER_AGENT") || key.endsWith("_ACCEPT")) {
    return envString(key);
  }

  if (key.endsWith("_ENABLED")) {
    return envBoolean(key);
  }

  return envNumber(key);
};

// CONFIG uses a Proxy for dynamic env key resolution. Each key returns a type
// based on its suffix convention (_ENABLED → boolean, _MAX_ → number, etc.).
// TypeScript cannot express per-key return types on runtime Proxy traps, so we
// use a mapped type with known keys + an index signature fallback. This
// satisfies the no-boundary-any requirement while preserving runtime flexibility.

type ConfigKeys = {
  // ── Booleans (suffix _ENABLED) ──
  FEED_REFRESH_DIAGNOSTICS_ENABLED: boolean;

  // ── Numbers (various suffixes) ──
  MAX_JSON_BODY_BYTES: number;
  MAX_FEED_NAME_LENGTH: number;
  MAX_CATEGORY_NAME_LENGTH: number;
  PASSWORD_MAX_LENGTH: number;
  PASSWORD_MIN_LENGTH: number;
  PASSWORD_COMPLEXITY_REQUIRED_TYPES: number;
  MAX_EMAIL_LENGTH: number;
  SESSION_DURATION_DAYS: number;
  MAX_SESSIONS_PER_USER: number;
  RATE_LIMIT_FEED_WINDOW_MS: number;
  RATE_LIMIT_FEED_MAX_REQUESTS: number;
  RATE_LIMIT_AUTH_WINDOW_MS: number;
  RATE_LIMIT_AUTH_MAX_REQUESTS: number;
  RATE_LIMIT_LOGIN_WINDOW_MS: number;
  RATE_LIMIT_LOGIN_MAX_ATTEMPTS: number;
  RATE_LIMIT_SIGNUP_WINDOW_MS: number;
  RATE_LIMIT_SIGNUP_MAX_ATTEMPTS: number;
  RATE_LIMIT_EXTRACT_WINDOW_MS: number;
  RATE_LIMIT_EXTRACT_MAX_REQUESTS: number;
  RATE_LIMIT_FEED_BATCH_WINDOW_MS: number;
  RATE_LIMIT_FEED_BATCH_MAX_REQUESTS: number;
  FEED_CACHE_TTL_MINUTES: number;
  FEED_FORCE_REFRESH_TTL_MINUTES: number;
  FEED_REQUEST_TIMEOUT_MS: number;
  FEED_MAX_REDIRECTS: number;
  FEED_BATCH_CONCURRENCY: number;
  FEED_BATCH_MAX_URLS: number;
  MAX_ARTICLES_PER_FEED: number;
  MAX_ALL_ARTICLES_LIMIT: number;
  MAX_ARTICLE_CONSECUTIVE_BLANK_LINES: number;
  MAX_ARTICLE_TITLE_LENGTH: number;
  MAX_ARTICLE_CONTENT_LENGTH: number;
  MAX_FEED_RESPONSE_SIZE_BYTES: number;
  MIN_ARTICLE_IMAGE_WIDTH_PX: number;
  MIN_ARTICLE_IMAGE_HEIGHT_PX: number;
  DNS_LOOKUP_TIMEOUT_MS: number;
  DNS_CACHE_TTL_MS: number;
  DNS_CACHE_MAX_ENTRIES: number;
  GREADER_MAX_STREAM_ITEMS: number;
  GREADER_DEFAULT_STREAM_ITEMS: number;
  GREADER_NETNEWSWIRE_MAX_ITEMS: number;
  OPML_MAX_IMPORT_ENTRIES: number;

  // ── Strings (user agent, accept headers) ──
  FEED_REQUEST_USER_AGENT: string;
  FEED_REQUEST_ACCEPT: string;

  // ── Enum ──
  LOG_LEVEL: "none" | "error" | "warn" | "info" | "verbose";
};

export const CONFIG = new Proxy<ConfigKeys & Record<string, unknown>>(
  {} as ConfigKeys & Record<string, unknown>,
  {
    get: (_target, property) => {
      if (typeof property !== "string") {
        return undefined;
      }

      return resolveConfigValue(property);
    },
  },
) as ConfigKeys;
