let cachedBuildTimeDefaults: Record<string, string> = {};
let cachedBuildTimeDefaultsRaw: string | undefined;

/**
 * Return the build time defaults.
 * @returns The build time defaults.
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
 * Return the env.
 * @param key - The key.
 * @returns The env.
 */
export const getEnv = (key: string): string | undefined =>
  process.env[key] ?? getBuildTimeDefaults()[key];

/**
 * Parse the env boolean.
 * @param value - The value.
 * @param key - The key.
 * @returns Whether env boolean.
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
 * Parse the env number.
 * @param value - The value.
 * @param key - The key.
 * @returns The env number.
 */
export function parseEnvNumber(value: string, key: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${key}`);
  }

  return parsed;
}

/**
 * Process the require env value.
 * @param value - The value.
 * @param key - The key.
 * @returns The require env value.
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
 * Process the env string.
 * @param key - The key.
 * @returns The env string.
 */
export const envString = (key: string): string =>
  requireEnvValue(getEnv(key), key);

/**
 * Process the env number.
 * @param key - The key.
 * @returns The env number.
 */
export const envNumber = (key: string): number =>
  parseEnvNumber(envString(key), key);

/**
 * Process the env boolean.
 * @param key - The key.
 * @returns Whether env boolean.
 */
export const envBoolean = (key: string): boolean =>
  parseEnvBoolean(envString(key), key);

/**
 * Process the env enum.
 * @param key - The key.
 * @param allowedValues - The allowed values.
 * @returns The env enum.
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
