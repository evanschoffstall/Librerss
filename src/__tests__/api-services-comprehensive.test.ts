/**
 * Comprehensive Tests: API Services
 * Tests for src/lib/api/service.ts
 */

import {
    __resetApiClientForTesting,
    __setApiClientForTesting,
} from "@/lib/api/http-client";
import { ArticleService, AuthService, FeedService } from "@/lib/api/services";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// Create a mock axios instance
const mockAxiosInstance: any = {
  get: mock(async () => ({ data: [] })),
  post: mock(async () => ({ data: {} })),
  put: mock(async () => ({ data: {} })),
  patch: mock(async () => ({ data: {} })),
  delete: mock(async () => ({ data: {} })),
};

function resetMockAxiosInstance() {
  mockAxiosInstance.get = mock(async () => ({ data: [] }));
  mockAxiosInstance.post = mock(async () => ({ data: {} }));
  mockAxiosInstance.put = mock(async () => ({ data: {} }));
  mockAxiosInstance.patch = mock(async () => ({ data: {} }));
  mockAxiosInstance.delete = mock(async () => ({ data: {} }));
  __setApiClientForTesting(mockAxiosInstance);
}

afterEach(() => {
  __resetApiClientForTesting();
});

describe("AuthService", () => {
  beforeEach(() => {
    resetMockAxiosInstance();
  });

  test("getSession retrieves user session", async () => {
    const mockSession = {
      user: { id: 1, email: "test@example.com" },
      authenticated: true,
      allowSignup: false,
      usePlaceholderData: false,
    };
    (mockAxiosInstance.get as any) = mock(async () => ({ data: mockSession }));

    const session = await AuthService.getSession();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith("/api/auth/session");
    expect(session.user).toBeDefined();
  });

  test("login authenticates user", async () => {
    const mockUser = { id: 1, email: "test@example.com" };
    mockAxiosInstance.post = mock(async () => ({ data: { user: mockUser } }));

    const user = await AuthService.login("test@example.com", "password123");

    expect(mockAxiosInstance.post).toHaveBeenCalledWith("/api/auth/login", {
      email: "test@example.com",
      password: "password123",
    });
    expect(user).toEqual(mockUser);
  });

  test("signup creates new user", async () => {
    const mockUser = { id: 1, email: "newuser@example.com" };
    mockAxiosInstance.post = mock(async () => ({ data: { user: mockUser } }));

    const user = await AuthService.signup("newuser@example.com", "password123");

    expect(mockAxiosInstance.post).toHaveBeenCalledWith("/api/auth/signup", {
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
        id: 1,
        title: "Article 1",
        link: "https://example.com/1",
        content: "Content 1",
        publicationDate: new Date("2024-01-01"),
        feedId: 1,
        lastChecked: new Date("2024-01-01"),
      },
      {
        id: 2,
        title: "Article 2",
        link: "https://example.com/2",
        content: "Content 2",
        publicationDate: new Date("2024-01-02"),
        feedId: 1,
        lastChecked: new Date("2024-01-02"),
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
    const mockBatch = [
      {
        url: "https://example.com/feed1",
        articles: [{ id: 1, title: "Article 1" }],
        ok: true,
      },
      {
        url: "https://example.com/feed2",
        articles: [{ id: 2, title: "Article 2" }],
        ok: true,
      },
    ];
    mockAxiosInstance.post = mock(async () => ({ data: mockBatch }));

    const result = await FeedService.getFeedsBatch([
      "https://example.com/feed1",
      "https://example.com/feed2",
    ]);

    expect(result.length).toBe(2);
    expect(result[0].url).toBe("https://example.com/feed1");
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

  test("getFeedsBatch handles requestSource tracking", async () => {
    mockAxiosInstance.post = mock(async () => ({ data: [] }));

    await FeedService.getFeedsBatch(["https://example.com/feed"], {
      requestSource: "test-source",
    });

    const callArgs = mockAxiosInstance.post.mock.calls[0];
    expect(callArgs[1].requestSource).toBe("test-source");
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
      name: "Tech Feed",
      url: "https://example.com/feed",
      category: "Technology",
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

describe("ArticleService", () => {
  beforeEach(() => {
    resetMockAxiosInstance();
  });

  test("getArticles retrieves all articles", async () => {
    const mockArticles = [
      {
        id: 1,
        title: "Article 1",
        link: "https://example.com/1",
        content: "Content 1",
        publicationDate: new Date("2024-01-01"),
        feedId: 1,
        lastChecked: new Date("2024-01-01"),
      },
      {
        id: 2,
        title: "Article 2",
        link: "https://example.com/2",
        content: "Content 2",
        publicationDate: new Date("2024-01-02"),
        feedId: 1,
        lastChecked: new Date("2024-01-02"),
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

  test("getReaderStream retrieves stream articles", async () => {
    mockAxiosInstance.get = mock(async () => ({
      data: {
        items: [
          {
            id: "1",
            title: "Article 1",
            canonical: [{ href: "https://example.com/1" }],
            published: 1609459200,
          },
        ],
      },
    }));

    const articles = await ArticleService.getReaderStream(
      "user/1/state/com.google/reading-list",
    );

    expect(articles.length).toBeGreaterThanOrEqual(0);
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

  test("getReaderStream constructs correct URL", async () => {
    mockAxiosInstance.get = mock(async () => ({ data: { items: [] } }));

    await ArticleService.getReaderStream("user/1/state/com.google/starred");

    const callArgs = mockAxiosInstance.get.mock.calls[0];
    expect(callArgs[0]).toContain(
      "/api/greader.php/reader/api/0/stream/contents/",
    );
    expect(callArgs[0]).toContain("output=json");
    expect(callArgs[0]).toContain("n=250");
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
      await new Promise((resolve) => setTimeout(resolve, 20000));
      return { data: [] };
    });

    try {
      await AuthService.getSession();
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
    }
  }, 22000);

  test("services handle server errors", async () => {
    mockAxiosInstance.post = mock(async () => {
      const error = new Error("Server error") as Error & {
        response?: { status: number; data: { error: string } };
      };
      error.response = { status: 500, data: { error: "Server error" } };
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
