import type {
  Article,
  ArticleFilter,
  ArticleSortOrder,
  FeedSource,
} from "@/lib/core";

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
 * Process the serialize known last fetched at by url.
 * @param knownLastFetchedAtByUrl - The known last fetched at by url.
 * @returns The serialize known last fetched at by url.
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
interface FeedsBatchOptions {
  articleFilter?: ArticleFilter;
  articleLimit?: number;
  articleSortOrder?: ArticleSortOrder;
  forceRefresh?: boolean;
  forceResolveUpstream?: boolean;
  knownLastFetchedAtByUrl?: ReadonlyMap<string, Date>;
  requestSource?: string;
  searchTerm?: string;
  signal?: AbortSignal;
  skipRefresh?: boolean;
}

interface FeedSettingsSettings {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
}

export const FeedService = {
  /**
   * Create the feed source.
   * @param source - The source.
   * @returns The feed source.
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
   * Process the delete feed source.
   * @param id - The id.
   * @returns The delete feed source.
   */
  async deleteFeedSource(id: number): Promise<FeedSource> {
    const response = await getApiClient().delete<FeedSource>(
      `${feedServiceBaseUrl}/feeds?id=${id}`,
    );
    return response.data;
  },

  /**
   * Return the category order.
   * @returns The category order.
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
   * Return the feed.
   * @param url - The url.
   * @returns The feed.
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
   * Return the feeds batch.
   * @param urls - The urls.
   * @param options - The options used to return the feeds batch.
   * @returns The feeds batch.
   */
  async getFeedsBatch(
    urls: string[],
    options: FeedsBatchOptions = {},
  ): Promise<BatchFeedResponseItem[]> {
    const {
      articleFilter = "all",
      articleLimit,
      articleSortOrder = "newest",
      forceRefresh = false,
      forceResolveUpstream = false,
      knownLastFetchedAtByUrl,
      requestSource,
      searchTerm,
      signal,
      skipRefresh = false,
    } = options;
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
            articleSortOrder,
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
   * Return the feed sources.
   * @returns The feed sources.
   */
  async getFeedSources(): Promise<FeedSource[]> {
    const response = await withRequestDeadline(
      getApiClient().get<FeedSource[]>(`${feedServiceBaseUrl}/feeds`),
    );
    return ensureArrayResponse<FeedSource>(response.data);
  },

  /**
   * Process the rename feed source.
   * @param id - The id.
   * @param name - The name.
   * @param url - The url.
   * @returns The rename feed source.
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
   * Process the save category order.
   * @param orderedLabels - The ordered labels.
   */
  async saveCategoryOrder(orderedLabels: string[]): Promise<void> {
    await getApiClient().put(`${feedServiceBaseUrl}/feeds/category-order`, {
      orderedLabels,
    });
  },

  /**
   * Process the set feed source enabled.
   * @param id - The id.
   * @param enabled - The enabled.
   * @returns The set feed source enabled.
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
   * Update the feed settings.
   * @param id - The id.
   * @param settings - The settings.
   * @returns The feed settings.
   */
  async updateFeedSettings(
    id: number,
    settings: FeedSettingsSettings,
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
