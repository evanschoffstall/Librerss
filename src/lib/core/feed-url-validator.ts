/**
 * SSRF-safe feed URL validation.
 * Checks protocol, credentials, blocked hostnames/IPs, and DNS resolution.
 */

import { isIP } from "node:net";

import {
  isBlockedHost,
  isBlockedResolvedAddress,
  normalizeHostname,
} from "@/lib/utils/ssrf";
import { isValidUrl } from "@/lib/utils/url";

import { resolvesToBlockedAddress } from "./dns-cache";

export const PUBLIC_FEED_URL_ERROR =
  "Feed URL must use http or https and resolve to a public host";

export async function isAllowedFeedUrl(raw: string): Promise<boolean> {
  try {
    await assertPublicFeedUrl(raw);
    return true;
  } catch {
    return false;
  }
}

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

  if (isIP(host)) {
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
