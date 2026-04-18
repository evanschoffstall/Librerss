import type { Article, ArticleFilter, FeedSource } from "@/lib/core";

import {
  type BatchFeedResponseItem,
  createLinkedAbortController,
  ensureArrayResponse,
  getApiClient,
  normalizeBatchItem,
  resolveBatchRequestTimeoutMs,
  withRequestDeadline,
} from "@/lib/api/http";
import { normalizeDistinctUrlList } from "@/lib/utils";

interface CategoryOrderResponse {
  orderedLabels?: unknown;
}

/**
 * @param knownLastFetchedAtByUrl
 */
function serializeKnownLastFetchedAtByUrl(
  knownLastFetchedAtByUrl: ReadonlyMap<string, Date> | undefined,
): Record<string, string> | undefined {
  if (!knownLastFetchedAtByUrl || knownLastFetchedAtByUrl.size === 0) {
    return undefined;
  }

  const entries = [...knownLastFetchedAtByUrl.entries()]
    .filter(
      (entry): entry is [string, Date] =>
        typeof entry[0] === "string" &&
        entry[0] !== "" &&
        entry[1] instanceof Date &&
        Number.isFinite(entry[1].getTime()),
    )
    .map(([url, lastFetchedAt]) => [url, lastFetchedAt.toISOString()] as const);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

const feedServiceBaseUrl = "/api";

export const FeedService = {
  /**
   * @param source
   */
  async createFeedSource(
    source: Pick<FeedSource, "name" | "url"> & { category?: string },
  ): Promise<FeedSource> {
    const response = await getApiClient().post<FeedSource>(
      `${feedServiceBaseUrl}/feeds`,
      source,
    );
    return response.data;
  },

  /**
   * @param id
   */
  async deleteFeedSource(id: number): Promise<FeedSource> {
    const response = await getApiClient().delete<FeedSource>(
      `${feedServiceBaseUrl}/feeds?id=${id}`,
    );
    return response.data;
  },

  /**
   *
   */
  async getCategoryOrder(): Promise<string[]> {
    const response = await getApiClient().get<CategoryOrderResponse>(
      `${feedServiceBaseUrl}/feeds/category-order`,
    );
    const { orderedLabels } = response.data;
    return Array.isArray(orderedLabels)
      ? orderedLabels.filter(
          (label): label is string => typeof label === "string",
        )
      : [];
  },

  /**
   * @param url
   */
  async getFeed(url: string): Promise<Article[]> {
    const response = await withRequestDeadline(
      getApiClient().get<Article[]>(
        `${feedServiceBaseUrl}/feeds?url=${encodeURIComponent(url)}`,
      ),
    );
    return ensureArrayResponse<Article>(response.data);
  },

  /**
   * @param urls
   * @param root0
   * @param root0.articleFilter
   * @param root0.articleLimit
   * @param root0.forceRefresh
   * @param root0.forceResolveUpstream
   * @param root0.knownLastFetchedAtByUrl
   * @param root0.requestSource
   * @param root0.searchTerm
   * @param root0.signal
   * @param root0.skipRefresh
   */
  async getFeedsBatch(
    urls: string[],
    {
      articleFilter = "all",
      articleLimit,
      forceRefresh = false,
      forceResolveUpstream = false,
      knownLastFetchedAtByUrl,
      requestSource,
      searchTerm,
      signal,
      skipRefresh = false,
    }: {
      articleFilter?: ArticleFilter;
      articleLimit?: number;
      forceRefresh?: boolean;
      forceResolveUpstream?: boolean;
      knownLastFetchedAtByUrl?: ReadonlyMap<string, Date>;
      requestSource?: string;
      searchTerm?: string;
      signal?: AbortSignal;
      skipRefresh?: boolean;
    } = {},
  ): Promise<BatchFeedResponseItem[]> {
    const normalizedUrls = normalizeDistinctUrlList(urls);
    if (normalizedUrls.length === 0) return [];

    const { controller, dispose } = createLinkedAbortController(signal);
    const serializedKnownLastFetchedAtByUrl = serializeKnownLastFetchedAtByUrl(
      knownLastFetchedAtByUrl,
    );

    try {
      const response = await withRequestDeadline(
        getApiClient().post(
          `${feedServiceBaseUrl}/feeds/batch`,
          {
            articleFilter,
            ...(typeof articleLimit === "number" ? { articleLimit } : {}),
            ...(forceResolveUpstream ? { forceResolveUpstream: true } : {}),
            forceRefresh,
            ...(serializedKnownLastFetchedAtByUrl
              ? { knownLastFetchedAtByUrl: serializedKnownLastFetchedAtByUrl }
              : {}),
            requestSource,
            ...(typeof searchTerm === "string" && searchTerm.trim() !== ""
              ? { searchTerm: searchTerm.trim() }
              : {}),
            skipRefresh,
            urls: normalizedUrls,
          },
          { signal: controller.signal },
        ),
        resolveBatchRequestTimeoutMs(normalizedUrls.length),
        () => {
          controller.abort();
        },
      );

      const batchItems = ensureArrayResponse(response.data);
      return batchItems.map(normalizeBatchItem);
    } finally {
      dispose();
    }
  },

  /**
   *
   */
  async getFeedSources(): Promise<FeedSource[]> {
    const response = await withRequestDeadline(
      getApiClient().get<FeedSource[]>(`${feedServiceBaseUrl}/feeds`),
    );
    return ensureArrayResponse<FeedSource>(response.data);
  },

  /**
   * @param id
   * @param name
   * @param url
   */
  async renameFeedSource(
    id: number,
    name: string,
    url?: string,
  ): Promise<FeedSource> {
    const response = await getApiClient().patch<FeedSource>(
      `${feedServiceBaseUrl}/feeds`,
      {
        id,
        name,
        url,
      },
    );
    return response.data;
  },

  /**
   * @param orderedLabels
   */
  async saveCategoryOrder(orderedLabels: string[]): Promise<void> {
    await getApiClient().put(`${feedServiceBaseUrl}/feeds/category-order`, {
      orderedLabels,
    });
  },

  /**
   * @param id
   * @param enabled
   */
  async setFeedSourceEnabled(
    id: number,
    enabled: boolean,
  ): Promise<FeedSource> {
    const response = await getApiClient().patch<FeedSource>(
      `${feedServiceBaseUrl}/feeds`,
      {
        enabled,
        id,
      },
    );
    return response.data;
  },

  /**
   * @param id
   * @param settings
   * @param settings.extractionDisabled
   * @param settings.proxyEnabled
   */
  async updateFeedSettings(
    id: number,
    settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
  ): Promise<FeedSource> {
    const response = await getApiClient().patch<FeedSource>(
      `${feedServiceBaseUrl}/feeds`,
      {
        id,
        ...settings,
      },
    );
    return response.data;
  },
};
