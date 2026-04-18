/**
 * SSRF-safe feed URL validation.
 * Checks protocol, credentials, blocked hostnames/IPs, and DNS resolution.
 */

import {
  isBlockedHost,
  isBlockedResolvedAddress,
  isValidUrl,
  normalizeHostname,
} from "@/lib/utils";

import { resolvesToBlockedAddress } from "./dns-cache";

/**
 * Returns true if `host` is a valid IPv4 or IPv6 literal.
 * @param host
 */
function isIPAddress(host: string): boolean {
  if (host.includes(":")) {
    return true;
  }
  const parts = host.split(".");
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d+$/.test(p) && Number(p) <= 255)
  );
}

export const PUBLIC_FEED_URL_ERROR =
  "Feed URL must use http or https and resolve to a public host";

/**
 * @param raw
 */
export async function isAllowedFeedUrl(raw: string): Promise<boolean> {
  try {
    await assertPublicFeedUrl(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param rawUrl
 */
async function assertPublicFeedUrl(rawUrl: string): Promise<void> {
  if (!isValidUrl(rawUrl)) {
    throw new Error("Blocked feed protocol");
  }

  const parsed = new URL(rawUrl);

  if (parsed.username || parsed.password) {
    throw new Error("Blocked credentialed feed URL");
  }

  const host = normalizeHostname(parsed.hostname);

  if (isBlockedHost(host)) {
    throw new Error("Blocked feed hostname");
  }

  if (isIPAddress(host)) {
    if (isBlockedResolvedAddress(host)) {
      throw new Error("Blocked feed IP address");
    }
    return;
  }

  if (await resolvesToBlockedAddress(host)) {
    throw new Error("Blocked resolved feed address");
  }
}

export { assertPublicFeedUrl };
