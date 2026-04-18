import type { Article } from "@/lib/core";

import { getApiClient } from "@/lib/api/http";

interface ArticleByIdResponse {
  content?: unknown;
}

interface ArticleExtractResponse {
  content?: unknown;
}

interface CompatibilityCheckResponse {
  results: {
    compatibilitySignalDetected: boolean;
    error?: string;
    responseSize?: number;
    site: string;
    statusCode?: number;
    success: boolean;
    url: string;
    vendor: string;
  }[];
}

interface ProxySettings {
  allowInsecureTls: boolean;
  configured: boolean;
  error?: string;
  hasProxyPassword: boolean;
  proxyUrl: null | string;
  proxyUsername: null | string;
  routingCheck: null | {
    directIp: null | string;
    error: null | string;
    proxyExitIp: null | string;
    status: "error" | "proxy-only" | "same-egress" | "verified";
  };
  status: "checking" | "reachable" | "unreachable";
}

interface ProxyStatusResponse {
  configured: boolean;
  proxyUrl: null | string;
  status: "checking" | "reachable" | "unreachable";
}

const articleServiceBaseUrl = "/api";
let proxySettingsRequest: null | Promise<ProxySettings> = null;

export const ArticleService = {
  /**
   * @param url
   * @param options
   * @param options.distillStrategy
   * @param options.signal
   * @param options.useProxy
   */
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

  /**
   *
   */
  async getArticles(): Promise<Article[]> {
    const response = await getApiClient().get<Article[]>(
      `${articleServiceBaseUrl}/articles`,
    );
    return response.data;
  },

  /**
   *
   */
  async getProxySettings(): Promise<ProxySettings> {
    proxySettingsRequest ??= getApiClient()
      .get<ProxySettings>(`${articleServiceBaseUrl}/settings/proxy`)
      .then((response) => response.data)
      .finally(() => {
        proxySettingsRequest = null;
      });

    return proxySettingsRequest;
  },

  /**
   *
   */
  async getProxyStatus(): Promise<ProxyStatusResponse> {
    const response = await getApiClient().get<ProxyStatusResponse>(
      `${articleServiceBaseUrl}/articles/proxy-status`,
    );
    return response.data;
  },

  /**
   * @param articleId
   */
  async getStoredArticleContent(articleId: number): Promise<string> {
    const response = await getApiClient().get<ArticleByIdResponse>(
      `${articleServiceBaseUrl}/articles/${articleId}`,
    );
    return typeof response.data.content === "string"
      ? response.data.content
      : "";
  },

  /**
   * @param streamId
   */
  async markAllRead(streamId: string): Promise<void> {
    await getApiClient().post(
      `${articleServiceBaseUrl}/articles/mark-all-read`,
      {
        streamId,
      },
    );
  },

  /**
   * @param options
   * @param options.useProxy
   */
  async runProxyCompatibilityCheck(options?: {
    useProxy?: boolean;
  }): Promise<CompatibilityCheckResponse> {
    const response = await getApiClient().post<CompatibilityCheckResponse>(
      `${articleServiceBaseUrl}/settings/proxy/compatibility-check`,
      options ?? {},
    );
    return response.data;
  },

  /**
   * @param proxyUrl
   * @param options
   * @param options.allowInsecureTls
   * @param options.proxyPassword
   * @param options.proxyUsername
   */
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

  /**
   * @param articleId
   * @param updates
   * @param updates.isRead
   * @param updates.isStarred
   */
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
