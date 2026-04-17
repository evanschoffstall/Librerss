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
