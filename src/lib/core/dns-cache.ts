/**
 * Module-level DNS result cache.
 * Persists across requests within the same Node.js process.
 */

import { CONFIG } from "@/lib/config";
import { toErrorMessage } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { isBlockedResolvedAddress } from "@/lib/utils/ssrf";
import { lookup } from "node:dns/promises";

interface DnsCacheEntry {
  blocked: boolean;
  expiresAt: number;
}

const DNS_CACHE = new Map<string, DnsCacheEntry>();
const DNS_CACHE_MAX_ENTRIES = 10_000;

function setCacheSafe(key: string, value: DnsCacheEntry): void {
  if (DNS_CACHE.size >= DNS_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, entry] of DNS_CACHE.entries()) {
      if (entry.expiresAt <= now) DNS_CACHE.delete(k);
    }

    if (DNS_CACHE.size >= DNS_CACHE_MAX_ENTRIES) {
      // Evict oldest 20% to avoid thundering-herd on full flush.
      const evictCount = Math.ceil(DNS_CACHE_MAX_ENTRIES * 0.2);
      let evicted = 0;
      for (const k of DNS_CACHE.keys()) {
        DNS_CACHE.delete(k);
        if (++evicted >= evictCount) break;
      }
    }
  }

  DNS_CACHE.set(key, value);
}

export async function resolvesToBlockedAddress(hostname: string): Promise<boolean> {
  const cached = DNS_CACHE.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.blocked;

  try {
    const lookupPromise = lookup(hostname, { all: true, verbatim: true });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("DNS lookup timeout")),
        CONFIG.DNS_LOOKUP_TIMEOUT_MS,
      ),
    );

    const records = await Promise.race([lookupPromise, timeoutPromise]);
    const isBlocked = records.some((r) => isBlockedResolvedAddress(r.address));

    setCacheSafe(hostname, {
      blocked: isBlocked,
      expiresAt: Date.now() + CONFIG.DNS_CACHE_TTL_MS,
    });

    return isBlocked;
  } catch (error) {
    logger.warn("DNS lookup failed for feed validation", {
      hostname,
      error: toErrorMessage(error),
    });

    // Fail-closed: treat unresolvable hostnames as blocked.
    // Short TTL (60 s) to avoid prolonged false-positives from transient failures.
    setCacheSafe(hostname, {
      blocked: true,
      expiresAt: Date.now() + 60_000,
    });

    return true;
  }
}
