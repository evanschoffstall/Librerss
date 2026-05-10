import type { BatchFeedError } from "@/lib/core/feed-fetcher-batch";

import type { BatchUrlDescriptor } from "./endpoint";

/**
 * Describes the options for batch result item.
 */
interface BatchResultItemOptions {
  batchMap: ReadonlyMap<string, unknown[]>;
  item: BatchUrlDescriptor;
  lastFetchedByUrl: ReadonlyMap<string, Date>;
  unchangedUrls: ReadonlySet<string>;
  upstreamErrors: ReadonlyMap<string, BatchFeedError>;
}

/**
 * Build the batch result item.
 * @param options - The options used to build the batch result item.
 * @returns The batch result item.
 */
export function buildBatchResultItem(options: BatchResultItemOptions) {
  if (options.item.kind === "invalid") {
    return {
      articles: [],
      error: "Invalid feed URL",
      ok: false,
      url: options.item.url,
    };
  }

  const normalizedUrl = options.item.url;
  const upstreamError = options.upstreamErrors.get(normalizedUrl);

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
    ...(upstreamError
      ? {
          error: upstreamError.message,
          ...(typeof upstreamError.statusCode === "number"
            ? { statusCode: upstreamError.statusCode }
            : {}),
        }
      : {}),
  };
}
