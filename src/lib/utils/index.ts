export {
  type ArticleRecordLike,
  dedupeArticleRecords,
  getNormalizedArticleRecordKey,
  preferNewerArticleRecord,
  preferRicherArticleRecord,
  sortArticleRecordsByPublicationDateDesc,
} from "./article-records";
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
export { toError, toErrorMessage } from "./errors";
export {
  decodeHttpResponseBody,
  type EncodedHttpResponse,
  getSingleHeaderValue,
} from "./http-response";
export { generateOpml, parseOpmlFeedImport } from "./opml";
export type { OpmlFeedImportEntry } from "./opml";
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
export {
  isBlockedHost,
  isBlockedResolvedAddress,
  normalizeHostname,
} from "@/lib/utils/dns";
