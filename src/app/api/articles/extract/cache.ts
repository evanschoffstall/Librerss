import type {
  CachedExtractResponse,
  ExtractResponsePayload,
} from "./constants";
import {
  ARTICLE_EXTRACT_CACHE_MAX_ENTRIES,
  ARTICLE_EXTRACT_CACHE_TTL_MS,
  BOOLEAN_FALSE_VALUES,
  BOOLEAN_TRUE_VALUES,
} from "./constants";

const articleExtractCache = new Map<string, CachedExtractResponse>();

function readBooleanEnvFlag(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return defaultValue;

  const normalized = raw.trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalized)) return true;
  if (BOOLEAN_FALSE_VALUES.has(normalized)) return false;
  return defaultValue;
}

export function isExtractCacheEnabled(): boolean {
  const cacheEnabled = readBooleanEnvFlag(
    "ARTICLE_EXTRACT_CACHE_ENABLED",
    true,
  );
  if (!cacheEnabled) return false;

  if (process.env.NODE_ENV === "development") {
    return readBooleanEnvFlag("ARTICLE_EXTRACT_CACHE_DEV_ENABLED", true);
  }

  return true;
}

export function getCachedExtractPayload(
  url: string,
): ExtractResponsePayload | null {
  const cached = articleExtractCache.get(url);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    articleExtractCache.delete(url);
    return null;
  }

  return cached.payload;
}

export function setCachedExtractPayload(
  url: string,
  payload: ExtractResponsePayload,
): void {
  if (articleExtractCache.size >= ARTICLE_EXTRACT_CACHE_MAX_ENTRIES) {
    const oldestKey = articleExtractCache.keys().next().value;
    if (typeof oldestKey === "string") {
      articleExtractCache.delete(oldestKey);
    }
  }

  articleExtractCache.set(url, {
    expiresAt: Date.now() + ARTICLE_EXTRACT_CACHE_TTL_MS,
    payload,
  });
}

export function clearArticleExtractCacheForTests(): void {
  articleExtractCache.clear();
}
