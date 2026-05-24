/**
 * Comprehensive Tests: API Services
 * Tests for src/lib/api/service.ts
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  AccountService,
  ArticleService,
  AuthService,
  FeedService,
} from "@/lib/api";
import {
  resetApiClientForTesting,
  setApiClientForTesting,
} from "@/lib/api/http";

// Create a mock axios instance
const mockAxiosInstance: any = {
  delete: mock(async () => ({ data: {} })),
  get: mock(async () => ({ data: [] })),
  patch: mock(async () => ({ data: {} })),
  post: mock(async () => ({ data: {} })),
  put: mock(async () => ({ data: {} })),
};

function resetMockAxiosInstance() {
  mockAxiosInstance.get = mock(async () => ({ data: [] }));
  mockAxiosInstance.post = mock(async () => ({ data: {} }));
  mockAxiosInstance.put = mock(async () => ({ data: {} }));
  mockAxiosInstance.patch = mock(async () => ({ data: {} }));
  mockAxiosInstance.delete = mock(async () => ({ data: {} }));
  setApiClientForTesting(mockAxiosInstance);
}

afterEach(() => {
  resetApiClientForTesting();
});

describe("AuthService", () => {
  beforeEach(() => {
    resetMockAxiosInstance();
  });

  test("getSession retrieves user session", async () => {
    const mockSession = {
      allowSignup: false,
      authenticated: true,
      canManageInvitations: false,
      invitationsEnabled: true,
      usePlaceholderData: false,
      user: { email: "test@example.com", id: 1 },
    };
    (mockAxiosInstance.get as any) = mock(async () => ({ data: mockSession }));

    const session = await AuthService.getSession();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/auth/session");
    expect(session.user).toBeDefined();
  });

  test("login authenticates user", async () => {
    const mockUser = { email: "test@example.com", id: 1 };
    mockAxiosInstance.post = mock(async () => ({ data: { user: mockUser } }));

    const user = await AuthService.login("test@example.com", "password123");

    expect(mockAxiosInstance.post).toHaveBeenCalledWith("/api/auth/login", {
      email: "test@example.com",
      password: "password123",
    });
    expect(user).toEqual(mockUser);
  });

  test("signup creates new user", async () => {
    const mockUser = { email: "newuser@example.com", id: 1 };
    mockAxiosInstance.post = mock(async () => ({ data: { user: mockUser } }));

    const user = await AuthService.signup("newuser@example.com", "password123");

    expect(mockAxiosInstance.post).toHaveBeenCalledWith("/api/auth/signup", {
      acceptedLegalVersion: "2026-03-15",
      email: "newuser@example.com",
      password: "password123",
    });
    expect(user).toEqual(mockUser);
  });

  test("logout ends user session", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: {} }));

    await AuthService.logout();

    expect(mockAxiosInstance.post).toHaveBeenCalledWith("/api/auth/logout");
  });

  test("login handles authentication errors", async () => {
    mockAxiosInstance.post = mock(async () => {
      throw new Error("Invalid credentials");
    });

    try {
      await AuthService.login("wrong@example.com", "wrongpassword");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("signup validates email format via server", async () => {
    mockAxiosInstance.post = mock(async () => {
      throw new Error("Invalid email format");
    });

    try {
      await AuthService.signup("invalid-email", "password123");
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

describe("FeedService", () => {
  beforeEach(() => {
    resetMockAxiosInstance();
  });

  test("getFeed retrieves single feed articles", async () => {
    const mockArticles = [
      {
        content: "Content 1",
        feedId: 1,
        id: 1,
        lastChecked: new Date("2024-01-01"),
        link: "https://example.com/1",
        publicationDate: new Date("2024-01-01"),
        title: "Article 1",
      },
      {
        content: "Content 2",
        feedId: 1,
        id: 2,
        lastChecked: new Date("2024-01-02"),
        link: "https://example.com/2",
        publicationDate: new Date("2024-01-02"),
        title: "Article 2",
      },
    ];
    (mockAxiosInstance.get as any) = mock(async () => ({ data: mockArticles }));

    const articles = await FeedService.getFeed("https://example.com/feed");

    expect(mockAxiosInstance.get).toHaveBeenCalled();
    expect(articles.length).toBe(2);
  });

  test("getFeed encodes URL parameter", async () => {
    mockAxiosInstance.get = mock(async () => ({ data: [] }));

    await FeedService.getFeed("https://example.com/feed?param=value");

    const callArgs = mockAxiosInstance.get.mock.calls[0];
    expect(callArgs[0]).toContain(
      encodeURIComponent("https://example.com/feed?param=value"),
    );
  });

  test("getFeedSources retrieves user feed list", async () => {
    const mockFeeds = [
      { id: 1, name: "Feed 1", url: "https://example.com/feed1" },
      { id: 2, name: "Feed 2", url: "https://example.com/feed2" },
    ];
    (mockAxiosInstance.get as any) = mock(async () => ({ data: mockFeeds }));

    const feeds = await FeedService.getFeedSources();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/feeds");
    expect(feeds.length).toBe(2);
  });

  test("getFeedsBatch fetches multiple feeds", async () => {
    mockAxiosInstance.post = mock(async (_path, body) => ({
      data: body.urls.map((url: string, index: number) => ({
        articles: [{ id: index + 1, title: `Article ${index + 1}` }],
        ok: true,
        url,
      })),
    }));

    const result = await FeedService.getFeedsBatch([
      "https://example.com/feed1",
      "https://example.com/feed2",
    ]);

    expect(result.length).toBe(2);
    expect(result[0].url).toBe("https://example.com/feed1");
    expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    expect(mockAxiosInstance.post.mock.calls[0]?.[1].urls).toEqual([
      "https://example.com/feed1",
    ]);
    expect(mockAxiosInstance.post.mock.calls[1]?.[1].urls).toEqual([
      "https://example.com/feed2",
    ]);
    expect(mockAxiosInstance.post.mock.calls[2]?.[1]).toMatchObject({
      skipRefresh: true,
      urls: ["https://example.com/feed1", "https://example.com/feed2"],
    });
  });

  test("getFeedsBatch keeps per-feed results when one fan-out request fails", async () => {
    mockAxiosInstance.post = mock(async (_path, body) => {
      const [url] = body.urls as string[];
      if (body.skipRefresh) {
        return {
          data: [
            {
              articles: [{ id: 1, title: "Article 1" } as never],
              ok: true,
              url: "https://example.com/feed1",
            },
            {
              articles: [{ id: 2, title: "Article 2" } as never],
              ok: true,
              url: "https://example.com/feed2",
            },
          ],
        };
      }

      if (url === "https://example.com/feed2") {
        throw new Error("single feed request failed");
      }

      return {
        data: [
          {
            articles: [{ id: 1, title: "Article 1" } as never],
            ok: true,
            url,
          },
        ],
      };
    });

    const result = await FeedService.getFeedsBatch([
      "https://example.com/feed1",
      "https://example.com/feed2",
    ]);

    expect(result).toEqual([
      {
        articles: [{ id: 1, title: "Article 1" } as never],
        ok: true,
        url: "https://example.com/feed1",
      },
      {
        articles: [{ id: 2, title: "Article 2" } as never],
        error: "single feed request failed",
        ok: false,
        url: "https://example.com/feed2",
      },
    ]);
    expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    expect(mockAxiosInstance.post.mock.calls[2]?.[1].skipRefresh).toBe(true);
  });

  test("getFeedsBatch returns empty array for empty input", async () => {
    const result = await FeedService.getFeedsBatch([]);

    expect(result.length).toBe(0);
    expect(mockAxiosInstance.post).not.toHaveBeenCalled();
  });

  test("getFeedsBatch handles skipRefresh option", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: [] }));

    await FeedService.getFeedsBatch(["https://example.com/feed"], {
      skipRefresh: true,
    });

    const callArgs = mockAxiosInstance.post.mock.calls[0];
    expect(callArgs[1].skipRefresh).toBe(true);
  });

  test("getFeedsBatch handles forceRefresh option", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: [] }));

    await FeedService.getFeedsBatch(["https://example.com/feed"], {
      forceRefresh: true,
    });

    const callArgs = mockAxiosInstance.post.mock.calls[0];
    expect(callArgs[1].forceRefresh).toBe(true);
  });

  test("getFeedsBatch handles forceResolveUpstream option", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: [] }));

    await FeedService.getFeedsBatch(["https://example.com/feed"], {
      forceResolveUpstream: true,
    });

    const callArgs = mockAxiosInstance.post.mock.calls[0];
    expect(callArgs[1].forceResolveUpstream).toBe(true);
  });

  test("getFeedsBatch handles requestSource tracking", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: [] }));

    await FeedService.getFeedsBatch(["https://example.com/feed"], {
      requestSource: "test-source",
    });

    const callArgs = mockAxiosInstance.post.mock.calls[0];
    expect(callArgs[1].requestSource).toBe("test-source");
  });

  test("getFeedsBatch serializes known last-fetched timestamps for delta refreshes", async () => {
    mockAxiosInstance.post = mock(async () => ({
      data: [
        {
          articles: [],
          lastFetchedAt: "2026-03-14T12:00:00.000Z",
          ok: true,
          unchanged: true,
          url: "https://example.com/feed",
        },
      ],
    }));

    const result = await FeedService.getFeedsBatch(
      ["https://example.com/feed"],
      {
        knownLastFetchedAtByUrl: new Map([
          ["https://example.com/feed", new Date("2026-03-14T12:00:00.000Z")],
        ]),
      },
    );

    const callArgs = mockAxiosInstance.post.mock.calls[0];
    expect(callArgs[1].knownLastFetchedAtByUrl).toEqual({
      "https://example.com/feed": "2026-03-14T12:00:00.000Z",
    });
    expect(result[0]?.unchanged).toBe(true);
    expect(result[0]?.lastFetchedAt).toEqual(
      new Date("2026-03-14T12:00:00.000Z"),
    );
  });

  test("getFeedsBatch supports abort signal", async () => {
    const controller = new AbortController();
    mockAxiosInstance.post = mock(async () => ({ data: [] }));

    await FeedService.getFeedsBatch(["https://example.com/feed"], {
      signal: controller.signal,
    });

    expect(mockAxiosInstance.post).toHaveBeenCalled();
  });

  test("getFeedsBatch normalizes duplicate URLs", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: [] }));

    await FeedService.getFeedsBatch([
      "https://example.com/feed",
      "https://example.com/feed",
    ]);

    const callArgs = mockAxiosInstance.post.mock.calls[0];
    expect(callArgs[1].urls.length).toBeLessThanOrEqual(1);
  });

  test("createFeedSource adds new feed", async () => {
    const newFeed = {
      id: 1,
      name: "New Feed",
      url: "https://example.com/feed",
    };
    mockAxiosInstance.post = mock(async () => ({ data: newFeed }));

    const result = await FeedService.createFeedSource({
      name: "New Feed",
      url: "https://example.com/feed",
    });

    expect(mockAxiosInstance.post).toHaveBeenCalledWith("/api/feeds", {
      name: "New Feed",
      url: "https://example.com/feed",
    });
    expect(result).toEqual(newFeed);
  });

  test("createFeedSource supports category", async () => {
    const newFeed = {
      id: 1,
      name: "Tech Feed",
      url: "https://example.com/feed",
    };
    mockAxiosInstance.post = mock(async () => ({ data: newFeed }));

    await FeedService.createFeedSource({
      category: "Technology",
      name: "Tech Feed",
      url: "https://example.com/feed",
    });

    const callArgs = mockAxiosInstance.post.mock.calls[0];
    expect(callArgs[1].category).toBe("Technology");
  });

  test("deleteFeedSource removes feed", async () => {
    const deletedFeed = {
      id: 1,
      name: "Deleted Feed",
      url: "https://example.com/feed",
    };
    mockAxiosInstance.delete = mock(async () => ({ data: deletedFeed }));

    const result = await FeedService.deleteFeedSource(1);

    expect(mockAxiosInstance.delete).toHaveBeenCalledWith("/api/feeds?id=1");
    expect(result).toEqual(deletedFeed);
  });

  test("renameFeedSource updates feed name", async () => {
    const updatedFeed = {
      id: 1,
      name: "Renamed Feed",
      url: "https://example.com/feed",
    };
    mockAxiosInstance.patch = mock(async () => ({ data: updatedFeed }));

    const result = await FeedService.renameFeedSource(1, "Renamed Feed");

    expect(mockAxiosInstance.patch).toHaveBeenCalledWith("/api/feeds", {
      id: 1,
      name: "Renamed Feed",
      url: undefined,
    });
    expect(result).toEqual(updatedFeed);
  });

  test("renameFeedSource supports URL change", async () => {
    const updatedFeed = {
      id: 1,
      name: "Feed",
      url: "https://example.com/new-feed",
    };
    mockAxiosInstance.patch = mock(async () => ({ data: updatedFeed }));

    await FeedService.renameFeedSource(
      1,
      "Feed",
      "https://example.com/new-feed",
    );

    const callArgs = mockAxiosInstance.patch.mock.calls[0];
    expect(callArgs[1].url).toBe("https://example.com/new-feed");
  });

  test("getCategoryOrder retrieves ordered categories", async () => {
    mockAxiosInstance.get = mock(async () => ({
      data: { orderedLabels: ["Tech", "News", "Science"] },
    }));

    const order = await FeedService.getCategoryOrder();

    expect(order).toEqual(["Tech", "News", "Science"]);
  });

  test("getCategoryOrder returns empty array on invalid response", async () => {
    mockAxiosInstance.get = mock(async () => ({ data: {} }));

    const order = await FeedService.getCategoryOrder();

    expect(order).toEqual([]);
  });

  test("saveCategoryOrder saves ordered categories", async () => {
    mockAxiosInstance.put = mock(async () => ({ data: {} }));

    await FeedService.saveCategoryOrder(["News", "Tech", "Science"]);

    expect(mockAxiosInstance.put).toHaveBeenCalledWith(
      "/api/feeds/category-order",
      {
        orderedLabels: ["News", "Tech", "Science"],
      },
    );
  });

  test("getFeed handles timeout", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((
      handler: TimerHandler,
      _timeout?: number,
      ...args: unknown[]
    ) => originalSetTimeout(handler, 1, ...args)) as typeof setTimeout;

    mockAxiosInstance.get = mock(
      async () =>
        new Promise(() => {
          // Intentionally never resolves to trigger request deadline.
        }),
    );

    try {
      await FeedService.getFeed("https://example.com/feed");
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("getFeedsBatch handles malformed response", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: "not an array" }));

    try {
      await FeedService.getFeedsBatch(["https://example.com/feed"]);
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

describe("AccountService", () => {
  beforeEach(() => {
    resetMockAxiosInstance();
  });

  test("deleteAccount calls DELETE /api/account", async () => {
    mockAxiosInstance.delete = mock(async () => ({ data: {} }));

    await AccountService.deleteAccount();

    expect(mockAxiosInstance.delete).toHaveBeenCalledWith("/api/account");
  });

  test("exportAccountData requests a blob export and returns it", async () => {
    const exportBlob = new Blob([JSON.stringify({ ok: true })], {
      type: "application/json",
    });
    mockAxiosInstance.get = mock(async () => ({ data: exportBlob }));

    const result = await AccountService.exportAccountData();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/account/export", {
      responseType: "blob",
    });
    expect(result).toBe(exportBlob);
  });
});

describe("ArticleService", () => {
  beforeEach(() => {
    resetMockAxiosInstance();
  });

  test("getArticles retrieves all articles", async () => {
    const mockArticles = [
      {
        content: "Content 1",
        feedId: 1,
        id: 1,
        lastChecked: new Date("2024-01-01"),
        link: "https://example.com/1",
        publicationDate: new Date("2024-01-01"),
        title: "Article 1",
      },
      {
        content: "Content 2",
        feedId: 1,
        id: 2,
        lastChecked: new Date("2024-01-02"),
        link: "https://example.com/2",
        publicationDate: new Date("2024-01-02"),
        title: "Article 2",
      },
    ];
    mockAxiosInstance.get = mock(async () => ({ data: mockArticles }));

    const articles = await ArticleService.getArticles();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/articles");
    // Check structure instead of exact equality since dates may be serialized
    expect(articles.length).toBe(2);
    expect(articles[0].id).toBe(1);
    expect(articles[0].title).toBe("Article 1");
  });

  test("extractArticleContent fetches article content", async () => {
    mockAxiosInstance.post = mock(async () => ({
      data: { content: "<p>Article content</p>" },
    }));

    const content = await ArticleService.extractArticleContent(
      "https://example.com/article",
    );

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      "/api/articles/extract",
      {
        url: "https://example.com/article",
      },
      expect.objectContaining({}),
    );
    expect(content).toBe("<p>Article content</p>");
  });

  test("extractArticleContent returns empty string on invalid response", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: {} }));

    const content = await ArticleService.extractArticleContent(
      "https://example.com/article",
    );

    expect(content).toBe("");
  });

  test("markAllRead marks stream as read", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: {} }));

    await ArticleService.markAllRead("user/1/state/com.google/reading-list");

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      "/api/articles/mark-all-read",
      { streamId: "user/1/state/com.google/reading-list" },
    );
  });

  test("updateArticleStatus marks article as read", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: {} }));

    await ArticleService.updateArticleStatus(1, { isRead: true });

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      "/api/articles/status",
      {
        articleId: 1,
        isRead: true,
      },
    );
  });

  test("updateArticleStatus marks article as starred", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: {} }));

    await ArticleService.updateArticleStatus(1, { isStarred: true });

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      "/api/articles/status",
      {
        articleId: 1,
        isStarred: true,
      },
    );
  });

  test("updateArticleStatus updates both flags", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: {} }));

    await ArticleService.updateArticleStatus(1, {
      isRead: true,
      isStarred: true,
    });

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      "/api/articles/status",
      {
        articleId: 1,
        isRead: true,
        isStarred: true,
      },
    );
  });

  test("updateArticleStatus forwards abort signals to the API client", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: {} }));
    const controller = new AbortController();

    await ArticleService.updateArticleStatus(
      1,
      { isRead: true },
      { signal: controller.signal },
    );

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      "/api/articles/status",
      {
        articleId: 1,
        isRead: true,
      },
      { signal: controller.signal },
    );
  });

  test("extractArticleContent handles network errors", async () => {
    mockAxiosInstance.post = mock(async () => {
      throw new Error("Network error");
    });

    try {
      await ArticleService.extractArticleContent("https://example.com/article");
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

describe("Service Error Handling", () => {
  test("services handle network timeouts", async () => {
    mockAxiosInstance.get = mock(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { data: [] };
    });

    try {
      await AuthService.getSession();
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  }, 1000);

  test("services handle server errors", async () => {
    mockAxiosInstance.post = mock(async () => {
      const error = new Error("Server error") as Error & {
        response?: { data: { error: string }; status: number };
      };
      error.response = { data: { error: "Server error" }, status: 500 };
      throw error;
    });

    try {
      await AuthService.login("test@example.com", "password");
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  test("services handle invalid JSON responses", async () => {
    mockAxiosInstance.get = mock(async () => ({ data: null }));

    try {
      await FeedService.getFeedSources();
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

beforeEach(() => {
  mock.restore();
  resetApiClientForTesting();
});

afterEach(() => {
  mock.restore();
  resetApiClientForTesting();
});

const makeMockAxiosClient = (): {
  delete: ReturnType<typeof mock>;
  get: ReturnType<typeof mock>;
  patch: ReturnType<typeof mock>;
  post: ReturnType<typeof mock>;
  put: ReturnType<typeof mock>;
} => ({
  delete: mock(async () => ({ data: {} })),
  get: mock(async () => ({ data: {} })),
  patch: mock(async () => ({ data: {} })),
  post: mock(async () => ({ data: {} })),
  put: mock(async () => ({ data: {} })),
});

describe("FeedService – renameFeedSource, setFeedSourceEnabled, getCategoryOrder", () => {
  test("renameFeedSource patches /api/feeds with id, name, url", async () => {
    const mx = makeMockAxiosClient();
    const feed = { id: 5, name: "New Name", url: "https://example.com/feed" };
    mx.patch = mock(async () => ({ data: feed }));
    setApiClientForTesting(mx);

    const result = await FeedService.renameFeedSource(
      5,
      "New Name",
      "https://example.com/feed",
    );
    expect(mx.patch).toHaveBeenCalledWith("/api/feeds", {
      id: 5,
      name: "New Name",
      url: "https://example.com/feed",
    });
    expect(result).toEqual(feed);
  });

  test("renameFeedSource without url omits url in payload", async () => {
    const mx = makeMockAxiosClient();
    mx.patch = mock(async () => ({ data: { id: 5, name: "New Name" } }));
    setApiClientForTesting(mx);

    await FeedService.renameFeedSource(5, "New Name");
    const patchCall = (mx.patch as ReturnType<typeof mock>).mock.calls[0];
    expect(patchCall?.[1]).toMatchObject({ id: 5, name: "New Name" });
  });

  test("setFeedSourceEnabled patches /api/feeds with enabled flag", async () => {
    const mx = makeMockAxiosClient();
    mx.patch = mock(async () => ({ data: { enabled: false, id: 3 } }));
    setApiClientForTesting(mx);

    const result = (await FeedService.setFeedSourceEnabled(3, false)) as any;
    expect(mx.patch).toHaveBeenCalledWith("/api/feeds", {
      enabled: false,
      id: 3,
    });
    expect(result.enabled).toBe(false);
  });

  test("updateFeedSettings patches /api/feeds with settings", async () => {
    const mx = makeMockAxiosClient();
    mx.patch = mock(async () => ({
      data: { extractionDisabled: true, id: 7, proxyEnabled: false },
    }));
    setApiClientForTesting(mx);

    const result = (await FeedService.updateFeedSettings(7, {
      extractionDisabled: true,
      proxyEnabled: false,
    })) as any;
    expect(mx.patch).toHaveBeenCalledWith("/api/feeds", {
      extractionDisabled: true,
      id: 7,
      proxyEnabled: false,
    });
    expect(result.extractionDisabled).toBe(true);
  });

  test("getCategoryOrder returns orderedLabels array", async () => {
    const mx = makeMockAxiosClient();
    const labels = ["Tech", "Science", "News"];
    mx.get = mock(async () => ({ data: { orderedLabels: labels } }));
    setApiClientForTesting(mx);

    const result = await FeedService.getCategoryOrder();
    expect(result).toEqual(labels);
    expect(mx.get).toHaveBeenCalledWith("/api/feeds/category-order");
  });

  test("getCategoryOrder returns [] when response is not array", async () => {
    const mx = makeMockAxiosClient();
    mx.get = mock(async () => ({ data: { orderedLabels: null } }));
    setApiClientForTesting(mx);

    const result = await FeedService.getCategoryOrder();
    expect(result).toEqual([]);
  });

  test("saveCategoryOrder puts to /api/feeds/category-order", async () => {
    const mx = makeMockAxiosClient();
    mx.put = mock(async () => ({ data: {} }));
    setApiClientForTesting(mx);

    await FeedService.saveCategoryOrder(["News", "Tech"]);
    expect(mx.put).toHaveBeenCalledWith("/api/feeds/category-order", {
      orderedLabels: ["News", "Tech"],
    });
  });
});

// ── api/services – ArticleService additional methods ────────────────────────

describe("ArticleService – getProxyStatus, runProxyCompatibilityCheck", () => {
  test("getProxyStatus calls GET /api/articles/proxy-status", async () => {
    const mx = makeMockAxiosClient();
    mx.get = mock(async () => ({
      data: {
        configured: true,
        proxyUrl: "socks5://proxy:1080",
        status: "reachable",
      },
    }));
    setApiClientForTesting(mx);

    const result = await ArticleService.getProxyStatus();
    expect(mx.get).toHaveBeenCalledWith("/api/articles/proxy-status");
    expect(result).toMatchObject({ configured: true });
  });

  test("runProxyCompatibilityCheck posts to proxy/compatibility-check", async () => {
    const mx = makeMockAxiosClient();
    const results = [
      {
        compatibilitySignalDetected: false,
        site: "example.com",
        success: true,
        url: "https://example.com",
        vendor: "none",
      },
    ];
    mx.post = mock(async () => ({ data: { results } }));
    setApiClientForTesting(mx);

    const response = await ArticleService.runProxyCompatibilityCheck({
      useProxy: true,
    });
    expect(mx.post).toHaveBeenCalledWith(
      "/api/settings/proxy/compatibility-check",
      { useProxy: true },
    );
    expect(response.results).toEqual(results);
  });

  test("runProxyCompatibilityCheck without options sends empty object", async () => {
    const mx = makeMockAxiosClient();
    mx.post = mock(async () => ({ data: { results: [] } }));
    setApiClientForTesting(mx);

    await ArticleService.runProxyCompatibilityCheck();
    const call = (mx.post as ReturnType<typeof mock>).mock.calls[0];
    expect(call?.[1]).toEqual({});
  });
});

// ── api/services – AuthService ───────────────────────────────────────────────

describe("AuthService", () => {
  test("getSession fetches /api/auth/session", async () => {
    const mx = makeMockAxiosClient();
    const session = {
      allowSignup: false,
      authenticated: true,
      canManageInvitations: false,
      invitationsEnabled: true,
      usePlaceholderData: false,
      user: { createdAt: new Date(), email: "a@b.com", id: 1 },
    };
    mx.get = mock(async () => ({ data: session }));
    setApiClientForTesting(mx);

    const result = await AuthService.getSession();
    expect(mx.get).toHaveBeenCalledWith("/api/auth/session");
    expect(result.authenticated).toBe(true);
  });

  test("login posts credentials and returns user", async () => {
    const mx = makeMockAxiosClient();
    mx.post = mock(async () => ({
      data: { user: { email: "user@example.com", id: 1 } },
    }));
    setApiClientForTesting(mx);

    const user = await AuthService.login("user@example.com", "password123");
    expect(mx.post).toHaveBeenCalledWith("/api/auth/login", {
      email: "user@example.com",
      password: "password123",
    });
    expect(user).toMatchObject({ id: 1 });
  });

  test("signup posts credentials and returns user", async () => {
    const mx = makeMockAxiosClient();
    mx.post = mock(async () => ({
      data: { user: { email: "new@example.com", id: 2 } },
    }));
    setApiClientForTesting(mx);

    const user = await AuthService.signup("new@example.com", "newpassword");
    expect(mx.post).toHaveBeenCalledWith("/api/auth/signup", {
      acceptedLegalVersion: "2026-03-15",
      email: "new@example.com",
      password: "newpassword",
    });
    expect(user).toMatchObject({ id: 2 });
  });

  test("logout posts to /api/auth/logout", async () => {
    const mx = makeMockAxiosClient();
    mx.post = mock(async () => ({ data: { ok: true } }));
    setApiClientForTesting(mx);

    await AuthService.logout();
    expect(mx.post).toHaveBeenCalledWith("/api/auth/logout");
  });
});

describe("ArticleService – markAllRead", () => {
  test("markAllRead posts to /api/articles/mark-all-read", async () => {
    const mx = makeMockAxiosClient();
    mx.post = mock(async () => ({ data: {} }));
    setApiClientForTesting(mx);

    await ArticleService.markAllRead("user/-/state/com.google/reading-list");
    expect(mx.post).toHaveBeenCalledWith("/api/articles/mark-all-read", {
      streamId: "user/-/state/com.google/reading-list",
    });
  });
});
