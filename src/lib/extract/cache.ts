import { envBooleanOptional, isDevelopment } from "@/lib";

import {
  ARTICLE_EXTRACT_CACHE_MAX_ENTRIES,
  ARTICLE_EXTRACT_CACHE_TTL_MS,
  ARTICLE_EXTRACT_CACHE_VERSION,
  CachedExtractResponse,
  ExtractResponsePayload,
} from "./constants";

const articleExtractCache = new Map<string, CachedExtractResponse>();

/**
 * Process the clear article extract cache for tests.
 */
export function clearArticleExtractCacheForTests(): void {
  articleExtractCache.clear();
}

/**
 * Return the cached extract payload.
 * @param url - The url.
 * @returns The cached extract payload.
 */
export function getCachedExtractPayload(
  url: string,
): ExtractResponsePayload | null {
  const cached = articleExtractCache.get(url);
  if (!cached) return null;

  if (cached.version !== ARTICLE_EXTRACT_CACHE_VERSION) {
    articleExtractCache.delete(url);
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    articleExtractCache.delete(url);
    return null;
  }

  return cached.payload;
}

/**
 * Return whether is extract cache enabled.
 * @returns Whether is extract cache enabled.
 */
export function isExtractCacheEnabled(): boolean {
  if (!envBooleanOptional("ARTICLE_EXTRACT_CACHE_ENABLED", true)) return false;
  if (isDevelopment()) {
    return envBooleanOptional("ARTICLE_EXTRACT_CACHE_DEV_ENABLED", true);
  }
  return true;
}

/**
 * Process the set cached extract payload.
 * @param url - The url.
 * @param payload - The payload.
 */
export function setCachedExtractPayload(
  url: string,
  payload: ExtractResponsePayload,
): void {
  if (articleExtractCache.size >= ARTICLE_EXTRACT_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    let evicted = false;
    for (const [k, entry] of articleExtractCache.entries()) {
      if (entry.expiresAt <= now) {
        articleExtractCache.delete(k);
        evicted = true;
        break;
      }
    }
    if (!evicted) {
      const oldestKey = articleExtractCache.keys().next().value;
      if (typeof oldestKey === "string") {
        articleExtractCache.delete(oldestKey);
      }
    }
  }

  articleExtractCache.set(url, {
    expiresAt: Date.now() + ARTICLE_EXTRACT_CACHE_TTL_MS,
    payload,
    version: ARTICLE_EXTRACT_CACHE_VERSION,
  });
}
