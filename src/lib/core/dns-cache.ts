/**
 * Module-level DNS result cache.
 * Persists across requests within the same Node.js process.
 */

import { CONFIG, logger } from "@/lib";
import {
  type DnsCacheEntry,
  type DnsLookupFn,
  type DnsLookupRuntimeDeps,
  isBlockedResolvedAddress,
  resolveBlockedAddressWithCache,
} from "@/lib/utils/dns";

const DNS_CACHE = new Map<string, DnsCacheEntry>();

let _lookupFn: DnsLookupFn | null = null;

/**
 *
 */
export function clearDnsCacheForTests(): void {
  DNS_CACHE.clear();
}

/**
 * @param hostname
 * @param deps
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
      lookupFn: await getLookupFn(),
      warnFn: logger.warn.bind(logger),
    },
    deps,
    hostname,
    maxEntries: CONFIG.DNS_CACHE_MAX_ENTRIES,
    timeoutMs: CONFIG.DNS_LOOKUP_TIMEOUT_MS,
  });
}

/**
 *
 */
async function getLookupFn(): Promise<DnsLookupFn> {
  if (!_lookupFn) {
    const mod = await import("node:dns/promises");
    _lookupFn = mod.lookup as DnsLookupFn;
  }
  return _lookupFn;
}
