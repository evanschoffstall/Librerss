import { tryGetUrlHostname } from "@/lib/utils";

/**
 * Determine whether a hostname is an IPv4 address so parent-domain expansion
 * does not treat address octets as registrable domain labels.
 * @param hostname - Hostname extracted from a feed or article URL.
 * @returns Whether the hostname is a syntactically valid IPv4 address.
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
 * Parse a URL candidate without throwing during favicon candidate generation.
 * @param raw - Raw URL text from feed source or article metadata.
 * @returns The parsed URL, or null when the input cannot be parsed.
 */
const parseUrl = (raw: string) => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

/**
 * Build hostnames worth probing for icons, starting with the exact host and
 * then walking toward parent domains for feed subdomains.
 * @param hostname - Hostname extracted from the source URL.
 * @returns Ordered hostnames that may own a usable site favicon.
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
 * Build the origin candidates carried by the original URL.
 * @param url - Feed or article URL that may contain the canonical origin.
 * @returns The parsed origin when the URL is valid.
 */
const getOriginCandidates = (url?: string) => {
  if (!url) {
    return [];
  }

  const parsed = parseUrl(url);
  return parsed ? [parsed.origin] : [];
};

/**
 * Build direct site favicon paths for a known origin.
 * @param origin - Origin that should serve the favicon assets.
 * @returns Ordered direct icon URLs for the origin.
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
 * Build provider-backed favicon fallbacks for a hostname.
 * @param hostname - Hostname to pass to favicon provider services.
 * @returns Ordered provider icon URLs for the hostname.
 */
const getProviderCandidates = (hostname: string) => [
  `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
  `https://icon.horse/icon/${hostname}`,
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`,
];

/**
 * Build favicon candidates for one URL. DuckDuckGo is tried first because it
 * resolves quickly for many feed hosts, then direct site assets get a chance
 * before providers that may return a technically loaded but visually empty icon.
 * @param url - Feed or article URL used to derive favicon locations.
 * @returns Ordered favicon candidates for the URL.
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
      ...hostCandidates.map(
        (hostCandidate) =>
          `https://icons.duckduckgo.com/ip3/${hostCandidate}.ico`,
      ),
      ...[...originCandidates].flatMap(getDirectIconCandidates),
      ...hostCandidates.flatMap((hostCandidate) =>
        getProviderCandidates(hostCandidate).slice(1),
      ),
    ]),
  ];
};

/**
 * Return the stable cache key used to remember the last working favicon
 * candidate for a feed or article source.
 * @param urls - Candidate source URLs ordered by ownership preference.
 * @returns The first valid hostname, or null when no URL can be parsed.
 */
export function getFaviconCacheKey(...urls: (string | undefined)[]) {
  for (const url of urls) {
    const hostname = tryGetUrlHostname(url);

    if (hostname) {
      return hostname;
    }
  }

  return null;
}

/**
 * Merge favicon candidates across feed and article URLs without changing the
 * first-success ordering for each source.
 * @param urls - Candidate source URLs ordered by ownership preference.
 * @returns Deduplicated favicon candidates for the provided URLs.
 */
export function getMergedFaviconCandidates(...urls: (string | undefined)[]) {
  return [...new Set(urls.flatMap((url) => getFaviconCandidates(url)))];
}
