/**
 * Describes the dns cache entry.
 */
export interface DnsCacheEntry {
  blocked: boolean;
  expiresAt: number;
}

/**
 * Defines the dns lookup fn type.
 */
export type DnsLookupFn = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<DnsLookupRecord[]>;

/**
 * Describes the dns lookup record.
 */
export interface DnsLookupRecord {
  address: string;
}

/**
 * Describes the dns resolve deps.
 */
export interface DnsResolveDeps {
  clearTimeoutFn: typeof clearTimeout;
  isBlockedResolvedAddressFn: (address: string) => boolean;
  lookupFn: DnsLookupFn;
  nowFn: () => number;
  setTimeoutFn: typeof setTimeout;
  warnFn: (message: string, context?: Record<string, unknown>) => void;
}

/** Describes the supported DNS lookup timeout failure. */
export class DnsLookupTimeoutError extends Error {
  /** Create a typed timeout error for DNS lookup guards. */
  constructor() {
    super("DNS lookup timeout");
    this.name = "DnsLookupTimeoutError";
  }
}

/**
 * Store a DNS validation result while enforcing the cache size limit.
 * @param cache - DNS result cache keyed by normalized hostname.
 * @param hostname - Normalized hostname whose lookup result is being cached.
 * @param blocked - Whether the hostname resolved to a blocked address.
 * @param expiresAt - Expiration timestamp for the cached result.
 * @param maxEntries - Maximum number of cache entries to retain.
 * @returns The blocked status that was cached.
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
 * Return whether an unknown error represents a DNS lookup timeout.
 * @param error - Error thrown by a DNS lookup attempt.
 * @returns Whether the error is a lookup timeout.
 */
export function isDnsLookupTimeoutError(error: unknown): boolean {
  return (
    error instanceof DnsLookupTimeoutError ||
    (error instanceof Error && error.message === "DNS lookup timeout")
  );
}

/**
 * Resolve a hostname and reject if DNS does not answer within the timeout.
 * @param hostname - Normalized hostname to resolve.
 * @param timeoutMs - Maximum lookup duration in milliseconds.
 * @param lookupFn - DNS lookup implementation.
 * @param setTimeoutFn - Timer implementation used for the timeout guard.
 * @param clearTimeoutFn - Timer cleanup implementation.
 * @returns DNS lookup records for the hostname.
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
      reject(new DnsLookupTimeoutError());
    }, timeoutMs);
  });

  return Promise.race([lookupPromise, timeoutPromise]).finally(() => {
    if (timeoutHandle) {
      clearTimeoutFn(timeoutHandle);
    }
  });
}

/**
 * Read a non-expired DNS validation result from cache.
 * @param cache - DNS result cache keyed by normalized hostname.
 * @param hostname - Normalized hostname to read.
 * @param nowFn - Clock used to compare cache expiration.
 * @returns Cached blocked status, or undefined when no fresh entry exists.
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
 * Merge DNS runtime overrides with required defaults.
 * @param deps - Optional DNS runtime overrides.
 * @param defaults - Default DNS runtime dependencies.
 * @returns Fully resolved DNS runtime dependencies.
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
 * Merge DNS runtime overrides with Node timer defaults.
 * @param deps - Optional DNS runtime overrides.
 * @param defaults - DNS lookup, address policy, and warning defaults.
 * @returns Fully resolved DNS runtime dependencies.
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
 * Store a cache entry after pruning expired or oldest entries when necessary.
 * @param cache - DNS result cache to mutate.
 * @param key - Normalized hostname cache key.
 * @param value - DNS cache entry to store.
 * @param maxEntries - Maximum allowed cache size.
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
