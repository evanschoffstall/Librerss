import { useEffect, useMemo, useState } from "react";

import {
  getCachedFaviconIndex,
  getFaviconCacheKey,
  getFaviconTintColors,
  getMergedFaviconCandidates,
} from "@/app/dashboard/services/favicon";

/**
 * Describes the URL inputs used to resolve dashboard favicon state.
 */
interface UseFaviconStateOptions {
  fallbackUrl?: string;
  primaryUrl?: string;
}

/**
 * Manage cached favicon state for one dashboard URL pair.
 * @param options - The primary and fallback URLs used to derive favicon candidates.
 * @returns The favicon cache metadata, candidate list, and selected favicon state.
 */
export function useFaviconState(options: UseFaviconStateOptions) {
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
