"use client";

/**
 * Manages favicon candidate resolution with localStorage-backed index caching.
 * Shared by FeedCategory and ArticleCard.
 */

import { useEffect, useState } from "react";
import {
  getCachedFaviconIndex,
  getFaviconCacheKey,
  getMergedFaviconCandidates,
  getFaviconTintColors,
} from "../helpers/favicons";

interface UseFaviconOptions {
  /** Primary URL (e.g. feedUrl). */
  primaryUrl?: string;
  /** Fallback URL (e.g. article link). Omit for single-URL use cases. */
  fallbackUrl?: string;
}

interface UseFaviconResult {
  faviconUrl: string | undefined;
  faviconTint: { foreground: string; background: string };
  faviconCacheKey: string | null;
  faviconIndex: number;
  faviconCandidates: string[];
  setFaviconIndex: React.Dispatch<React.SetStateAction<number>>;
}

export function useFavicon({ primaryUrl, fallbackUrl }: UseFaviconOptions): UseFaviconResult {
  const faviconCandidates = getMergedFaviconCandidates(primaryUrl, fallbackUrl);
  const faviconCacheKey = getFaviconCacheKey(primaryUrl, fallbackUrl);
  const [faviconIndex, setFaviconIndex] = useState(() => getCachedFaviconIndex(faviconCacheKey));
  const faviconUrl = faviconIndex >= 0 ? faviconCandidates[faviconIndex] : undefined;
  const faviconTint = getFaviconTintColors(primaryUrl, fallbackUrl);

  useEffect(() => {
    setFaviconIndex(getCachedFaviconIndex(faviconCacheKey));
  }, [faviconCacheKey]);

  return {
    faviconUrl,
    faviconTint,
    faviconCacheKey,
    faviconIndex,
    faviconCandidates,
    setFaviconIndex,
  };
}
