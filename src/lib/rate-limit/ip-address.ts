const IPV4_SEGMENT_RE = /^\d{1,3}$/;
const IPV6_SEGMENT_RE = /^[\da-f]{1,4}$/i;
const IP_TOKEN_RE = /^[\da-f:.]{1,64}$/i;

/**
 * Edge-safe, conservative IP token validation.
 *
 * The rate limiter only needs a stable bucket key, not full RFC-perfect IP
 * parsing. False negatives degrade to the shared "unknown" bucket; false
 * positives would let attackers manufacture buckets, so this validator stays
 * intentionally strict.
 * @param value
 */
export function isLikelyIpAddress(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || !IP_TOKEN_RE.test(candidate)) {
    return false;
  }

  if (candidate.includes(".")) {
    return isValidIpv4Address(candidate);
  }

  if (candidate.includes(":")) {
    return isValidIpv6Address(candidate);
  }

  return false;
}

/**
 * @param value
 */
function isValidIpv4Address(value: string): boolean {
  const segments = value.split(".");
  if (segments.length !== 4) {
    return false;
  }

  return segments.every((segment) => {
    if (!IPV4_SEGMENT_RE.test(segment)) {
      return false;
    }

    const numeric = Number(segment);
    return numeric >= 0 && numeric <= 255;
  });
}

/**
 * @param value
 */
function isValidIpv6Address(value: string): boolean {
  const normalized = value.trim();
  if (!normalized.includes(":")) {
    return false;
  }

  if (normalized.indexOf("::") !== normalized.lastIndexOf("::")) {
    return false;
  }

  const segments = normalized.split(":");
  if (segments.length < 3 || segments.length > 8) {
    return false;
  }

  if (
    !normalized.includes("::") &&
    segments.some((segment) => segment === "")
  ) {
    return false;
  }

  return segments.every(
    (segment) => segment === "" || IPV6_SEGMENT_RE.test(segment),
  );
}
