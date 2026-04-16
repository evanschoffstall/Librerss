/**
 * Shared SSRF (Server-Side Request Forgery) protection utilities.
 *
 * These predicates are intentionally pure/synchronous so they can be imported
 * by any route without side effects. DNS resolution and caching are handled
 * at the call-site (e.g. feeds/route.ts) because different routes have
 * different caching and failure semantics.
 */

import {
  cacheLookupResult,
  type DnsCacheEntry,
  type DnsResolveDeps,
} from "./dns-resolution";

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^0\./, // 0.0.0.0/8 — "This Network" (RFC 1122); 0.0.0.0 routes to localhost on Linux/macOS
  /^127\./, // 127.0.0.0/8 — IPv4 loopback
  /^10\./, // 10.0.0.0/8 — RFC 1918 private
  /^168\.63\.129\.16$/, // 168.63.129.16 — Azure IMDS/fabric address (not in RFC link-local range)
  /^169\.254\./, // 169.254.0.0/16 — link-local (AWS metadata: 169.254.169.254)
  /^192\.168\./, // 192.168.0.0/16 — RFC 1918 private
  /^172\.(1[6-9]|2\d|3[0-1])\./, // 172.16.0.0/12 — RFC 1918 private
  /^100\.(6[4-9]|[789]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 — CGNAT (RFC 6598); reaches cloud/ISP internal infra
  /^192\.0\.0\./, // 192.0.0.0/24 — IETF protocol assignments (RFC 6890)
  /^198\.(1[89])\./, // 198.18.0.0/15 — benchmarking (RFC 2544)
  /^2(?:4[0-9]|5[0-5])\./, // 240.0.0.0/4 — Class E reserved (RFC 1112)
  /^::$/, // :: — IPv6 unspecified (routes to any/localhost like 0.0.0.0)
  /^::1$/i, // ::1 — IPv6 loopback
  /^fc[0-9a-f]{2}:/i, // fc00::/7 — IPv6 ULA (first half)
  /^fd[0-9a-f]{2}:/i, // fc00::/7 — IPv6 ULA (second half)
  /^fe80:/i, // fe80::/10 — IPv6 link-local
] as const;

export function handleDnsLookupFailure(options: {
  cache: Map<string, DnsCacheEntry>;
  error: unknown;
  hostname: string;
  maxEntries: number;
  nowFn: () => number;
  toErrorMessageFn: (error: unknown) => string;
  warnFn: DnsResolveDeps["warnFn"];
}): boolean {
  options.warnFn("DNS lookup failed for feed validation", {
    error: options.toErrorMessageFn(options.error),
    hostname: options.hostname,
  });

  return cacheLookupResult(
    options.cache,
    options.hostname,
    true,
    options.nowFn() + 60_000,
    options.maxEntries,
  );
}

export function isBlockedHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return true;
  }

  return (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

export function isBlockedResolvedAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const mappedIpv4 = extractMappedIpv4FromIpv6(normalized);
  if (mappedIpv4) {
    return isBlockedHost(mappedIpv4);
  }

  return isBlockedHost(normalized);
}

export function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");

  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }

  return normalized;
}

function expandIpv6ToHextets(raw: string): null | number[] {
  const normalized = raw.trim().toLowerCase();
  if (!normalized.includes(":")) {
    return null;
  }

  const [withoutZone] = normalized.split("%");
  const hasCompression = withoutZone.includes("::");
  if (
    hasCompression &&
    withoutZone.indexOf("::") !== withoutZone.lastIndexOf("::")
  ) {
    return null;
  }

  const [headRaw, tailRaw = ""] = withoutZone.split("::");
  const head = parseIpv6HextetSequence(headRaw);
  const tail = parseIpv6HextetSequence(tailRaw);
  if (head.some(Number.isNaN) || tail.some(Number.isNaN)) {
    return null;
  }

  const specifiedLength = head.length + tail.length;
  if (hasCompression) {
    if (specifiedLength >= 8) {
      return null;
    }

    return [...head, ...Array<number>(8 - specifiedLength).fill(0), ...tail];
  }

  if (specifiedLength !== 8) {
    return null;
  }

  return [...head, ...tail];
}

function extractMappedIpv4FromIpv6(address: string): null | string {
  const hextets = expandIpv6ToHextets(address);
  if (!hextets) {
    return null;
  }

  const isMapped =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff;

  if (!isMapped) {
    return null;
  }

  const octet1 = (hextets[6] >> 8) & 0xff;
  const octet2 = hextets[6] & 0xff;
  const octet3 = (hextets[7] >> 8) & 0xff;
  const octet4 = hextets[7] & 0xff;

  return `${octet1}.${octet2}.${octet3}.${octet4}`;
}

function parseIpv4DottedQuad(
  raw: string,
): [number, number, number, number] | null {
  const parts = raw.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const bytes = parts.map((part) => Number(part));
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return null;
  }

  return bytes as [number, number, number, number];
}

function parseIpv6Hextet(part: string): null | number[] {
  if (!part) {
    return null;
  }

  if (part.includes(".")) {
    const bytes = parseIpv4DottedQuad(part);
    if (!bytes) {
      return null;
    }

    return [(bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]];
  }

  if (!/^[0-9a-f]{1,4}$/i.test(part)) {
    return null;
  }

  return [Number.parseInt(part, 16)];
}

function parseIpv6HextetSequence(value: string): number[] {
  if (!value) {
    return [];
  }

  return value
    .split(":")
    .filter(Boolean)
    .flatMap((part) => parseIpv6Hextet(part) ?? [Number.NaN]);
}
