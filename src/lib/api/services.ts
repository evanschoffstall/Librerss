// API service classes for LibreRSS

import axios from "axios";
import type { Article, AuthSession, AuthUser, FeedSource } from "../core/types";
import { normalizeDistinctUrlList } from "../utils/url";
import {
  buildEditTagBody,
  parseReaderStreamItems,
  READER_STATE_TAGS,
  readerItemToArticle,
  type ReaderApiStreamResponse,
} from "./reader-api";

// ── HTTP infrastructure ───────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 15_000;

const api = axios.create({ timeout: REQUEST_TIMEOUT_MS });

const FORM_URLENCODED_HEADERS = {
  "content-type": "application/x-www-form-urlencoded",
} as const;

async function withRequestDeadline<T>(
  request: Promise<T>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error("Request timeout"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

// ── Shared response normalizers ───────────────────────────────────────────────

function ensureArrayResponse<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw new Error("Invalid response format");
  return data as T[];
}

interface BatchFeedResponseItem {
  url: string;
  articles: Article[];
  ok: boolean;
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

// ── AuthService ───────────────────────────────────────────────────────────────

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

// ── FeedService ───────────────────────────────────────────────────────────────

export class FeedService {
  private static baseUrl = "/api";

  static async getFeed(url: string): Promise<Article[]> {
    const response = await withRequestDeadline(
      api.get(`${this.baseUrl}/feeds?url=${encodeURIComponent(url)}`),
    );
    return ensureArrayResponse<Article>(response.data);
  }

  static async getFeedSources(): Promise<FeedSource[]> {
    const response = await withRequestDeadline(
      api.get(`${this.baseUrl}/feeds`),
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

    const response = await withRequestDeadline(
      api.post(
        `${this.baseUrl}/feeds/batch`,
        { urls: normalizedUrls, skipRefresh, forceRefresh, requestSource },
        { signal },
      ),
    );

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

  static async renameFeedSource(
    id: number,
    name: string,
    url?: string,
  ): Promise<FeedSource> {
    const response = await api.patch(`${this.baseUrl}/feeds`, {
      id,
      name,
      url,
    });
    return response.data;
  }
}

// ── ArticleService ────────────────────────────────────────────────────────────

export class ArticleService {
  private static baseUrl = "/api";
  private static greaderBaseUrl = "/api/greader.php/reader/api/0";

  private static streamContentsUrl(streamId: string): string {
    return `${this.greaderBaseUrl}/stream/contents/${encodeURIComponent(streamId)}?output=json&n=250`;
  }

  private static async postGreaderForm(
    path: string,
    body: URLSearchParams,
  ): Promise<void> {
    await api.post(`${this.greaderBaseUrl}${path}`, body.toString(), {
      headers: FORM_URLENCODED_HEADERS,
    });
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
      this.streamContentsUrl(streamId),
    );
    const items = parseReaderStreamItems(response.data);
    return items.map((item, index) => readerItemToArticle(item, index));
  }

  static async markAllRead(streamId: string): Promise<void> {
    const body = new URLSearchParams({ s: streamId, ts: String(Date.now()) });
    await this.postGreaderForm("/mark-all-as-read", body);
  }

  private static async setArticleTagState(
    articleId: number,
    tag: string,
    enabled: boolean,
  ): Promise<void> {
    const body = buildEditTagBody(articleId, {
      addTag: enabled ? tag : undefined,
      removeTag: enabled ? undefined : tag,
    });
    await this.postGreaderForm("/edit-tag", body);
  }

  static async setArticleReadState(
    articleId: number,
    isRead: boolean,
  ): Promise<void> {
    await this.setArticleTagState(articleId, READER_STATE_TAGS.read, isRead);
  }

  static async setArticleStarredState(
    articleId: number,
    isStarred: boolean,
  ): Promise<void> {
    await this.setArticleTagState(
      articleId,
      READER_STATE_TAGS.starred,
      isStarred,
    );
  }
}
