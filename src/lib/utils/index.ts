export {
  type ArticleRecordLike,
  dedupeArticleRecords,
  getNormalizedArticleRecordKey,
  preferNewerArticleRecord,
  preferRicherArticleRecord,
  sortArticleRecordsByPublicationDateDesc,
} from "./article-records";
export {
  type DnsLookupContext,
  type DnsLookupRuntimeDeps,
  type DnsResolverDefaults,
  resolveBlockedAddressWithCache,
  resolveDnsLookupContext,
} from "./blocked-address-resolver";
export {
  DEFAULT_CATEGORY_LABEL,
  findCategoryByLabel,
  includesCategoryLabel,
  isSameCategoryLabel,
  normalizeCategory,
  normalizeCategoryLabelKey,
  removeCategoryLabel,
  replaceCategoryLabel,
  toCategoryLabelOrDefault,
} from "./categories";
export { cn } from "./classnames";
export {
  decodePossiblyCompressedText,
  decodeTextBody,
  decompressBody,
} from "./content-encoding";
export {
  formatRelativeDate,
  parseDateOrFallback,
  parseDateOrNull,
} from "./dates";
export {
  cacheLookupResult,
  type DnsCacheEntry,
  type DnsLookupFn,
  type DnsLookupRecord,
  type DnsResolveDeps,
  lookupWithTimeout,
  readCachedDnsResult,
  resolveDnsDeps,
  resolveDnsDepsWithRuntimeDefaults,
} from "./dns-resolution";
export { toError, toErrorMessage } from "./errors";
export {
  decodeHttpResponseBody,
  type EncodedHttpResponse,
  getSingleHeaderValue,
} from "./http-response";
export { generateOpml, parseOpmlFeedImport } from "./opml";
export type { OpmlFeedImportEntry } from "./opml";
export {
  handleDnsLookupFailure,
  isBlockedHost,
  isBlockedResolvedAddress,
  normalizeHostname,
} from "./ssrf";
export {
  ensureProxyUrlHasExplicitPort,
  getUrlCredentials,
  getUrlHostnameDisplayLabel,
  getUrlHostnameLabel,
  injectProxyCredentials,
  isValidUrl,
  normalizeDistinctUrlList,
  normalizeFeedUrl,
  redactUrlForLogs,
  stripUrlCredentials,
  stripUrlFragment,
  tryGetUrlHostname,
  tryNormalizeFeedUrl,
} from "./url";
export {
  isSafePositiveItemId,
  isStrongPassword,
  isValidEmail,
} from "./validation";
