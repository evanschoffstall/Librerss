// API service classes for LibreRSS

import axios from "axios";
import { parseReaderItemId, toReaderItemId } from "../core/reader-item-id";
import type { Article, AuthSession, AuthUser, FeedSource } from "../core/types";
import { normalizeDistinctUrlList } from "../utils/url";

/** Default timeout for all API calls (ms). Prevents indefinite hangs. */
const REQUEST_TIMEOUT_MS = 15_000;

const api = axios.create({ timeout: REQUEST_TIMEOUT_MS });

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
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

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

const READER_STATE_TAGS = {
  read: "user/-/state/com.google/read",
  starred: "user/-/state/com.google/starred",
} as const;

function resolvePublishedTimestamp(item: ReaderApiItem): number {
  if (typeof item.published === "number") {
    return item.published * 1000;
  }

  if (typeof item.updated === "number") {
    return item.updated * 1000;
  }

  return Date.now();
}

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
    { skipRefresh = false }: { skipRefresh?: boolean } = {},
  ): Promise<BatchFeedResponseItem[]> {
    const normalizedUrls = normalizeDistinctUrlList(urls);

    if (normalizedUrls.length === 0) {
      return [];
    }

    const response = await withRequestDeadline(
      api.post(`${this.baseUrl}/feeds/batch`, {
        urls: normalizedUrls,
        skipRefresh,
      }),
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

  static async renameFeedSource(id: number, name: string): Promise<FeedSource> {
    const response = await api.patch(`${this.baseUrl}/feeds`, { id, name });
    return response.data;
  }
}

export class ArticleService {
  private static baseUrl = "/api";

  private static greaderBaseUrl = "/api/greader.php/reader/api/0";

  private static toArticle(item: ReaderApiItem, index: number): Article {
    const publicationDate = new Date(resolvePublishedTimestamp(item));
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
      id: (item.id ? parseReaderItemId(item.id) : null) ?? index + 1,
      title: item.title?.trim() || "Untitled",
      link,
      content: item.summary?.content || "",
      publicationDate,
      lastChecked: new Date(),
      feedId: 0,
      feedName: item.origin?.title,
      feedUrl: originFeedUrl,
      isRead: categories.includes(READER_STATE_TAGS.read),
      isStarred: categories.includes(READER_STATE_TAGS.starred),
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
      i: toReaderItemId(articleId),
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

  private static async setArticleTagState(
    articleId: number,
    tag: string,
    enabled: boolean,
  ): Promise<void> {
    await this.editArticleTags(articleId, {
      addTag: enabled ? tag : undefined,
      removeTag: enabled ? undefined : tag,
    });
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
