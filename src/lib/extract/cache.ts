import { envBooleanOptional, isDevelopment } from "@/lib/config";
import type {
  CachedExtractResponse,
  ExtractResponsePayload,
} from "./constants";
import {
  ARTICLE_EXTRACT_CACHE_MAX_ENTRIES,
  ARTICLE_EXTRACT_CACHE_TTL_MS,
} from "./constants";

const articleExtractCache = new Map<string, CachedExtractResponse>();

export function isExtractCacheEnabled(): boolean {
  if (!envBooleanOptional("ARTICLE_EXTRACT_CACHE_ENABLED", true)) return false;
  if (isDevelopment) {
    return envBooleanOptional("ARTICLE_EXTRACT_CACHE_DEV_ENABLED", true);
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
  });
}

export function clearArticleExtractCacheForTests(): void {
  articleExtractCache.clear();
}
