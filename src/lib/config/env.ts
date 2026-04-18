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
 * Reads an environment variable with build-time fallback. Runtime values
 * (hosting platform env vars, .env.local) always take precedence.
 * @param key
 */
export const getEnv = (key: string): string | undefined =>
  process.env[key] ?? getBuildTimeDefaults()[key];

/**
 * @param value
 * @param key
 */
export function parseEnvBoolean(value: string, key: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (["1", "on", "true", "yes"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean environment variable: ${key}`);
}

/**
 * @param value
 * @param key
 */
export function parseEnvNumber(value: string, key: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${key}`);
  }

  return parsed;
}

/**
 * @param value
 * @param key
 */
export function requireEnvValue(
  value: string | undefined,
  key: string,
): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

/**
 * @param key
 */
export const envString = (key: string): string =>
  requireEnvValue(getEnv(key), key);

/**
 * @param key
 */
export const envNumber = (key: string): number =>
  parseEnvNumber(envString(key), key);

/**
 * @param key
 */
export const envBoolean = (key: string): boolean =>
  parseEnvBoolean(envString(key), key);

/**
 * @param key
 * @param allowedValues
 */
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
