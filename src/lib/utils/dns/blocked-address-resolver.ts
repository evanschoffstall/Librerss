import { normalizeHostname } from "./policy";
import {
  cacheLookupResult,
  type DnsCacheEntry,
  type DnsLookupFn,
  type DnsResolveDeps,
  lookupWithTimeout,
  readCachedDnsResult,
  resolveDnsDepsWithRuntimeDefaults,
} from "./resolution";

export interface DnsLookupContext {
  cachedResult: boolean | undefined;
  normalizedHostname: null | string;
  resolvedDeps: null | ReturnType<typeof resolveDnsDepsWithRuntimeDefaults>;
}

export interface DnsLookupRuntimeDeps {
  clearTimeoutFn?: typeof clearTimeout;
  isBlockedResolvedAddressFn?: (address: string) => boolean;
  lookupFn?: DnsLookupFn;
  nowFn?: () => number;
  setTimeoutFn?: typeof setTimeout;
  warnFn?: DnsResolveDeps["warnFn"];
}

export type DnsResolverDefaults = Pick<
  DnsResolveDeps,
  "isBlockedResolvedAddressFn" | "lookupFn" | "warnFn"
>;
interface BlockedAddressWithCacheOptions {
  cache: Map<string, DnsCacheEntry>;
  cacheTtlMs: number;
  defaults: DnsResolverDefaults;
  deps?: DnsLookupRuntimeDeps;
  hostname: string;
  maxEntries: number;
  timeoutMs: number;
}

interface CacheDnsLookupFailureOptions {
  cache: Map<string, DnsCacheEntry>;
  error: unknown;
  hostname: string;
  maxEntries: number;
  nowFn: () => number;
  warnFn: DnsResolveDeps["warnFn"];
}

/**
 * Resolve the blocked address with cache.
 * @param options - The options used to resolve the blocked address with cache.
 * @returns The blocked address with cache.
 */
export async function resolveBlockedAddressWithCache(
  options: BlockedAddressWithCacheOptions,
): Promise<boolean> {
  const { cache, cacheTtlMs, defaults, deps, hostname, maxEntries, timeoutMs } =
    options;
  const ctx = resolveDnsLookupContext(hostname, cache, defaults, deps);
  if (!ctx.normalizedHostname || !ctx.resolvedDeps) {
    return true;
  }

  if (ctx.cachedResult !== undefined) {
    return ctx.cachedResult;
  }

  const { normalizedHostname, resolvedDeps } = ctx;

  try {
    const records = await lookupWithTimeout(
      normalizedHostname,
      timeoutMs,
      resolvedDeps.lookupFn,
      resolvedDeps.setTimeoutFn,
      resolvedDeps.clearTimeoutFn,
    );
    const isBlocked = records.some((record) =>
      resolvedDeps.isBlockedResolvedAddressFn(record.address),
    );

    return cacheLookupResult(
      cache,
      normalizedHostname,
      isBlocked,
      resolvedDeps.nowFn() + cacheTtlMs,
      maxEntries,
    );
  } catch (error) {
    return cacheDnsLookupFailure({
      cache,
      error,
      hostname: normalizedHostname,
      maxEntries,
      nowFn: resolvedDeps.nowFn,
      warnFn: resolvedDeps.warnFn,
    });
  }
}
/**
 * Resolve the dns lookup context.
 * @param hostname - The hostname.
 * @param cache - The cache.
 * @param defaults - The defaults.
 * @param deps - The deps.
 * @returns The dns lookup context.
 */
export function resolveDnsLookupContext(
  hostname: string,
  cache: Map<string, DnsCacheEntry>,
  defaults: DnsResolverDefaults,
  deps?: DnsLookupRuntimeDeps,
): DnsLookupContext {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname) {
    return {
      cachedResult: true,
      normalizedHostname: null,
      resolvedDeps: null,
    };
  }

  const resolvedDeps = resolveDnsDepsWithRuntimeDefaults(deps, defaults);

  return {
    cachedResult: readCachedDnsResult(
      cache,
      normalizedHostname,
      resolvedDeps.nowFn,
    ),
    normalizedHostname,
    resolvedDeps,
  };
}

/**
 * Process the cache dns lookup failure.
 * @param options - The options used to process the cache dns lookup failure.
 * @returns Whether cache dns lookup failure.
 */
function cacheDnsLookupFailure(options: CacheDnsLookupFailureOptions): boolean {
  options.warnFn("DNS lookup failed for feed validation", {
    error: getDnsLookupErrorMessage(options.error),
    hostname: options.hostname,
  });

  return cacheLookupResult(
    options.cache,
    options.hostname,
    true,
    options.nowFn() + 60_000,
    options.maxEntries,
  );
}

/**
 * Return the dns lookup error message.
 * @param error - The error.
 * @returns The dns lookup error message.
 */
function getDnsLookupErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : String(error);
}
