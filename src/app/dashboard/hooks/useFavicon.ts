"use client";

/**
 * Manages favicon candidate resolution with localStorage-backed index caching.
 * Shared by FeedCategory and ArticleCard.
 */

import { useEffect, useMemo, useState } from "react";

import {
  getCachedFaviconIndex,
  getFaviconCacheKey,
  getFaviconTintColors,
  getMergedFaviconCandidates,
} from "../services/favicons";

interface UseFaviconOptions {
  /** Fallback URL (e.g. article link). Omit for single-URL use cases. */
  fallbackUrl?: string;
  /** Primary URL (e.g. feedUrl). */
  primaryUrl?: string;
}

interface UseFaviconResult {
  faviconCacheKey: null | string;
  faviconCandidates: string[];
  faviconIndex: number;
  faviconTint: { background: string; foreground: string };
  faviconUrl: string | undefined;
  setFaviconIndex: React.Dispatch<React.SetStateAction<number>>;
}

export function useFavicon({
  fallbackUrl,
  primaryUrl,
}: UseFaviconOptions): UseFaviconResult {
  const faviconCandidates = useMemo(
    () => getMergedFaviconCandidates(primaryUrl, fallbackUrl),
    [primaryUrl, fallbackUrl],
  );
  const faviconCacheKey = useMemo(
    () => getFaviconCacheKey(primaryUrl, fallbackUrl),
    [primaryUrl, fallbackUrl],
  );
  const [faviconIndex, setFaviconIndex] = useState(() =>
    getCachedFaviconIndex(faviconCacheKey),
  );
  const faviconUrl =
    faviconIndex >= 0 ? faviconCandidates[faviconIndex] : undefined;
  const faviconTint = useMemo(
    () => getFaviconTintColors(primaryUrl, fallbackUrl),
    [primaryUrl, fallbackUrl],
  );

  useEffect(() => {
    setFaviconIndex(getCachedFaviconIndex(faviconCacheKey));
  }, [faviconCacheKey]);

  return {
    faviconCacheKey,
    faviconCandidates,
    faviconIndex,
    faviconTint,
    faviconUrl,
    setFaviconIndex,
  };
}
