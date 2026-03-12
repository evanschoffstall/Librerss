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

interface ProxySettings {
  allowInsecureTls: boolean;
  configured: boolean;
  error?: string;
  hasProxyPassword: boolean;
  proxyUrl: null | string;
  proxyUsername: null | string;
  status: "checking" | "reachable" | "unreachable";
}

// ── FeedService ───────────────────────────────────────────────────────────────

export class ArticleService {
  private static baseUrl = "/api";
  private static greaderBaseUrl = "/api/greader.php/reader/api/0";
  private static proxySettingsRequest: null | Promise<ProxySettings> = null;

  static async extractArticleContent(
    url: string,
    options?: {
      distillStrategy?: string;
      signal?: AbortSignal;
      useProxy?: boolean;
    },
  ): Promise<string> {
    const response = await getApiClient().post(
      `${this.baseUrl}/articles/extract`,
      {
        url,
        ...(options?.useProxy && { useProxy: true }),
        ...(options?.distillStrategy && {
          distillStrategy: options.distillStrategy,
        }),
      },
      { signal: options?.signal },
    );
    return typeof response.data?.content === "string"
      ? response.data.content
      : "";
  }

  static async getArticles(): Promise<Article[]> {
    const response = await getApiClient().get(`${this.baseUrl}/articles`);
    return response.data;
  }

  static async getProxySettings(): Promise<ProxySettings> {
    if (!this.proxySettingsRequest) {
      this.proxySettingsRequest = getApiClient()
        .get(`${this.baseUrl}/settings/proxy`)
        .then((response) => response.data)
        .finally(() => {
          this.proxySettingsRequest = null;
        });
    }

    return this.proxySettingsRequest;
  }

  static async getProxyStatus(): Promise<{
    configured: boolean;
    proxyUrl: null | string;
    status: "checking" | "reachable" | "unreachable";
  }> {
    const response = await getApiClient().get(
      `${this.baseUrl}/articles/proxy-status`,
    );
    return response.data;
  }

  static async getReaderStream(streamId: string): Promise<Article[]> {
    const response = await getApiClient().get<ReaderApiStreamResponse>(
      this.streamContentsUrl(streamId),
    );
    const items = parseReaderStreamItems(response.data);
    return items.map((item, index) => readerItemToArticle(item, index));
  }

  static async markAllRead(streamId: string): Promise<void> {
    await getApiClient().post(`${this.baseUrl}/articles/mark-all-read`, {
      streamId,
    });
  }

  static async saveProxyUrl(
    proxyUrl: null | string,
    options?: {
      allowInsecureTls?: boolean;
      proxyPassword?: null | string;
      proxyUsername?: null | string;
    },
  ): Promise<ProxySettings> {
    const response = await getApiClient().put(
      `${this.baseUrl}/settings/proxy`,
      { proxyUrl, ...options },
    );
    return response.data;
  }

  static async testBotDetection(options?: { useProxy?: boolean }): Promise<{
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
  }> {
    const response = await getApiClient().post(
      `${this.baseUrl}/settings/proxy/test-bot-detection`,
      options ?? {},
    );
    return response.data;
  }

  static async updateArticleStatus(
    articleId: number,
    updates: { isRead?: boolean; isStarred?: boolean },
  ): Promise<void> {
    await getApiClient().post(`${this.baseUrl}/articles/status`, {
      articleId,
      ...updates,
    });
  }

  private static streamContentsUrl(streamId: string): string {
    return `${this.greaderBaseUrl}/stream/contents/${encodeURIComponent(streamId)}?output=json&n=250`;
  }
}

// ── ArticleService ────────────────────────────────────────────────────────────

export class AuthService {
  private static baseUrl = "/api/auth";

  static async getSession(): Promise<AuthSession> {
    const response = await getApiClient().get(`${this.baseUrl}/session`);
    return response.data;
  }

  static async login(email: string, password: string): Promise<AuthUser> {
    const response = await getApiClient().post(`${this.baseUrl}/login`, {
      email,
      password,
    });
    return response.data.user;
  }

  static async logout(): Promise<void> {
    await getApiClient().post(`${this.baseUrl}/logout`);
  }

  static async signup(email: string, password: string): Promise<AuthUser> {
    const response = await getApiClient().post(`${this.baseUrl}/signup`, {
      email,
      password,
    });
    return response.data.user;
  }
}

export class FeedService {
  private static baseUrl = "/api";

  static async createFeedSource(
    source: Pick<FeedSource, "name" | "url"> & { category?: string },
  ): Promise<FeedSource> {
    const response = await getApiClient().post(`${this.baseUrl}/feeds`, source);
    return response.data;
  }

  static async deleteFeedSource(id: number): Promise<FeedSource> {
    const response = await getApiClient().delete(
      `${this.baseUrl}/feeds?id=${id}`,
    );
    return response.data;
  }

  static async getCategoryOrder(): Promise<string[]> {
    const response = await getApiClient().get(
      `${this.baseUrl}/feeds/category-order`,
    );
    return Array.isArray(response.data?.orderedLabels)
      ? response.data.orderedLabels
      : [];
  }

  static async getFeed(url: string): Promise<Article[]> {
    const response = await withRequestDeadline(
      getApiClient().get(
        `${this.baseUrl}/feeds?url=${encodeURIComponent(url)}`,
      ),
    );
    return ensureArrayResponse<Article>(response.data);
  }

  static async getFeedsBatch(
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
          `${this.baseUrl}/feeds/batch`,
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
  }

  static async getFeedSources(): Promise<FeedSource[]> {
    const response = await withRequestDeadline(
      getApiClient().get(`${this.baseUrl}/feeds`),
    );
    return ensureArrayResponse<FeedSource>(response.data);
  }

  static async renameFeedSource(
    id: number,
    name: string,
    url?: string,
  ): Promise<FeedSource> {
    const response = await getApiClient().patch(`${this.baseUrl}/feeds`, {
      id,
      name,
      url,
    });
    return response.data;
  }

  static async saveCategoryOrder(orderedLabels: string[]): Promise<void> {
    await getApiClient().put(`${this.baseUrl}/feeds/category-order`, {
      orderedLabels,
    });
  }

  static async setFeedSourceEnabled(
    id: number,
    enabled: boolean,
  ): Promise<FeedSource> {
    const response = await getApiClient().patch(`${this.baseUrl}/feeds`, {
      enabled,
      id,
    });
    return response.data;
  }

  static async updateFeedSettings(
    id: number,
    settings: { extractionDisabled?: boolean; proxyEnabled?: boolean },
  ): Promise<FeedSource> {
    const response = await getApiClient().patch(`${this.baseUrl}/feeds`, {
      id,
      ...settings,
    });
    return response.data;
  }
}
