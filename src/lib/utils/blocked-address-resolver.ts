import {
  cacheLookupResult,
  type DnsCacheEntry,
  type DnsLookupFn,
  type DnsResolveDeps,
  lookupWithTimeout,
  readCachedDnsResult,
  resolveDnsDepsWithRuntimeDefaults,
} from "./dns-resolution";
import { toErrorMessage } from "./errors";
import { handleDnsLookupFailure, normalizeHostname } from "./ssrf";

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

export async function resolveBlockedAddressWithCache(options: {
  cache: Map<string, DnsCacheEntry>;
  cacheTtlMs: number;
  defaults: DnsResolverDefaults;
  deps?: DnsLookupRuntimeDeps;
  hostname: string;
  maxEntries: number;
  timeoutMs: number;
}): Promise<boolean> {
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
    return handleDnsLookupFailure({
      cache,
      error,
      hostname: normalizedHostname,
      maxEntries,
      nowFn: resolvedDeps.nowFn,
      toErrorMessageFn: toErrorMessage,
      warnFn: resolvedDeps.warnFn,
    });
  }
}

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
