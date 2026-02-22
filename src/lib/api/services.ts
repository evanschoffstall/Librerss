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

type ReaderApiLink = { href?: string };
type ReaderApiOrigin = { streamId?: string; title?: string; htmlUrl?: string };
type ReaderApiSummary = { content?: string };
type ReaderApiItem = {
  id?: string;
  title?: string;
  published?: number;
  updated?: number;
  canonical?: ReaderApiLink[];
  alternate?: ReaderApiLink[];
  summary?: ReaderApiSummary;
  origin?: ReaderApiOrigin;
  categories?: string[];
};

type ReaderApiStreamResponse = {
  items?: ReaderApiItem[];
};

function ensureArrayResponse<T>(data: unknown): T[] {
  if (!Array.isArray(data)) {
    throw new Error("Invalid response format");
  }

  return data as T[];
}

function normalizeBatchItem(item: unknown): BatchFeedResponseItem {
  const candidate =
    item && typeof item === "object"
      ? (item as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  return {
    url: typeof candidate.url === "string" ? candidate.url : "",
    articles: Array.isArray(candidate.articles)
      ? (candidate.articles as Article[])
      : [],
    ok: Boolean(candidate.ok),
  };
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
    return ensureArrayResponse<Article>(response.data);
  }

  static async getFeedSources(): Promise<FeedSource[]> {
    const response = await api.get(`${this.baseUrl}/feeds`);
    return ensureArrayResponse<FeedSource>(response.data);
  }

  static async getFeedsBatch(
    urls: string[],
    { skipRefresh = false }: { skipRefresh?: boolean } = {},
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
    });

    const batchItems = ensureArrayResponse<unknown>(response.data);
    return batchItems.map(normalizeBatchItem);
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

  private static greaderBaseUrl = "/api/greader.php/reader/api/0";

  private static toReaderItemId(articleId: number): string {
    return `tag:google.com,2005:reader/item/${articleId.toString(16)}`;
  }

  private static parseArticleId(
    value: string | undefined,
    fallback: number,
  ): number {
    if (!value) {
      return fallback;
    }

    const suffix = value.includes("/")
      ? value.slice(value.lastIndexOf("/") + 1)
      : value;
    const parsedHex = Number.parseInt(suffix, 16);
    if (Number.isInteger(parsedHex) && parsedHex > 0) {
      return parsedHex;
    }

    const parsedDecimal = Number.parseInt(suffix, 10);
    if (Number.isInteger(parsedDecimal) && parsedDecimal > 0) {
      return parsedDecimal;
    }

    return fallback;
  }

  private static toArticle(item: ReaderApiItem, index: number): Article {
    const publishedMs =
      typeof item.published === "number"
        ? item.published * 1000
        : typeof item.updated === "number"
          ? item.updated * 1000
          : Date.now();
    const publicationDate = new Date(publishedMs);
    const canonicalLink = item.canonical?.[0]?.href;
    const alternateLink = item.alternate?.[0]?.href;
    const link = canonicalLink || alternateLink || `about:reader-item-${index}`;
    const originFeedUrl =
      item.origin?.htmlUrl ||
      (item.origin?.streamId?.startsWith("feed/")
        ? item.origin.streamId.slice("feed/".length)
        : undefined);
    const categories = item.categories ?? [];

    return {
      id: this.parseArticleId(item.id, index + 1),
      title: item.title?.trim() || "Untitled",
      link,
      content: item.summary?.content || "",
      publicationDate,
      lastChecked: new Date(),
      feedId: 0,
      feedName: item.origin?.title,
      feedUrl: originFeedUrl,
      isRead: categories.includes("user/-/state/com.google/read"),
      isStarred: categories.includes("user/-/state/com.google/starred"),
    };
  }

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

  static async getReaderStream(streamId: string): Promise<Article[]> {
    const response = await api.get<ReaderApiStreamResponse>(
      `${this.greaderBaseUrl}/stream/contents/${encodeURIComponent(streamId)}?output=json&n=250`,
    );

    const items = Array.isArray(response.data?.items)
      ? response.data.items
      : [];
    return items.map((item, index) => this.toArticle(item, index));
  }

  static async markAllRead(streamId: string): Promise<void> {
    const body = new URLSearchParams({ s: streamId, ts: String(Date.now()) });

    await api.post(`${this.greaderBaseUrl}/mark-all-as-read`, body.toString(), {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });
  }

  private static async editArticleTags(
    articleId: number,
    { addTag, removeTag }: { addTag?: string; removeTag?: string },
  ): Promise<void> {
    const body = new URLSearchParams({
      i: this.toReaderItemId(articleId),
      async: "true",
    });

    if (addTag) {
      body.append("a", addTag);
    }

    if (removeTag) {
      body.append("r", removeTag);
    }

    await api.post(`${this.greaderBaseUrl}/edit-tag`, body.toString(), {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    });
  }

  static async setArticleReadState(
    articleId: number,
    isRead: boolean,
  ): Promise<void> {
    if (isRead) {
      await this.editArticleTags(articleId, {
        addTag: "user/-/state/com.google/read",
      });
      return;
    }

    await this.editArticleTags(articleId, {
      removeTag: "user/-/state/com.google/read",
    });
  }

  static async setArticleStarredState(
    articleId: number,
    isStarred: boolean,
  ): Promise<void> {
    if (isStarred) {
      await this.editArticleTags(articleId, {
        addTag: "user/-/state/com.google/starred",
      });
      return;
    }

    await this.editArticleTags(articleId, {
      removeTag: "user/-/state/com.google/starred",
    });
  }
}
