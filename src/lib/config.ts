/**
 * Environment helpers.
 * This module intentionally avoids a centralized per-key config registry.
 */

export const isDevelopment = process.env.NODE_ENV === "development";

export const ENV = {
  isDevelopment,
} as const;

export const envString = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

export const envNumber = (key: string): number => {
  const value = envString(key);
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${key}`);
  }

  return parsed;
};

export const envBoolean = (key: string): boolean => {
  const normalized = envString(key).trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment variable: ${key}`);
};

export const envEnum = <T extends string>(
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

export const getLogLevel = (): "none" | "error" | "warn" | "info" | "verbose" =>
  envEnum("LOG_LEVEL", ["none", "error", "warn", "info", "verbose"] as const);

const requireClientEnvString = (
  value: string | undefined,
  key: string,
): string => {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

export const clientFeedCacheTtlMinutes = (): number => {
  const key = "NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES";
  const parsed = Number(
    requireClientEnvString(process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES, key),
  );
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${key}`);
  }

  return parsed;
};

export const clientFeedRefreshDiagnosticsEnabled = (): boolean => {
  const key = "NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED";
  const normalized = requireClientEnvString(
    process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED,
    key,
  )
    .trim()
    .toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment variable: ${key}`);
};

export const maxArticleConsecutiveBlankLines = (): number => {
  const clientKey = "NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES";
  const clientValue =
    process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;

  if (clientValue !== undefined && clientValue.trim() !== "") {
    const parsed = Number(requireClientEnvString(clientValue, clientKey));
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid numeric environment variable: ${clientKey}`);
    }

    return parsed;
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

export const CONFIG: any = new Proxy<Record<string, unknown>>(
  {},
  {
    get: (_target, property) => {
      if (typeof property !== "string") {
        return undefined;
      }

      return resolveConfigValue(property);
    },
  },
);
