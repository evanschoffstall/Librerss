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
 * (DefinePlugin) so values are available in serverless bundles even when .env files
 * are not loaded into process.env at runtime.
 */

import {
  envBoolean,
  envEnum,
  envNumber,
  envString,
  getEnv,
  parseEnvBoolean,
  parseEnvNumber,
  requireEnvValue,
} from "./env";

/**
 * Return whether is development.
 * @returns Whether is development.
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Process the env boolean optional.
 * @param key - The key.
 * @param defaultValue - The default value.
 * @returns Whether env boolean optional.
 */
export const envBooleanOptional = (
  key: string,
  defaultValue: boolean,
): boolean => {
  const raw = getEnv(key);
  if (raw === undefined || raw.trim() === "") return defaultValue;
  return parseEnvBoolean(raw, key);
};

/**
 * Process the env string optional.
 * @param key - The key.
 * @returns The env string optional.
 */
export const envStringOptional = (key: string): string | undefined => {
  const raw = getEnv(key);

  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const LOG_LEVEL_VALUES = ["none", "error", "warn", "info", "verbose"] as const;

/**
 * Defines the log level type.
 */
type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

/**
 * Process the client feed cache ttl minutes.
 * @returns The client feed cache ttl minutes.
 */
export const clientFeedCacheTtlMinutes = (): number => {
  const key = "NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES";
  return parseEnvNumber(
    requireEnvValue(process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES, key),
    key,
  );
};

/**
 * Process the client feed refresh diagnostics enabled.
 * @returns Whether client feed refresh diagnostics enabled.
 */
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

/**
 * Process the client feed batch concurrency.
 * @returns The client feed batch concurrency.
 */
export const clientFeedBatchConcurrency = (): number =>
  envNumber("FEED_BATCH_CONCURRENCY");

/**
 * Process the client feed batch max urls.
 * @returns The client feed batch max urls.
 */
export const clientFeedBatchMaxUrls = (): number =>
  envNumber("FEED_BATCH_MAX_URLS");

/**
 * Process the client feed request timeout ms.
 * @returns The client feed request timeout ms.
 */
export const clientFeedRequestTimeoutMs = (): number =>
  envNumber("FEED_REQUEST_TIMEOUT_MS");

/**
 * Process the max article consecutive blank lines.
 * @returns The max article consecutive blank lines.
 */
export const maxArticleConsecutiveBlankLines = (): number => {
  const clientKey = "NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES";
  const clientValue =
    process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;

  if (clientValue !== undefined && clientValue.trim() !== "") {
    return parseEnvNumber(requireEnvValue(clientValue, clientKey), clientKey);
  }

  return envNumber("MAX_ARTICLE_CONSECUTIVE_BLANK_LINES");
};

/**
 * Describes the config keys.
 */
interface ConfigKeys {
  DNS_CACHE_MAX_ENTRIES: number;
  DNS_CACHE_TTL_MS: number;
  DNS_LOOKUP_TIMEOUT_MS: number;
  FEED_BATCH_CONCURRENCY: number;
  FEED_BATCH_MAX_URLS: number;
  FEED_CACHE_TTL_MINUTES: number;
  FEED_FORCE_REFRESH_TTL_MINUTES: number;
  FEED_REFRESH_DIAGNOSTICS_ENABLED: boolean;
  FEED_REQUEST_TIMEOUT_MS: number;
  INVITATION_EXPIRATION_DAYS: number;
  INVITATIONS_ENABLED: boolean;
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
  RATE_LIMIT_INVITATIONS_MAX_ATTEMPTS: number;
  RATE_LIMIT_INVITATIONS_WINDOW_MS: number;
  RATE_LIMIT_LOGIN_MAX_ATTEMPTS: number;
  RATE_LIMIT_LOGIN_WINDOW_MS: number;
  RATE_LIMIT_PROXY_COMPATIBILITY_MAX_ATTEMPTS: number;
  RATE_LIMIT_PROXY_COMPATIBILITY_WINDOW_MS: number;
  RATE_LIMIT_SIGNUP_MAX_ATTEMPTS: number;
  RATE_LIMIT_SIGNUP_WINDOW_MS: number;
  SESSION_DURATION_DAYS: number;
}

/**
 * Resolve the config value.
 * @param key - The key.
 * @returns The config value.
 */
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
export const CONFIG = new Proxy({} as ConfigKeys & Record<string, unknown>, {
  /**
   * Read a configuration value by key.
   * @param _target - The proxy target (unused empty object).
   * @param property - The configuration key to resolve.
   * @returns The resolved configuration value for the given key.
   */
  get: (_target, property) => {
    if (typeof property !== "string") {
      return undefined;
    }

    return resolveConfigValue(property);
  },
}) as ConfigKeys;
