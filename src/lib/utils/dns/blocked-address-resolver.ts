import { normalizeHostname } from "./policy";
import {
  cacheLookupResult,
  type DnsCacheEntry,
  type DnsLookupFn,
  type DnsResolveDeps,
  isDnsLookupTimeoutError,
  lookupWithTimeout,
  readCachedDnsResult,
  resolveDnsDepsWithRuntimeDefaults,
} from "./resolution";

const DNS_LOOKUP_ATTEMPTS = 2;

/** Captures normalized-host lookup state after cache and dependency resolution. */
export interface DnsLookupContext {
  cachedResult: boolean | undefined;
  normalizedHostname: null | string;
  resolvedDeps: null | ReturnType<typeof resolveDnsDepsWithRuntimeDefaults>;
}

/** Optional DNS runtime overrides for tests and alternate execution environments. */
export interface DnsLookupRuntimeDeps {
  clearTimeoutFn?: typeof clearTimeout;
  isBlockedResolvedAddressFn?: (address: string) => boolean;
  lookupFn?: DnsLookupFn;
  nowFn?: () => number;
  setTimeoutFn?: typeof setTimeout;
  warnFn?: DnsResolveDeps["warnFn"];
}

/** Required DNS resolver dependencies supplied by each validation surface. */
export type DnsResolverDefaults = Pick<
  DnsResolveDeps,
  "isBlockedResolvedAddressFn" | "lookupFn" | "warnFn"
>;

/** Options for resolving and caching blocked-address status for a hostname. */
interface BlockedAddressWithCacheOptions {
  cache: Map<string, DnsCacheEntry>;
  cacheTtlMs: number;
  defaults: DnsResolverDefaults;
  deps?: DnsLookupRuntimeDeps;
  hostname: string;
  maxEntries: number;
  timeoutMs: number;
}

/** Options for logging and handling DNS lookup failures. */
interface CacheDnsLookupFailureOptions {
  cache: Map<string, DnsCacheEntry>;
  error: unknown;
  hostname: string;
  maxEntries: number;
  nowFn: () => number;
  warnFn: DnsResolveDeps["warnFn"];
}

/**
 * Resolve whether a hostname maps to a blocked address, reusing fresh cache entries.
 * @param options - Cache, dependency, hostname, and timeout settings for the lookup.
 * @returns Whether the hostname should be blocked by the DNS safety check.
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
    const records = await lookupWithRetry(
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
 * Normalize a hostname, read any fresh cached result, and resolve DNS dependencies.
 * @param hostname - Hostname from a URL that needs DNS validation.
 * @param cache - DNS result cache keyed by normalized hostname.
 * @param defaults - Required DNS resolver defaults for this validation surface.
 * @param deps - Optional runtime overrides used by tests.
 * @returns Lookup context, or a blocked null-host context for invalid hostnames.
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
 * Log a DNS lookup failure and decide how that failure should affect cache state.
 * @param options - Failure details, cache, clock, and logger dependencies.
 * @returns Always true so DNS failures fail closed for the current validation.
 */
function cacheDnsLookupFailure(options: CacheDnsLookupFailureOptions): boolean {
  options.warnFn("DNS lookup failed for feed validation", {
    error: getDnsLookupErrorMessage(options.error),
    hostname: options.hostname,
  });

  if (isDnsLookupTimeoutError(options.error)) {
    return true;
  }

  return cacheLookupResult(
    options.cache,
    options.hostname,
    true,
    options.nowFn() + 60_000,
    options.maxEntries,
  );
}

/**
 * Convert an unknown DNS failure into a log-safe message.
 * @param error - Error thrown by DNS resolution.
 * @returns String message suitable for structured logs.
 */
function getDnsLookupErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : String(error);
}

/**
 * Resolve a hostname with a retry for transient DNS timeout failures.
 * @param hostname - Normalized hostname to resolve.
 * @param timeoutMs - Total lookup budget shared across attempts.
 * @param lookupFn - DNS lookup implementation.
 * @param setTimeoutFn - Timer implementation used for lookup timeouts.
 * @param clearTimeoutFn - Timer cleanup implementation.
 * @returns DNS lookup records for the hostname.
 */
async function lookupWithRetry(
  hostname: string,
  timeoutMs: number,
  lookupFn: DnsLookupFn,
  setTimeoutFn: typeof setTimeout,
  clearTimeoutFn: typeof clearTimeout,
): Promise<Awaited<ReturnType<DnsLookupFn>>> {
  const attemptTimeoutMs = Math.max(
    1,
    Math.floor(timeoutMs / DNS_LOOKUP_ATTEMPTS),
  );
  let lastError: unknown;

  for (let attempt = 0; attempt < DNS_LOOKUP_ATTEMPTS; attempt += 1) {
    try {
      return await lookupWithTimeout(
        hostname,
        attemptTimeoutMs,
        lookupFn,
        setTimeoutFn,
        clearTimeoutFn,
      );
    } catch (error) {
      lastError = error;
      if (!isDnsLookupTimeoutError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}
