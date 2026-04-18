import type { BatchUrlDescriptor } from "./endpoint";

/**
 * @param options
 * @param options.batchMap
 * @param options.item
 * @param options.lastFetchedByUrl
 * @param options.unchangedUrls
 * @param options.upstreamErrors
 */
export function buildBatchResultItem(options: {
  batchMap: ReadonlyMap<string, unknown[]>;
  item: BatchUrlDescriptor;
  lastFetchedByUrl: ReadonlyMap<string, Date>;
  unchangedUrls: ReadonlySet<string>;
  upstreamErrors: ReadonlyMap<string, string>;
}) {
  if (options.item.kind === "invalid") {
    return {
      articles: [],
      error: "Invalid feed URL",
      ok: false,
      url: options.item.url,
    };
  }

  const normalizedUrl = options.item.url;
  return {
    articles: options.batchMap.get(normalizedUrl) ?? [],
    ok:
      options.batchMap.has(normalizedUrl) ||
      options.lastFetchedByUrl.has(normalizedUrl) ||
      options.unchangedUrls.has(normalizedUrl),
    url: normalizedUrl,
    ...(options.unchangedUrls.has(normalizedUrl) ? { unchanged: true } : {}),
    ...(options.lastFetchedByUrl.has(normalizedUrl)
      ? {
          lastFetchedAt: options.lastFetchedByUrl
            .get(normalizedUrl)
            ?.toISOString(),
        }
      : {}),
    ...(options.upstreamErrors.has(normalizedUrl)
      ? { error: options.upstreamErrors.get(normalizedUrl) }
      : {}),
  };
}
