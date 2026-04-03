import type { ArticleFilter } from "@/lib/core/article-filters";
import type { Article, FeedSource } from "@/lib/core/types";

import { normalizeDistinctUrlList } from "@/lib/utils/url";

import {
  type BatchFeedResponseItem,
  createLinkedAbortController,
  ensureArrayResponse,
  getApiClient,
  normalizeBatchItem,
  resolveBatchRequestTimeoutMs,
  withRequestDeadline,
} from "./http";

interface CategoryOrderResponse {
  orderedLabels?: unknown;
}

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
  async createFeedSource(
    source: Pick<FeedSource, "name" | "url"> & { category?: string },
  ): Promise<FeedSource> {
    const response = await getApiClient().post<FeedSource>(
      `${feedServiceBaseUrl}/feeds`,
      source,
    );
    return response.data;
  },

  async deleteFeedSource(id: number): Promise<FeedSource> {
    const response = await getApiClient().delete<FeedSource>(
      `${feedServiceBaseUrl}/feeds?id=${id}`,
    );
    return response.data;
  },

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

  async getFeed(url: string): Promise<Article[]> {
    const response = await withRequestDeadline(
      getApiClient().get<Article[]>(
        `${feedServiceBaseUrl}/feeds?url=${encodeURIComponent(url)}`,
      ),
    );
    return ensureArrayResponse<Article>(response.data);
  },

  async getFeedsBatch(
    urls: string[],
    {
      articleFilter = "all",
      articleLimit,
      forceRefresh = false,
      forceResolveUpstream = false,
      knownLastFetchedAtByUrl,
      requestSource,
      signal,
      skipRefresh = false,
    }: {
      articleFilter?: ArticleFilter;
      articleLimit?: number;
      forceRefresh?: boolean;
      forceResolveUpstream?: boolean;
      knownLastFetchedAtByUrl?: ReadonlyMap<string, Date>;
      requestSource?: string;
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

  async getFeedSources(): Promise<FeedSource[]> {
    const response = await withRequestDeadline(
      getApiClient().get<FeedSource[]>(`${feedServiceBaseUrl}/feeds`),
    );
    return ensureArrayResponse<FeedSource>(response.data);
  },

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

  async saveCategoryOrder(orderedLabels: string[]): Promise<void> {
    await getApiClient().put(`${feedServiceBaseUrl}/feeds/category-order`, {
      orderedLabels,
    });
  },

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
