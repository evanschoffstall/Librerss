import { useEffect, useMemo, useState } from "react";

import {
  getCachedFaviconIndex,
  getFaviconCacheKey,
  getFaviconTintColors,
  getMergedFaviconCandidates,
} from "@/app/dashboard/dashboard-services/favicon";

interface UseArticleFaviconOptions {
  fallbackUrl?: string;
  primaryUrl?: string;
}

/**
 * Manage the article favicon.
 * @param options - The options used to manage the article favicon.
 * @returns The article favicon state and callbacks.
 */
export function useArticleFavicon(options: UseArticleFaviconOptions) {
  const { fallbackUrl, primaryUrl } = options;
  const faviconCacheKey = useMemo(
    () => getFaviconCacheKey(primaryUrl, fallbackUrl),
    [fallbackUrl, primaryUrl],
  );
  const faviconCandidates = useMemo(
    () => getMergedFaviconCandidates(primaryUrl, fallbackUrl),
    [fallbackUrl, primaryUrl],
  );
  const faviconTint = useMemo(
    () => getFaviconTintColors(primaryUrl, fallbackUrl),
    [fallbackUrl, primaryUrl],
  );
  const [faviconIndex, setFaviconIndex] = useState(() =>
    getCachedFaviconIndex(faviconCacheKey),
  );

  useEffect(() => {
    setFaviconIndex(getCachedFaviconIndex(faviconCacheKey));
  }, [faviconCacheKey]);

  const faviconUrl = faviconCandidates.at(faviconIndex) ?? null;

  return {
    faviconCacheKey,
    faviconCandidates,
    faviconIndex,
    faviconTint,
    faviconUrl,
    setFaviconIndex,
  };
}
