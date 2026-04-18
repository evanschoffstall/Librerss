const IPV4_SEGMENT_RE = /^\d{1,3}$/;
const IPV6_SEGMENT_RE = /^[\da-f]{1,4}$/i;
const IP_TOKEN_RE = /^[\da-f:.]{1,64}$/i;

/**
 * Return whether is likely ip address.
 * @param value - The value.
 * @returns Whether is likely ip address.
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
 * Return whether is valid ipv4 address.
 * @param value - The value.
 * @returns Whether is valid ipv4 address.
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
 * Return whether is valid ipv6 address.
 * @param value - The value.
 * @returns Whether is valid ipv6 address.
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
