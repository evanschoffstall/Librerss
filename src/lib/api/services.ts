// API service classes for LibreRSS

import {
  BATCH_REQUEST_TIMEOUT_MS,
  type BatchFeedResponseItem,
  createLinkedAbortController,
  ensureArrayResponse,
  getApiClient,
  normalizeBatchItem,
  parseReaderStreamItems,
  type ReaderApiStreamResponse,
  readerItemToArticle,
  withRequestDeadline,
} from "./http";

import type {
  Article,
  AuthSession,
  AuthUser,
  FeedSource,
} from "@/lib/core/types";
import { normalizeDistinctUrlList } from "@/lib/utils/url";

// ── AuthService ───────────────────────────────────────────────────────────────

interface ArticleExtractResponse {
  content?: unknown;
}

interface AuthSessionResponse {
  user: AuthUser;
}

interface CategoryOrderResponse {
  orderedLabels?: unknown;
}

interface ProxySettings {
  allowInsecureTls: boolean;
  configured: boolean;
  error?: string;
  hasProxyPassword: boolean;
  proxyUrl: null | string;
  proxyUsername: null | string;
  status: "checking" | "reachable" | "unreachable";
}

interface ProxyStatusResponse {
  configured: boolean;
  proxyUrl: null | string;
  status: "checking" | "reachable" | "unreachable";
}

interface TestBotDetectionResponse {
  results: {
    blocked: boolean;
    error?: string;
    protection: string;
    responseSize?: number;
    site: string;
    statusCode?: number;
    success: boolean;
    url: string;
  }[];
}

const articleServiceBaseUrl = "/api";
const articleServiceGreaderBaseUrl = "/api/greader.php/reader/api/0";
const authServiceBaseUrl = "/api/auth";
const feedServiceBaseUrl = "/api";
let proxySettingsRequest: null | Promise<ProxySettings> = null;

function getReaderStreamContentsUrl(streamId: string): string {
  return `${articleServiceGreaderBaseUrl}/stream/contents/${encodeURIComponent(streamId)}?output=json&n=250`;
}

// ── FeedService ───────────────────────────────────────────────────────────────

export const ArticleService = {
  async extractArticleContent(
    url: string,
    options?: {
      distillStrategy?: string;
      signal?: AbortSignal;
      useProxy?: boolean;
    },
  ): Promise<string> {
    const response = await getApiClient().post<ArticleExtractResponse>(
      `${articleServiceBaseUrl}/articles/extract`,
      {
        url,
        ...(options?.useProxy && { useProxy: true }),
        ...(options?.distillStrategy && {
          distillStrategy: options.distillStrategy,
        }),
      },
      { signal: options?.signal },
    );
    return typeof response.data.content === "string"
      ? response.data.content
      : "";
  },

  async getArticles(): Promise<Article[]> {
    const response = await getApiClient().get<Article[]>(
      `${articleServiceBaseUrl}/articles`,
    );
    return response.data;
  },

  async getProxySettings(): Promise<ProxySettings> {
    proxySettingsRequest ??= getApiClient()
      .get<ProxySettings>(`${articleServiceBaseUrl}/settings/proxy`)
      .then((response) => response.data)
      .finally(() => {
        proxySettingsRequest = null;
      });

    return proxySettingsRequest;
  },

  async getProxyStatus(): Promise<ProxyStatusResponse> {
    const response = await getApiClient().get<ProxyStatusResponse>(
      `${articleServiceBaseUrl}/articles/proxy-status`,
    );
    return response.data;
  },

  async getReaderStream(streamId: string): Promise<Article[]> {
    const response = await getApiClient().get<ReaderApiStreamResponse>(
      getReaderStreamContentsUrl(streamId),
    );
    const items = parseReaderStreamItems(response.data);
    return items.map((item, index) => readerItemToArticle(item, index));
  },

  async markAllRead(streamId: string): Promise<void> {
    await getApiClient().post(
      `${articleServiceBaseUrl}/articles/mark-all-read`,
      {
        streamId,
      },
    );
  },

  async saveProxyUrl(
    proxyUrl: null | string,
    options?: {
      allowInsecureTls?: boolean;
      proxyPassword?: null | string;
      proxyUsername?: null | string;
    },
  ): Promise<ProxySettings> {
    const response = await getApiClient().put<ProxySettings>(
      `${articleServiceBaseUrl}/settings/proxy`,
      { proxyUrl, ...options },
    );
    return response.data;
  },

  async testBotDetection(options?: {
    useProxy?: boolean;
  }): Promise<TestBotDetectionResponse> {
    const response = await getApiClient().post<TestBotDetectionResponse>(
      `${articleServiceBaseUrl}/settings/proxy/test-bot-detection`,
      options ?? {},
    );
    return response.data;
  },

  async updateArticleStatus(
    articleId: number,
    updates: { isRead?: boolean; isStarred?: boolean },
  ): Promise<void> {
    await getApiClient().post(`${articleServiceBaseUrl}/articles/status`, {
      articleId,
      ...updates,
    });
  },
};

// ── ArticleService ────────────────────────────────────────────────────────────

export const AuthService = {
  async getSession(): Promise<AuthSession> {
    const response = await getApiClient().get<AuthSession>(
      `${authServiceBaseUrl}/session`,
    );
    return response.data;
  },

  async login(email: string, password: string): Promise<AuthUser> {
    const response = await getApiClient().post<AuthSessionResponse>(
      `${authServiceBaseUrl}/login`,
      {
        email,
        password,
      },
    );
    return response.data.user;
  },

  async logout(): Promise<void> {
    await getApiClient().post(`${authServiceBaseUrl}/logout`);
  },

  async signup(email: string, password: string): Promise<AuthUser> {
    const response = await getApiClient().post<AuthSessionResponse>(
      `${authServiceBaseUrl}/signup`,
      {
        email,
        password,
      },
    );
    return response.data.user;
  },
};

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
      forceRefresh = false,
      requestSource,
      signal,
      skipRefresh = false,
    }: {
      forceRefresh?: boolean;
      requestSource?: string;
      signal?: AbortSignal;
      skipRefresh?: boolean;
    } = {},
  ): Promise<BatchFeedResponseItem[]> {
    const normalizedUrls = normalizeDistinctUrlList(urls);
    if (normalizedUrls.length === 0) return [];

    const { controller, dispose } = createLinkedAbortController(signal);

    try {
      const response = await withRequestDeadline(
        getApiClient().post(
          `${feedServiceBaseUrl}/feeds/batch`,
          { forceRefresh, requestSource, skipRefresh, urls: normalizedUrls },
          { signal: controller.signal },
        ),
        BATCH_REQUEST_TIMEOUT_MS,
        () => {
          controller.abort();
        },
      );

      const batchItems = ensureArrayResponse<unknown>(response.data);
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
