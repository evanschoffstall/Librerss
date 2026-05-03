import type {
  Article,
  ArticleFilter,
  ArticleSortOrder,
  FeedSource,
} from "@/lib/core";

import { clientFeedBatchConcurrency } from "@/lib";
import {
  type ApiClient,
  type BatchFeedResponseItem,
  createLinkedAbortController,
  ensureArrayResponse,
  getApiClient,
  normalizeBatchItem,
  resolveBatchRequestTimeoutMs,
  withRequestDeadline,
} from "@/lib/api/http";
import { normalizeDistinctUrlList } from "@/lib/utils";

/**
 * Describes the category order response.
 */
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

/**
 * Describes the options for feeds batch.
 */
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

/**
 * Describes the feed settings settings.
 */
interface FeedSettingsSettings {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
}

/**
 * Describes a normalized feeds batch request.
 */
interface NormalizedFeedsBatchRequest {
  articleFilter: ArticleFilter;
  articleLimit: number | undefined;
  articleSortOrder: ArticleSortOrder;
  forceRefresh: boolean;
  forceResolveUpstream: boolean;
  knownLastFetchedAtByUrl: Record<string, string> | undefined;
  requestSource: string | undefined;
  searchTerm: string | undefined;
  skipRefresh: boolean;
}

/**
 * Describes one batch endpoint request.
 */
interface RequestFeedsBatchOptions {
  abort: () => void;
  apiClient: ApiClient;
  request: NormalizedFeedsBatchRequest;
  signal: AbortSignal;
  urls: string[];
}

/**
 * Describes a fan-out batch endpoint request.
 */
interface RequestFeedsBatchPerFeedOptions {
  apiClient: ApiClient;
  request: NormalizedFeedsBatchRequest;
  signal: AbortSignal;
  urls: string[];
}

/**
 * Describes one feed in a fan-out batch endpoint request.
 */
interface RequestSingleFeedBatchOptions {
  apiClient: ApiClient;
  request: NormalizedFeedsBatchRequest;
  signal: AbortSignal;
  url: string;
}

/**
 * Build the request body for a feeds batch call.
 * @param request - Normalized batch request state.
 * @param urls - URLs to include in this HTTP request.
 * @returns The JSON body accepted by the batch endpoint.
 */
function buildFeedsBatchRequestBody(
  request: NormalizedFeedsBatchRequest,
  urls: string[],
) {
  return {
    articleFilter: request.articleFilter,
    ...(typeof request.articleLimit === "number"
      ? { articleLimit: request.articleLimit }
      : {}),
    articleSortOrder: request.articleSortOrder,
    ...(request.forceResolveUpstream ? { forceResolveUpstream: true } : {}),
    forceRefresh: request.forceRefresh,
    ...(request.knownLastFetchedAtByUrl
      ? { knownLastFetchedAtByUrl: request.knownLastFetchedAtByUrl }
      : {}),
    requestSource: request.requestSource,
    ...(typeof request.searchTerm === "string" && request.searchTerm !== ""
      ? { searchTerm: request.searchTerm }
      : {}),
    skipRefresh: request.skipRefresh,
    urls,
  };
}

/**
 * Merge per-feed refresh errors into the aggregate cache-read response.
 * @param aggregateResults - Cache-read response items for the requested window.
 * @param refreshResults - Fan-out refresh response items.
 * @returns Aggregate response items annotated with per-feed refresh failures.
 */
function mergeFanOutErrorsIntoAggregateResults(
  aggregateResults: BatchFeedResponseItem[],
  refreshResults: BatchFeedResponseItem[],
): BatchFeedResponseItem[] {
  const refreshErrorsByUrl = new Map(
    refreshResults
      .filter((item) => !item.ok && typeof item.error === "string")
      .map((item) => [item.url, item.error] as const),
  );

  if (refreshErrorsByUrl.size === 0) {
    return aggregateResults;
  }

  const resultUrls = new Set<string>();
  const mergedResults = aggregateResults.map((item) => {
    resultUrls.add(item.url);
    const refreshError = refreshErrorsByUrl.get(item.url);
    return refreshError
      ? { ...item, error: refreshError, ok: false as const }
      : item;
  });

  for (const [url, error] of refreshErrorsByUrl) {
    if (!resultUrls.has(url)) {
      mergedResults.push({ articles: [], error, ok: false, url });
    }
  }

  return mergedResults;
}

/**
 * Request the aggregate cache-only batch after per-feed refresh fan-out.
 * @param options - API client, normalized request, URLs, and abort signal.
 * @returns Normalized aggregate batch response items.
 */
