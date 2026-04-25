/**
 * Public DNS utility surface for cache-aware hostname validation helpers and
 * their runtime contracts.
 */
import {
  type DnsLookupRuntimeDeps,
  resolveBlockedAddressWithCache,
} from "./blocked-address-resolver";

export { type DnsLookupRuntimeDeps, resolveBlockedAddressWithCache };
export {
  isBlockedHost,
  isBlockedResolvedAddress,
  normalizeHostname,
} from "./policy";
export { type DnsCacheEntry, type DnsLookupFn } from "./resolution";
