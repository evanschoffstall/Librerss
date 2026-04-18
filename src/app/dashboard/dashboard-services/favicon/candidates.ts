import { tryGetUrlHostname } from "@/lib/utils";

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
  return parsed ? [parsed.origin] : [];
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

  return [
    ...new Set([
      ...hostCandidates.flatMap(getProviderCandidates),
      ...[...originCandidates].flatMap(getDirectIconCandidates),
    ]),
  ];
};

export function getFaviconCacheKey(...urls: (string | undefined)[]) {
  for (const url of urls) {
    const hostname = tryGetUrlHostname(url);

    if (hostname) {
      return hostname;
    }
  }

  return null;
}

export function getMergedFaviconCandidates(...urls: (string | undefined)[]) {
  return [...new Set(urls.flatMap((url) => getFaviconCandidates(url)))];
}
