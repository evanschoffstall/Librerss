export interface DnsCacheEntry {
  blocked: boolean;
  expiresAt: number;
}

export type DnsLookupFn = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<DnsLookupRecord[]>;

export interface DnsLookupRecord {
  address: string;
}

export interface DnsResolveDeps {
  clearTimeoutFn: typeof clearTimeout;
  isBlockedResolvedAddressFn: (address: string) => boolean;
  lookupFn: DnsLookupFn;
  nowFn: () => number;
  setTimeoutFn: typeof setTimeout;
  warnFn: (message: string, context?: Record<string, unknown>) => void;
}

/**
 * @param cache
 * @param hostname
 * @param blocked
 * @param expiresAt
 * @param maxEntries
 */
export function cacheLookupResult(
  cache: Map<string, DnsCacheEntry>,
  hostname: string,
  blocked: boolean,
  expiresAt: number,
  maxEntries: number,
): boolean {
  setCacheSafe(cache, hostname, { blocked, expiresAt }, maxEntries);
  return blocked;
}

/**
 * @param hostname
 * @param timeoutMs
 * @param lookupFn
 * @param setTimeoutFn
 * @param clearTimeoutFn
 */
export async function lookupWithTimeout(
  hostname: string,
  timeoutMs: number,
  lookupFn: DnsLookupFn,
  setTimeoutFn: typeof setTimeout,
  clearTimeoutFn: typeof clearTimeout,
): Promise<DnsLookupRecord[]> {
  const lookupPromise = lookupFn(hostname, {
    all: true,
    verbatim: true,
  });
  let timeoutHandle: null | ReturnType<typeof setTimeout> = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeoutFn(() => {
      reject(new Error("DNS lookup timeout"));
    }, timeoutMs);
  });

  return Promise.race([lookupPromise, timeoutPromise]).finally(() => {
    if (timeoutHandle) {
      clearTimeoutFn(timeoutHandle);
    }
  });
}

/**
 * @param cache
 * @param hostname
 * @param nowFn
 */
export function readCachedDnsResult(
  cache: Map<string, DnsCacheEntry>,
  hostname: string,
  nowFn: () => number,
): boolean | undefined {
  const cached = cache.get(hostname);
  return cached && cached.expiresAt > nowFn() ? cached.blocked : undefined;
}

/**
 * @param deps
 * @param defaults
 */
export function resolveDnsDeps(
  deps: Partial<DnsResolveDeps> | undefined,
  defaults: DnsResolveDeps,
): DnsResolveDeps {
  const {
    clearTimeoutFn = defaults.clearTimeoutFn,
    isBlockedResolvedAddressFn = defaults.isBlockedResolvedAddressFn,
    lookupFn = defaults.lookupFn,
    nowFn = defaults.nowFn,
    setTimeoutFn = defaults.setTimeoutFn,
    warnFn = defaults.warnFn,
  } = deps ?? {};

  return {
    clearTimeoutFn,
    isBlockedResolvedAddressFn,
    lookupFn,
    nowFn,
    setTimeoutFn,
    warnFn,
  };
}

/**
 * @param deps
 * @param defaults
 */
export function resolveDnsDepsWithRuntimeDefaults(
  deps: Partial<DnsResolveDeps> | undefined,
  defaults: Pick<
    DnsResolveDeps,
    "isBlockedResolvedAddressFn" | "lookupFn" | "warnFn"
  >,
): DnsResolveDeps {
  return resolveDnsDeps(deps, {
    clearTimeoutFn: clearTimeout,
    isBlockedResolvedAddressFn: defaults.isBlockedResolvedAddressFn,
    lookupFn: defaults.lookupFn,
    nowFn: Date.now,
    setTimeoutFn: setTimeout,
    warnFn: defaults.warnFn,
  });
}

/**
 * @param cache
 * @param key
 * @param value
 * @param maxEntries
 */
function setCacheSafe(
  cache: Map<string, DnsCacheEntry>,
  key: string,
  value: DnsCacheEntry,
  maxEntries: number,
): void {
  if (cache.size >= maxEntries) {
    const now = Date.now();
    for (const [cacheKey, entry] of cache.entries()) {
      if (entry.expiresAt <= now) {
        cache.delete(cacheKey);
      }
    }

    if (cache.size >= maxEntries) {
      const evictCount = Math.ceil(maxEntries * 0.2);
      let evicted = 0;
      for (const cacheKey of cache.keys()) {
        cache.delete(cacheKey);
        evicted += 1;
        if (evicted >= evictCount) {
          break;
        }
      }
    }
  }

  cache.set(key, value);
}
