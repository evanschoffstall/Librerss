interface FaviconCacheEntry {
  failedAt?: number;
  index: number;
}

const faviconIndexCache = new Map<string, FaviconCacheEntry>();
const FAVICON_CACHE_STORAGE_KEY = "librerss:favicon-index-cache:v2";
const MAX_FAVICON_CACHE_ENTRIES = 400;
const FAVICON_FAILURE_TTL_MS = 24 * 60 * 60 * 1000;

let hasHydratedFaviconIndexCache = false;
let hydratedFaviconIndexCachePayload: null | string = null;

/**
 *
 */
const canUseStorage = () => typeof window !== "undefined";

/**
 *
 */
const trimFaviconIndexCache = () => {
  let iterations = 0;

  while (
    faviconIndexCache.size > MAX_FAVICON_CACHE_ENTRIES &&
    iterations < MAX_FAVICON_CACHE_ENTRIES
  ) {
    const oldestKey = faviconIndexCache.keys().next().value;

    if (typeof oldestKey !== "string") {
      break;
    }

    faviconIndexCache.delete(oldestKey);
    iterations += 1;
  }
};

/**
 *
 */
const persistFaviconIndexCache = () => {
  if (!canUseStorage()) {
    return;
  }

  try {
    const payload = JSON.stringify(
      Object.fromEntries(faviconIndexCache.entries()),
    );
    window.localStorage.setItem(FAVICON_CACHE_STORAGE_KEY, payload);
    hasHydratedFaviconIndexCache = true;
    hydratedFaviconIndexCachePayload = payload;
  } catch {
    // Ignore storage write failures (private mode / quota / denied access).
  }
};

/**
 * @param entry
 */
const isExpiredFailure = (entry: FaviconCacheEntry): boolean => {
  if (entry.index !== -1) {
    return false;
  }

  if (typeof entry.failedAt !== "number") {
    return true;
  }

  return Date.now() - entry.failedAt > FAVICON_FAILURE_TTL_MS;
};

/**
 * @param value
 */
const isCachedFaviconEntry = (
  value: unknown,
): value is Record<"index", number> & { failedAt?: number } => {
  return Boolean(
    value &&
    typeof value === "object" &&
    "index" in value &&
    typeof (value as Record<string, unknown>).index === "number",
  );
};

/**
 * @param value
 */
const parseCachedFaviconEntry = (value: unknown): FaviconCacheEntry | null => {
  if (!isCachedFaviconEntry(value)) {
    return null;
  }

  const entry: FaviconCacheEntry = {
    index: value.index,
    ...(typeof value.failedAt === "number" ? { failedAt: value.failedAt } : {}),
  };

  return isExpiredFailure(entry) ? null : entry;
};

/**
 *
 */
const hydrateFaviconIndexCache = () => {
  if (!canUseStorage()) {
    return;
  }

  try {
    const raw = window.localStorage.getItem(FAVICON_CACHE_STORAGE_KEY);

    if (
      hasHydratedFaviconIndexCache &&
      raw === hydratedFaviconIndexCachePayload
    ) {
      return;
    }

    hasHydratedFaviconIndexCache = true;
    hydratedFaviconIndexCachePayload = raw;
    faviconIndexCache.clear();

    if (!raw) {
      return;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    hydrateParsedFaviconEntries(parsed);

    trimFaviconIndexCache();
  } catch {
    faviconIndexCache.clear();
  }
};

/**
 * @param parsed
 */
const hydrateParsedFaviconEntries = (parsed: object) => {
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof key !== "string" || key.length === 0) {
      continue;
    }

    const entry = parseCachedFaviconEntry(value);

    if (!entry) {
      continue;
    }

    faviconIndexCache.set(key, entry);
  }
};

/**
 * @param cacheKey
 */
export function getCachedFaviconIndex(cacheKey: null | string) {
  hydrateFaviconIndexCache();

  if (!cacheKey) {
    return 0;
  }

  const entry = faviconIndexCache.get(cacheKey);

  if (!entry) {
    return 0;
  }

  if (isExpiredFailure(entry)) {
    faviconIndexCache.delete(cacheKey);
    persistFaviconIndexCache();
    return 0;
  }

  return entry.index;
}

/**
 * @param cacheKey
 * @param index
 */
export function setCachedFaviconIndex(cacheKey: null | string, index: number) {
  hydrateFaviconIndexCache();

  if (!cacheKey) {
    return;
  }

  const entry: FaviconCacheEntry =
    index === -1 ? { failedAt: Date.now(), index: -1 } : { index };
  faviconIndexCache.delete(cacheKey);
  faviconIndexCache.set(cacheKey, entry);
  trimFaviconIndexCache();
  persistFaviconIndexCache();
}
