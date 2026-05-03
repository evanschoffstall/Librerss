import { lookup } from "node:dns/promises";

import { CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";
import {
  type DnsCacheEntry,
  type DnsLookupRuntimeDeps,
  isBlockedResolvedAddress,
  resolveBlockedAddressWithCache,
} from "@/lib/utils/dns";

const DNS_CACHE = new Map<string, DnsCacheEntry>();

/**
 * Resolve a proxy target hostname and report whether it maps to a blocked address range.
 * @param hostname - Hostname extracted from an outbound proxy target URL.
 * @param deps - Optional DNS runtime overrides used by tests.
 * @returns Whether any resolved address is private, loopback, link-local, or otherwise blocked.
 */
export async function resolvesToBlockedAddress(
  hostname: string,
  deps?: DnsLookupRuntimeDeps,
): Promise<boolean> {
  return resolveBlockedAddressWithCache({
    cache: DNS_CACHE,
    cacheTtlMs: CONFIG.DNS_CACHE_TTL_MS,
    defaults: {
      isBlockedResolvedAddressFn: isBlockedResolvedAddress,
      lookupFn: lookup,
      warnFn: logger.warn.bind(logger),
    },
    deps,
    hostname,
    maxEntries: CONFIG.DNS_CACHE_MAX_ENTRIES,
    timeoutMs: CONFIG.DNS_LOOKUP_TIMEOUT_MS,
  });
}
