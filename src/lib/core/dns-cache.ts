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

import { resolveDnsLookupTimeoutMs } from "./serverless-feed-refresh-limits";

const DNS_CACHE = new Map<string, DnsCacheEntry>();

let _lookupFn: DnsLookupFn | null = null;

/** Clear cached DNS validation results between isolated tests. */
export function clearDnsCacheForTests(): void {
  DNS_CACHE.clear();
}

/**
 * Resolve a feed hostname and report whether it maps to a blocked address range.
 * @param hostname - Hostname extracted from a candidate feed URL.
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
      lookupFn: await getLookupFn(),
      warnFn: logger.warn.bind(logger),
    },
    deps,
    hostname,
    maxEntries: CONFIG.DNS_CACHE_MAX_ENTRIES,
    timeoutMs: resolveDnsLookupTimeoutMs(CONFIG.DNS_LOOKUP_TIMEOUT_MS),
  });
}

/**
 * Lazily import Node's DNS lookup implementation.
 * @returns The cached DNS lookup function.
 */
async function getLookupFn(): Promise<DnsLookupFn> {
  if (!_lookupFn) {
    const mod = await import("dns/promises");
    _lookupFn = mod.lookup as DnsLookupFn;
  }
  return _lookupFn;
}
