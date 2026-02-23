import { getUrlHostnameLabel, tryGetUrlHostname } from "@/lib/utils/url";

export const getHostnameLabel = (url?: string) => getUrlHostnameLabel(url);

const faviconIndexCache = new Map<string, number>();
const FAVICON_CACHE_STORAGE_KEY = "librerss:favicon-index-cache:v1";
const MAX_FAVICON_CACHE_ENTRIES = 400;
let hasHydratedFaviconIndexCache = false;

const canUseStorage = () => typeof window !== "undefined";

const trimFaviconIndexCache = () => {
  let iterations = 0;
  const maxIterations = MAX_FAVICON_CACHE_ENTRIES;

  while (
    faviconIndexCache.size > MAX_FAVICON_CACHE_ENTRIES &&
    iterations < maxIterations
  ) {
    const oldestKey = faviconIndexCache.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }

    faviconIndexCache.delete(oldestKey);
    iterations++;
  }
};

const persistFaviconIndexCache = () => {
  if (!canUseStorage()) {
    return;
  }

  try {
    const payload = JSON.stringify(
      Object.fromEntries(faviconIndexCache.entries()),
    );
    window.localStorage.setItem(FAVICON_CACHE_STORAGE_KEY, payload);
  } catch {
    // Ignore storage write failures (private mode / quota / denied access).
  }
};

const hydrateFaviconIndexCache = () => {
  if (hasHydratedFaviconIndexCache || !canUseStorage()) {
    return;
  }

  hasHydratedFaviconIndexCache = true;

  try {
    const raw = window.localStorage.getItem(FAVICON_CACHE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }

    for (const [key, value] of Object.entries(parsed)) {
      const isValidKey = typeof key === "string" && key.length > 0;
      const isValidValue =
        typeof value === "number" && Number.isInteger(value) && value >= -1;

      if (isValidKey && isValidValue) {
        faviconIndexCache.set(key, value);
      }
    }

    trimFaviconIndexCache();
  } catch {
    // Ignore invalid cache payloads and fall back to an empty in-memory cache.
  }
};

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
  hydrateFaviconIndexCache();

  if (!cacheKey) {
    return 0;
  }

  return faviconIndexCache.get(cacheKey) ?? 0;
};

export const setCachedFaviconIndex = (
  cacheKey: string | null,
  index: number,
) => {
  hydrateFaviconIndexCache();

  if (!cacheKey) {
    return;
  }

  faviconIndexCache.delete(cacheKey);
  faviconIndexCache.set(cacheKey, index);
  trimFaviconIndexCache();
  persistFaviconIndexCache();
};

const isIPv4 = (hostname: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

const parseUrl = (raw: string) => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

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

const getOriginCandidates = (url?: string) => {
  if (!url) {
    return [];
  }

  const parsed = parseUrl(url);
  if (!parsed) {
    return [];
  }

  return [parsed.origin];
};

const getDirectIconCandidates = (origin: string) => {
  const staticPaths = [
    "/favicon.ico",
    "/favicon.svg",
    "/favicon.png",
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
  ];

  return staticPaths.map((path) => `${origin}${path}`);
};

const getProviderCandidates = (hostname: string) => [
  `https://icon.horse/icon/${hostname}`,
  `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
  `https://logo.clearbit.com/${hostname}`,
  `https://www.google.com/s2/favicons?domain_url=https://${hostname}&sz=64`,
  `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
];

const getFaviconCandidates = (url?: string) => {
  const hostname = tryGetUrlHostname(url);
  if (!hostname) {
    return [];
  }

  const hostCandidates = getHostCandidates(hostname);
  const originCandidates = new Set<string>(getOriginCandidates(url));

  for (const hostCandidate of hostCandidates) {
    originCandidates.add(`https://${hostCandidate}`);
    if (!hostCandidate.startsWith("www.")) {
      originCandidates.add(`https://www.${hostCandidate}`);
    }
  }

  const urls = [
    ...[...originCandidates].flatMap(getDirectIconCandidates),
    ...hostCandidates.flatMap(getProviderCandidates),
  ];

  return [...new Set(urls)];
};

export const getMergedFaviconCandidates = (
  ...urls: Array<string | undefined>
) => {
  const candidates = urls.flatMap((url) => getFaviconCandidates(url));
  return [...new Set(candidates)];
};

// FNV-1a hash constants
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

const hashStringToUint32 = (value: string) => {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
};

export const getFaviconTintColors = (...urls: Array<string | undefined>) => {
  const seedSource =
    urls.find((url) => Boolean(url?.trim())) ??
    urls.map((url) => tryGetUrlHostname(url) ?? "").find(Boolean) ??
    "librerss-default";
  const hash = hashStringToUint32(seedSource);

  const hue = hash % 360;
  const saturation = 62 + (hash % 16);
  const foregroundLightness = 38 + ((hash >>> 7) % 14);
  const backgroundLightness = 88 + ((hash >>> 13) % 6);

  return {
    foreground: `hsl(${hue} ${saturation}% ${foregroundLightness}%)`,
    background: `hsl(${hue} ${Math.max(42, saturation - 18)}% ${backgroundLightness}% / 0.35)`,
  };
};
