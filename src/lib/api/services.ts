// API service classes for LibreRSS

import type {
  Article,
  AuthSession,
  AuthUser,
  FeedSource,
} from "@/lib/core/types";
import { normalizeDistinctUrlList } from "@/lib/utils/url";
import {
  ensureArrayResponse,
  normalizeBatchItem,
  type BatchFeedResponseItem,
} from "./http";
import {
  BATCH_REQUEST_TIMEOUT_MS,
  createLinkedAbortController,
  getApiClient,
  withRequestDeadline,
} from "./http-client";
import {
  parseReaderStreamItems,
  readerItemToArticle,
  type ReaderApiStreamResponse,
} from "./reader-mappers";

// ── AuthService ───────────────────────────────────────────────────────────────

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

  static async signup(email: string, password: string): Promise<AuthUser> {
    const response = await getApiClient().post(`${this.baseUrl}/signup`, {
      email,
      password,
    });
    return response.data.user;
  }

  static async logout(): Promise<void> {
    await getApiClient().post(`${this.baseUrl}/logout`);
  }
}

// ── FeedService ───────────────────────────────────────────────────────────────

export class FeedService {
  private static baseUrl = "/api";

  static async getFeed(url: string): Promise<Article[]> {
    const response = await withRequestDeadline(
      getApiClient().get(
        `${this.baseUrl}/feeds?url=${encodeURIComponent(url)}`,
      ),
    );
    return ensureArrayResponse<Article>(response.data);
  }

  static async getFeedSources(): Promise<FeedSource[]> {
    const response = await withRequestDeadline(
      getApiClient().get(`${this.baseUrl}/feeds`),
    );
    return ensureArrayResponse<FeedSource>(response.data);
  }

  static async getFeedsBatch(
    urls: string[],
    {
      skipRefresh = false,
      forceRefresh = false,
      requestSource,
      signal,
    }: {
      skipRefresh?: boolean;
      forceRefresh?: boolean;
      requestSource?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<BatchFeedResponseItem[]> {
    const normalizedUrls = normalizeDistinctUrlList(urls);
    if (normalizedUrls.length === 0) return [];

    const { controller, dispose } = createLinkedAbortController(signal);

    try {
      const response = await withRequestDeadline(
        getApiClient().post(
          `${this.baseUrl}/feeds/batch`,
          { urls: normalizedUrls, skipRefresh, forceRefresh, requestSource },
          { signal: controller.signal },
        ),
        BATCH_REQUEST_TIMEOUT_MS,
        () => controller.abort(),
      );

      const batchItems = ensureArrayResponse<unknown>(response.data);
      return batchItems.map(normalizeBatchItem);
    } finally {
      dispose();
    }
  }

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

  static async setFeedSourceEnabled(
    id: number,
    enabled: boolean,
  ): Promise<FeedSource> {
    const response = await getApiClient().patch(`${this.baseUrl}/feeds`, {
      id,
      enabled,
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

  static async getCategoryOrder(): Promise<string[]> {
    const response = await getApiClient().get(
      `${this.baseUrl}/feeds/category-order`,
    );
    return Array.isArray(response.data?.orderedLabels)
      ? response.data.orderedLabels
      : [];
  }

  static async saveCategoryOrder(orderedLabels: string[]): Promise<void> {
    await getApiClient().put(`${this.baseUrl}/feeds/category-order`, {
      orderedLabels,
    });
  }
}

// ── ArticleService ────────────────────────────────────────────────────────────

type ProxySettings = {
  configured: boolean;
  proxyUrl: string | null;
  status: "reachable" | "unreachable" | "checking";
  allowInsecureTls: boolean;
  proxyUsername: string | null;
  hasProxyPassword: boolean;
  error?: string;
};

export class ArticleService {
  private static baseUrl = "/api";
  private static greaderBaseUrl = "/api/greader.php/reader/api/0";
  private static proxySettingsRequest: Promise<ProxySettings> | null = null;

  private static streamContentsUrl(streamId: string): string {
    return `${this.greaderBaseUrl}/stream/contents/${encodeURIComponent(streamId)}?output=json&n=250`;
  }

  static async getArticles(): Promise<Article[]> {
    const response = await getApiClient().get(`${this.baseUrl}/articles`);
    return response.data;
  }

  static async extractArticleContent(
    url: string,
    options?: { useProxy?: boolean; signal?: AbortSignal },
  ): Promise<string> {
    const response = await getApiClient().post(
      `${this.baseUrl}/articles/extract`,
      {
        url,
        ...(options?.useProxy && { useProxy: true }),
      },
      { signal: options?.signal },
    );
    return typeof response.data?.content === "string"
      ? response.data.content
      : "";
  }

  static async getProxyStatus(): Promise<{
    configured: boolean;
    proxyUrl: string | null;
    status: "reachable" | "unreachable" | "checking";
  }> {
    const response = await getApiClient().get(
      `${this.baseUrl}/articles/proxy-status`,
    );
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

  static async saveProxyUrl(
    proxyUrl: string | null,
    options?: {
      allowInsecureTls?: boolean;
      proxyUsername?: string | null;
      proxyPassword?: string | null;
    },
  ): Promise<ProxySettings> {
    const response = await getApiClient().put(
      `${this.baseUrl}/settings/proxy`,
      { proxyUrl, ...options },
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

  static async updateArticleStatus(
    articleId: number,
    updates: { isRead?: boolean; isStarred?: boolean },
  ): Promise<void> {
    await getApiClient().post(`${this.baseUrl}/articles/status`, {
      articleId,
      ...updates,
    });
  }
}
