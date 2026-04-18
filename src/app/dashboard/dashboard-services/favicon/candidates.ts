import { tryGetUrlHostname } from "@/lib/utils";

/**
 * Return whether is i pv4.
 * @param hostname - The hostname.
 * @returns Whether is i pv4.
 */
const isIPv4 = (hostname: string) => {
  const octets = hostname.split(".");

  if (octets.length !== 4) {
    return false;
  }

  return octets.every((octet) => {
    if (!octet || octet.length > 3 || !/^\d+$/.test(octet)) {
      return false;
    }

    const value = Number.parseInt(octet, 10);
    return value >= 0 && value <= 255;
  });
};

/**
 * Parse the url.
 * @param raw - The raw.
 * @returns The url.
 */
const parseUrl = (raw: string) => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

/**
 * Return the host candidates.
 * @param hostname - The hostname.
 * @returns The host candidates.
 */
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

/**
 * Return the origin candidates.
 * @param url - The url.
 * @returns The origin candidates.
 */
const getOriginCandidates = (url?: string) => {
  if (!url) {
    return [];
  }

  const parsed = parseUrl(url);
  return parsed ? [parsed.origin] : [];
};

/**
 * Return the direct icon candidates.
 * @param origin - The origin.
 * @returns The direct icon candidates.
 */
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

/**
 * Return the provider candidates.
 * @param hostname - The hostname.
 * @returns The provider candidates.
 */
const getProviderCandidates = (hostname: string) => [
  `https://icon.horse/icon/${hostname}`,
  `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
];

/**
 * Return the favicon candidates.
 * @param url - The url.
 * @returns The favicon candidates.
 */
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

  return [
    ...new Set([
      ...hostCandidates.flatMap(getProviderCandidates),
      ...[...originCandidates].flatMap(getDirectIconCandidates),
    ]),
  ];
};

/**
 * Return the favicon cache key.
 * @param urls - The urls.
 * @returns The favicon cache key.
 */
export function getFaviconCacheKey(urls: (string | undefined)[]) {
  for (const url of urls) {
    const hostname = tryGetUrlHostname(url);

    if (hostname) {
      return hostname;
    }
  }

  return null;
}

/**
 * Return the merged favicon candidates.
 * @param urls - The urls.
 * @returns The merged favicon candidates.
 */
export function getMergedFaviconCandidates(urls: (string | undefined)[]) {
  return [...new Set(urls.flatMap((url) => getFaviconCandidates(url)))];
}
