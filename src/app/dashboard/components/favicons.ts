import { getUrlHostnameLabel, tryGetUrlHostname } from "@/lib/utils/url";

export const getHostnameLabel = (url?: string) => getUrlHostnameLabel(url);

const faviconIndexCache = new Map<string, number>();

export const getFaviconCacheKey = (...urls: Array<string | undefined>) => {
  for (const url of urls) {
    const hostname = tryGetUrlHostname(url);
    if (hostname) {
      return hostname;
    }
  }

  return null;
};

export const getCachedFaviconIndex = (cacheKey: string | null) => {
  if (!cacheKey) {
    return 0;
  }

  return faviconIndexCache.get(cacheKey) ?? 0;
};

export const setCachedFaviconIndex = (
  cacheKey: string | null,
  index: number,
) => {
  if (!cacheKey) {
    return;
  }

  faviconIndexCache.set(cacheKey, index);
};

const isIPv4 = (hostname: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

const getHostCandidates = (hostname: string) => {
  const candidates = new Set<string>([hostname]);

  if (isIPv4(hostname) || !hostname.includes(".")) {
    return [...candidates];
  }

  const parts = hostname.split(".");
  for (let index = 1; index <= parts.length - 2; index += 1) {
    const candidate = parts.slice(index).join(".");
    if (candidate.includes(".")) {
      candidates.add(candidate);
    }
  }

  return [...candidates];
};

const getProviderCandidates = (hostname: string) => [
  `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
  `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
  `https://www.google.com/s2/favicons?domain_url=https://${hostname}&sz=64`,
  `https://icon.horse/icon/${hostname}`,
  `https://logo.clearbit.com/${hostname}`,
  `https://${hostname}/favicon.ico`,
  `https://${hostname}/apple-touch-icon.png`,
];

export const getFaviconCandidates = (url?: string) => {
  const hostname = tryGetUrlHostname(url);
  if (!hostname) {
    return [];
  }

  const urls = getHostCandidates(hostname).flatMap(getProviderCandidates);
  return [...new Set(urls)];
};

export const getMergedFaviconCandidates = (
  ...urls: Array<string | undefined>
) => {
  const candidates = urls.flatMap((url) => getFaviconCandidates(url));
  return [...new Set(candidates)];
};
