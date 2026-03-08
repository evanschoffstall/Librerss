/**
 * Module-level DNS result cache.
 * Persists across requests within the same Node.js process.
 */

import { CONFIG } from "@/lib/config";
import { toErrorMessage } from "@/lib/utils/errors";
import { logger } from "@/lib/logger";
import { isBlockedResolvedAddress } from "@/lib/utils/ssrf";
import { lookup } from "node:dns/promises";

interface DnsCacheEntry {
  blocked: boolean;
  expiresAt: number;
}

const DNS_CACHE = new Map<string, DnsCacheEntry>();

export function clearDnsCacheForTests(): void {
  DNS_CACHE.clear();
}

function setCacheSafe(key: string, value: DnsCacheEntry): void {
  if (DNS_CACHE.size >= CONFIG.DNS_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, entry] of DNS_CACHE.entries()) {
      if (entry.expiresAt <= now) DNS_CACHE.delete(k);
    }

    if (DNS_CACHE.size >= CONFIG.DNS_CACHE_MAX_ENTRIES) {
      // Evict oldest 20% to avoid thundering-herd on full flush.
      const evictCount = Math.ceil(CONFIG.DNS_CACHE_MAX_ENTRIES * 0.2);
      let evicted = 0;
      for (const k of DNS_CACHE.keys()) {
        DNS_CACHE.delete(k);
        if (++evicted >= evictCount) break;
      }
    }
  }

  DNS_CACHE.set(key, value);
}

export async function resolvesToBlockedAddress(
  hostname: string,
  deps?: {
    lookupFn?: typeof lookup;
    isBlockedResolvedAddressFn?: typeof isBlockedResolvedAddress;
    warnFn?: typeof logger.warn;
    nowFn?: () => number;
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
  },
): Promise<boolean> {
  const now = deps?.nowFn ?? Date.now;
  const lookupFn = deps?.lookupFn ?? lookup;
  const isBlockedAddress =
    deps?.isBlockedResolvedAddressFn ?? isBlockedResolvedAddress;
  const warn = deps?.warnFn ?? logger.warn.bind(logger);
  const setTimeoutFn = deps?.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = deps?.clearTimeoutFn ?? clearTimeout;

  const cached = DNS_CACHE.get(hostname);
  if (cached && cached.expiresAt > now()) return cached.blocked;

  try {
    const lookupPromise = lookupFn(hostname, { all: true, verbatim: true });
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeoutFn(
        () => reject(new Error("DNS lookup timeout")),
        CONFIG.DNS_LOOKUP_TIMEOUT_MS,
      );
    });

    const records = await Promise.race([lookupPromise, timeoutPromise]).finally(
      () => {
        if (timeoutHandle) {
          clearTimeoutFn(timeoutHandle);
        }
      },
    );
    const isBlocked = records.some((r) => isBlockedAddress(r.address));

    setCacheSafe(hostname, {
      blocked: isBlocked,
      expiresAt: now() + CONFIG.DNS_CACHE_TTL_MS,
    });

    return isBlocked;
  } catch (error) {
    warn("DNS lookup failed for feed validation", {
      hostname,
      error: toErrorMessage(error),
    });

    // Fail-closed: treat unresolvable hostnames as blocked.
    // Short TTL (60 s) to avoid prolonged false-positives from transient failures.
    setCacheSafe(hostname, {
      blocked: true,
      expiresAt: now() + 60_000,
    });

    return true;
  }
}
