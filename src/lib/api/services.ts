// API service classes for LibreRSS

import axios from "axios";
import type { Article, AuthSession, AuthUser, FeedSource } from "../core/types";

/** Default timeout for all API calls (ms). Prevents indefinite hangs. */
const REQUEST_TIMEOUT_MS = 15_000;

const api = axios.create({ timeout: REQUEST_TIMEOUT_MS });

interface BatchFeedResponseItem {
  url: string;
  articles: Article[];
  ok: boolean;
}

export class AuthService {
  private static baseUrl = "/api/auth";

  static async getSession(): Promise<AuthSession> {
    const response = await api.get(`${this.baseUrl}/session`);
    return response.data;
  }

  static async login(email: string, password: string): Promise<AuthUser> {
    const response = await api.post(`${this.baseUrl}/login`, {
      email,
      password,
    });
    return response.data.user;
  }

  static async signup(email: string, password: string): Promise<AuthUser> {
    const response = await api.post(`${this.baseUrl}/signup`, {
      email,
      password,
    });
    return response.data.user;
  }

  static async logout(): Promise<void> {
    await api.post(`${this.baseUrl}/logout`);
  }
}

export class FeedService {
  private static baseUrl = "/api";

  static async getFeed(url: string): Promise<Article[]> {
    const response = await api.get(
      `${this.baseUrl}/feeds?url=${encodeURIComponent(url)}`,
    );
    if (!Array.isArray(response.data)) {
      throw new Error("Invalid response format");
    }
    return response.data;
  }

  static async getFeedSources(): Promise<FeedSource[]> {
    const response = await api.get(`${this.baseUrl}/feeds`);
    if (!Array.isArray(response.data)) {
      throw new Error("Invalid response format");
    }
    return response.data;
  }

  static async getFeedsBatch(
    urls: string[],
    {
      skipRefresh = false,
      forceRefresh = false,
    }: { skipRefresh?: boolean; forceRefresh?: boolean } = {},
  ): Promise<BatchFeedResponseItem[]> {
    const normalizedUrls = Array.from(
      new Set(urls.map((url) => url.trim()).filter(Boolean)),
    );

    if (normalizedUrls.length === 0) {
      return [];
    }

    const response = await api.post(`${this.baseUrl}/feeds/batch`, {
      urls: normalizedUrls,
      skipRefresh,
      forceRefresh,
    });

    if (!Array.isArray(response.data)) {
      throw new Error("Invalid response format");
    }

    return response.data.map((item) => ({
      url: typeof item?.url === "string" ? item.url : "",
      articles: Array.isArray(item?.articles) ? item.articles : [],
      ok: Boolean(item?.ok),
    }));
  }

  static async createFeedSource(
    source: Pick<FeedSource, "name" | "url"> & { category?: string },
  ): Promise<FeedSource> {
    const response = await api.post(`${this.baseUrl}/feeds`, source);
    return response.data;
  }

  static async deleteFeedSource(id: number): Promise<FeedSource> {
    const response = await api.delete(`${this.baseUrl}/feeds?id=${id}`);
    return response.data;
  }

  static async renameFeedSource(id: number, name: string): Promise<FeedSource> {
    const response = await api.patch(`${this.baseUrl}/feeds`, { id, name });
    return response.data;
  }
}

export class ArticleService {
  private static baseUrl = "/api";

  static async getArticles(): Promise<Article[]> {
    const response = await api.get(`${this.baseUrl}/articles`);
    return response.data;
  }

  static async extractArticleContent(url: string): Promise<string> {
    const response = await api.post(`${this.baseUrl}/articles/extract`, {
      url,
    });
    return typeof response.data?.content === "string"
      ? response.data.content
      : "";
  }
}
