/**
 * Environment helpers.
 *
 * NEXT_PUBLIC_* variables must be referenced via their literal
 * `process.env.NEXT_PUBLIC_*` token — Next.js inlines them at build time
 * and dynamic key lookup does not work.
 *
 * Server-side CONFIG values are resolved lazily through a Proxy that reads
 * `process.env[key]` at access time — no values are captured at module load.
 * Build-time defaults from .env are baked in via next.config.ts `env:`
 * (DefinePlugin) so values are available on Vercel even when .env files
 * are not loaded into process.env at runtime.
 */

/** Resolves development mode at call time so no module caches NODE_ENV early. */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

let cachedBuildTimeDefaults: Record<string, string> = {};
let cachedBuildTimeDefaultsRaw: string | undefined;

/**
 * Reads build-time config defaults injected by next.config.ts via DefinePlugin.
 * The raw JSON blob is memoized by value so repeated accesses are cheap while
 * still tolerating module graphs that load before the env replacement is ready.
 */
const getBuildTimeDefaults = (): Record<string, string> => {
  const raw = process.env.LIBRERSS_BUILD_CONFIG;

  if (raw === cachedBuildTimeDefaultsRaw) {
    return cachedBuildTimeDefaults;
  }

  cachedBuildTimeDefaultsRaw = raw;

  try {
    cachedBuildTimeDefaults = raw
      ? (JSON.parse(raw) as Record<string, string>)
      : {};
  } catch {
    cachedBuildTimeDefaults = {};
  }

  return cachedBuildTimeDefaults;
};

/**
 * Reads an environment variable with build-time fallback.  Runtime values
 * (hosting platform env vars, .env.local) always take precedence.
 */
const getEnv = (key: string): string | undefined =>
  process.env[key] ?? getBuildTimeDefaults()[key];

function parseEnvBoolean(value: string, key: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (["1", "on", "true", "yes"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment variable: ${key}`);
}

function parseEnvNumber(value: string, key: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${key}`);
  }

  return parsed;
}

function requireEnvValue(value: string | undefined, key: string): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

// ── Server env accessors (dynamic key lookup) ────────────────────────────────

const envString = (key: string): string =>
  requireEnvValue(getEnv(key), key);

const envNumber = (key: string): number => parseEnvNumber(envString(key), key);

const envBoolean = (key: string): boolean =>
  parseEnvBoolean(envString(key), key);

/**
 * Reads an optional boolean env variable, returning `defaultValue` when the
 * key is missing or empty.
 */
export const envBooleanOptional = (
  key: string,
  defaultValue: boolean,
): boolean => {
  const raw = getEnv(key);
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

const LOG_LEVEL_VALUES = ["none", "error", "warn", "info", "verbose"] as const;

type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

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

// ── CONFIG Proxy ─────────────────────────────────────────────────────────────

interface ConfigKeys {
  DNS_CACHE_MAX_ENTRIES: number;
  DNS_CACHE_TTL_MS: number;
  DNS_LOOKUP_TIMEOUT_MS: number;
  FEED_BATCH_CONCURRENCY: number;
  FEED_BATCH_MAX_URLS: number;
  FEED_CACHE_TTL_MINUTES: number;
  FEED_FORCE_REFRESH_TTL_MINUTES: number;
  FEED_REFRESH_DIAGNOSTICS_ENABLED: boolean;
  FEED_REQUEST_ACCEPT: string;
  FEED_REQUEST_TIMEOUT_MS: number;
  FEED_REQUEST_USER_AGENT: string;
  LOG_LEVEL: LogLevel;
  MAX_ALL_ARTICLES_LIMIT: number;
  MAX_ARTICLE_CONSECUTIVE_BLANK_LINES: number;
  MAX_ARTICLE_CONTENT_LENGTH: number;
  MAX_ARTICLE_TITLE_LENGTH: number;
  MAX_ARTICLES_PER_FEED: number;
  MAX_CATEGORY_NAME_LENGTH: number;
  MAX_EMAIL_LENGTH: number;
  MAX_FEED_NAME_LENGTH: number;
  MAX_FEED_RESPONSE_SIZE_BYTES: number;
  MAX_JSON_BODY_BYTES: number;
  MAX_SESSIONS_PER_USER: number;
  MIN_ARTICLE_IMAGE_HEIGHT_PX: number;
  MIN_ARTICLE_IMAGE_WIDTH_PX: number;
  OPML_MAX_IMPORT_ENTRIES: number;
  PASSWORD_COMPLEXITY_REQUIRED_TYPES: number;
  PASSWORD_MAX_LENGTH: number;
  PASSWORD_MIN_LENGTH: number;
  RATE_LIMIT_EXTRACT_MAX_REQUESTS: number;
  RATE_LIMIT_EXTRACT_WINDOW_MS: number;
  RATE_LIMIT_FEED_BATCH_MAX_REQUESTS: number;
  RATE_LIMIT_FEED_BATCH_WINDOW_MS: number;
  RATE_LIMIT_FEED_MAX_REQUESTS: number;
  RATE_LIMIT_FEED_WINDOW_MS: number;
  RATE_LIMIT_LOGIN_MAX_ATTEMPTS: number;
  RATE_LIMIT_LOGIN_WINDOW_MS: number;
  RATE_LIMIT_PROXY_COMPATIBILITY_MAX_ATTEMPTS: number;
  RATE_LIMIT_PROXY_COMPATIBILITY_WINDOW_MS: number;
  RATE_LIMIT_SIGNUP_MAX_ATTEMPTS: number;
  RATE_LIMIT_SIGNUP_WINDOW_MS: number;
  SESSION_DURATION_DAYS: number;
}

const resolveConfigValue = (key: string): unknown => {
  if (key === "LOG_LEVEL") {
    return envEnum("LOG_LEVEL", LOG_LEVEL_VALUES);
  }

  if (key.endsWith("_USER_AGENT") || key.endsWith("_ACCEPT")) {
    return envString(key);
  }

  if (key.endsWith("_ENABLED")) {
    return envBoolean(key);
  }

  return envNumber(key);
};

/**
 * Lazily-resolved server config. Every property access reads `process.env` at
 * call time through the Proxy getter — no values are captured at module load.
 */
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
