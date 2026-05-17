import type { Article } from "@/lib/core";

import { getApiClient } from "@/lib/api/http";

/**
 * Describes the article by ID response.
 */
interface ArticleByIdResponse {
  content?: unknown;
}

/**
 * Describes the article extract response.
 */
interface ArticleExtractResponse {
  content?: unknown;
}

/**
 * Describes the compatibility check response.
 */
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

/**
 * Describes the proxy settings.
 */
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

/**
 * Describes the proxy status response.
 */
interface ProxyStatusResponse {
  configured: boolean;
  proxyUrl: null | string;
  status: "checking" | "reachable" | "unreachable";
}

const articleServiceBaseUrl = "/api";
let proxySettingsRequest: null | Promise<ProxySettings> = null;
/**
 * Describes the article status updates.
 */
interface ArticleStatusUpdates {
  isRead?: boolean;
  isStarred?: boolean;
}

/**
 * Describes the options for extract article content.
 */
interface ExtractArticleContentOptions {
  distillStrategy?: string;
  signal?: AbortSignal;
  useProxy?: boolean;
}

/**
 * Describes the options for run proxy compatibility check.
 */
interface RunProxyCompatibilityCheckOptions {
  useProxy?: boolean;
}

/**
 * Describes the options for save proxy URL.
 */
interface SaveProxyUrlOptions {
  allowInsecureTls?: boolean;
  proxyPassword?: null | string;
  proxyUsername?: null | string;
}

/**
 * Describes optional request configuration for article-status mutations.
 */
interface UpdateArticleStatusOptions {
  keepalive?: boolean;
  signal?: AbortSignal;
}

/**
 * Builds the optional fetch configuration for article-status mutations without
 * leaking undefined fields into the API-client call contract.
 * @param options - Caller supplied mutation request options.
 * @returns Request configuration only when at least one option is present.
 */
function createUpdateArticleStatusRequestConfig(
  options: undefined | UpdateArticleStatusOptions,
) {
  if (!options) {
    return undefined;
  }

  return {
    ...(options.keepalive !== undefined
      ? { keepalive: options.keepalive }
      : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  };
}

export const ArticleService = {
  /**
   * Process the extract article content.
   * @param url - The url.
   * @param options - The options used to process the extract article content.
   * @returns The extract article content.
   */
  async extractArticleContent(
    url: string,
    options?: ExtractArticleContentOptions,
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
   * Return the articles.
   * @returns The articles.
   */
  async getArticles(): Promise<Article[]> {
    const response = await getApiClient().get<Article[]>(
      `${articleServiceBaseUrl}/articles`,
    );
    return response.data;
  },

  /**
   * Return the proxy settings.
   * @returns The proxy settings.
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
   * Return the proxy status.
   * @returns The proxy status.
   */
  async getProxyStatus(): Promise<ProxyStatusResponse> {
    const response = await getApiClient().get<ProxyStatusResponse>(
      `${articleServiceBaseUrl}/articles/proxy-status`,
    );
    return response.data;
  },

  /**
   * Return the stored article content.
   * @param articleId - The article id.
   * @returns The stored article content.
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
   * Process the mark all read.
   * @param streamId - The stream id.
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
   * Process the run proxy compatibility check.
   * @param options - The options used to process the run proxy compatibility check.
   * @returns The run proxy compatibility check.
   */
  async runProxyCompatibilityCheck(
    options?: RunProxyCompatibilityCheckOptions,
  ): Promise<CompatibilityCheckResponse> {
    const response = await getApiClient().post<CompatibilityCheckResponse>(
      `${articleServiceBaseUrl}/settings/proxy/compatibility-check`,
      options ?? {},
    );
    return response.data;
  },

  /**
   * Process the save proxy url.
   * @param proxyUrl - The proxy url.
   * @param options - The options used to process the save proxy url.
   * @returns The save proxy url.
   */
  async saveProxyUrl(
    proxyUrl: null | string,
    options?: SaveProxyUrlOptions,
  ): Promise<ProxySettings> {
    const response = await getApiClient().put<ProxySettings>(
      `${articleServiceBaseUrl}/settings/proxy`,
      { proxyUrl, ...options },
    );
    return response.data;
  },

  /**
   * Update the article status.
   * @param articleId - The article id.
   * @param updates - The article status fields to persist.
   * @param options - Optional request configuration for the mutation call.
   */
  async updateArticleStatus(
    articleId: number,
    updates: ArticleStatusUpdates,
    options?: UpdateArticleStatusOptions,
  ): Promise<void> {
    const requestBody = {
      articleId,
      ...updates,
    };
    const requestConfig = createUpdateArticleStatusRequestConfig(options);

    if (!requestConfig) {
      await getApiClient().post(
        `${articleServiceBaseUrl}/articles/status`,
        requestBody,
      );
      return;
    }

    await getApiClient().post(
      `${articleServiceBaseUrl}/articles/status`,
      requestBody,
      requestConfig,
    );
  },
};
