const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^0\./,
  /^127\./,
  /^10\./,
  /^168\.63\.129\.16$/,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^100\.(6[4-9]|[789]\d|1[01]\d|12[0-7])\./,
  /^192\.0\.0\./,
  /^198\.(1[89])\./,
  /^2(?:4[0-9]|5[0-5])\./,
  /^::$/,
  /^::1$/i,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
] as const;

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