async function requestAggregateFeedsBatch(
  options: RequestFeedsBatchPerFeedOptions,
): Promise<BatchFeedResponseItem[]> {
  const { controller, dispose } = createLinkedAbortController(options.signal);
  try {
    return await requestFeedsBatch({
      abort: controller.abort.bind(controller),
      apiClient: options.apiClient,
      request: { ...options.request, skipRefresh: true },
      signal: controller.signal,
      urls: options.urls,
    });
  } finally {
    dispose();
  }
}

/**
 * Request one batch endpoint invocation.
 * @param options - API client, normalized request, URLs, and abort signal.
 * @returns Normalized batch response items.
 */
async function requestFeedsBatch(
  options: RequestFeedsBatchOptions,
): Promise<BatchFeedResponseItem[]> {
  const response = await withRequestDeadline(
    options.apiClient.post<unknown[]>(
      `${feedServiceBaseUrl}/feeds/batch`,
      buildFeedsBatchRequestBody(options.request, options.urls),
      { signal: options.signal },
    ),
    resolveBatchRequestTimeoutMs(options.urls.length),
    options.abort,
  );

  const batchItems = ensureArrayResponse(response.data);
  return batchItems.map(normalizeBatchItem);
}

/**
 * Request each feed in its own batch endpoint invocation.
 * @param options - API client, normalized request, URLs, and abort signal.
 * @returns Normalized batch response items in original URL order.
 */
async function requestFeedsBatchPerFeed(
  options: RequestFeedsBatchPerFeedOptions,
): Promise<BatchFeedResponseItem[]> {
  const refreshResults = await runFeedBatchTasks(
    options.urls.map(
      (url) => () =>
        requestSingleFeedBatch({
          apiClient: options.apiClient,
          request: options.request,
          signal: options.signal,
          url,
        }),
    ),
    clientFeedBatchConcurrency(),
  );

  const aggregateResults = await requestAggregateFeedsBatch(options);

  return mergeFanOutErrorsIntoAggregateResults(
    aggregateResults,
    refreshResults.flat(),
  );
}

/**
 * Request one feed in its own batch endpoint invocation.
 * @param options - Single-feed request options.
 * @returns Normalized batch response items for the feed.
 */
async function requestSingleFeedBatch(
  options: RequestSingleFeedBatchOptions,
): Promise<BatchFeedResponseItem[]> {
  const { controller, dispose } = createLinkedAbortController(options.signal);
  try {
    return await requestFeedsBatch({
      abort: controller.abort.bind(controller),
      apiClient: options.apiClient,
      request: options.request,
      signal: controller.signal,
      urls: [options.url],
    });
  } catch (error) {
    return [
      {
        articles: [],
        error:
          error instanceof Error
            ? error.message
            : "Feed refresh request failed",
        ok: false,
        url: options.url,
      },
    ];
  } finally {
    dispose();
  }
}

/**
 * Run async tasks with a small bounded concurrency.
 * @param tasks - Work items to run.
 * @param concurrency - Maximum number of active tasks.
 * @returns Results in task order.
 */
async function runFeedBatchTasks<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), tasks.length) },
    async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= tasks.length) return;

        results[index] = await tasks[index]();
      }
    },
  );

  await Promise.all(workers);
  return results;
}

/**
 * Return whether a batch should be split into one HTTP request per feed.
 * @param request - Normalized batch request state.
 * @param urlCount - Number of requested feed URLs.
 * @returns Whether refresh-capable work should fan out by feed.
 */
function shouldFanOutFeedsBatch(
  request: NormalizedFeedsBatchRequest,
  urlCount: number,
): boolean {
  return urlCount > 1 && !request.skipRefresh;
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
    const normalizedRequest: NormalizedFeedsBatchRequest = {
      articleFilter,
      articleLimit,
      articleSortOrder,
      forceRefresh,
      forceResolveUpstream,
      knownLastFetchedAtByUrl: serializedKnownLastFetchedAtByUrl,
      requestSource,
      searchTerm: searchTerm?.trim(),
      skipRefresh,
    };
    const apiClient = getApiClient();

    try {
      return shouldFanOutFeedsBatch(normalizedRequest, normalizedUrls.length)
        ? await requestFeedsBatchPerFeed({
            apiClient,
            request: normalizedRequest,
            signal: controller.signal,
            urls: normalizedUrls,
          })
        : await requestFeedsBatch({
            abort: controller.abort.bind(controller),
            apiClient,
            request: normalizedRequest,
            signal: controller.signal,
            urls: normalizedUrls,
          });
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
