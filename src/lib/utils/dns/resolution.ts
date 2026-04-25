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
 * Process the cache lookup result.
 * @param cache - The cache.
 * @param hostname - The hostname.
 * @param blocked - The blocked.
 * @param expiresAt - The expires at.
 * @param maxEntries - The max entries.
 * @returns Whether cache lookup result.
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
 * Process the lookup with timeout.
 * @param hostname - The hostname.
 * @param timeoutMs - The timeout ms value.
 * @param lookupFn - The lookup fn.
 * @param setTimeoutFn - The set timeout fn.
 * @param clearTimeoutFn - The clear timeout fn.
 * @returns The lookup with timeout.
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
 * Process the read cached dns result.
 * @param cache - The cache.
 * @param hostname - The hostname.
 * @param nowFn - The callback that now fn.
 * @returns The read cached dns result.
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
 * Resolve the dns deps.
 * @param deps - The deps.
 * @param defaults - The defaults.
 * @returns The dns deps.
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
 * Resolve the dns deps with runtime defaults.
 * @param deps - The deps.
 * @param defaults - The defaults.
 * @returns The dns deps with runtime defaults.
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
 * Process the set cache safe.
 * @param cache - The cache.
 * @param key - The key.
 * @param value - The value.
 * @param maxEntries - The max entries.
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
