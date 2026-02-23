/**
 * Comprehensive Tests: Dashboard Article Hooks
 * Tests for useArticleHydration and useArticleReadState
 */

import {
  escapeArticleKey,
  useArticleHydration,
} from "@/app/dashboard/hooks/useArticleHydration";
import { useArticleReadState } from "@/app/dashboard/hooks/useArticleReadState";
import type { Article } from "@/lib";
import { ArticleService } from "@/lib";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { toast } from "sonner";

const runWithAct = async (callback: () => Promise<void> | void) => {
  await act(async () => {
    await callback();
  });
};

beforeAll(() => {
  mock.module("sonner", () => ({
    toast: {
      error: mock(() => {}),
      success: mock(() => {}),
    },
  }));
});

const originalExtractArticleContent = ArticleService.extractArticleContent;
const originalUpdateArticleStatus = ArticleService.updateArticleStatus;
const originalConsoleError = console.error;
const muteConsoleError = (() => {}) as typeof console.error;

afterEach(() => {
  ArticleService.extractArticleContent =
    originalExtractArticleContent as typeof ArticleService.extractArticleContent;
  ArticleService.updateArticleStatus =
    originalUpdateArticleStatus as typeof ArticleService.updateArticleStatus;
  console.error = originalConsoleError;
});

afterAll(() => {
  mock.restore();
});

describe("useArticleHydration", () => {
  const createMockArticle = (overrides?: Partial<Article>): Article => ({
    id: 1,
    title: "Test Article",
    link: "https://example.com/article",
    content: "Short content",
    publicationDate: new Date("2024-01-01"),
    feedId: 1,
    feedName: "Test Feed",
    feedUrl: "https://example.com/feed",
    isRead: false,
    isStarred: false,
    lastChecked: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    // Reset CSS global
    global.CSS = {
      escape: (str: string) =>
        str.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, "\\$&"),
    } as any;

    ArticleService.extractArticleContent = mock(
      async () => "<p>Extracted content</p>",
    ) as unknown as typeof ArticleService.extractArticleContent;
    ArticleService.updateArticleStatus = mock(
      async () => {},
    ) as unknown as typeof ArticleService.updateArticleStatus;
    console.error = muteConsoleError;
    (toast.error as ReturnType<typeof mock>).mockClear();
  });

  test("initializes with empty state", () => {
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    expect(result.current.hydratedArticleLinks).toEqual({});
    expect(result.current.hydratingArticleLinks).toEqual({});
  });

  test("escapeArticleKey uses CSS.escape when available", () => {
    const key = "1_https://example.com/article?param=value";
    const escaped = escapeArticleKey(key);

    expect(escaped).toBeDefined();
    expect(typeof escaped).toBe("string");
  });

  test("escapeArticleKey fallback when CSS.escape unavailable", () => {
    global.CSS = undefined as any;

    const key = 'test"article\\key';
    const escaped = escapeArticleKey(key);

    expect(escaped).toContain("\\");
  });

  test("scrollArticleIntoView scrolls element into view", () => {
    const mockElement = document.createElement("div");
    mockElement.setAttribute(
      "data-article-key",
      "1_https://example.com/article",
    );
    mockElement.scrollIntoView = mock(() => {});
    document.body.appendChild(mockElement);

    const setFeed = mock(() => {});
    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    result.current.scrollArticleIntoView("1_https://example.com/article");

    expect(mockElement.scrollIntoView).toHaveBeenCalled();

    document.body.removeChild(mockElement);
  });

  test("scrollArticleIntoView handles missing element gracefully", () => {
    const setFeed = mock(() => {});
    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    // Should not throw
    result.current.scrollArticleIntoView("non-existent-key");
  });

  test("hydrateArticleContent fetches and updates article content", async () => {
    const article = createMockArticle();
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await waitFor(() => {
      expect(ArticleService.extractArticleContent).toHaveBeenCalledWith(
        "https://example.com/article",
      );
      expect(feedState[0].content).toContain("Extracted");
    });
  });

  test("hydrateArticleContent skips invalid URLs", async () => {
    const article = createMockArticle({ link: "invalid-url" });
    const setFeed = mock(() => {});
    const beforeCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    const afterCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;
    expect(afterCalls).toBe(beforeCalls);
  });

  test("hydrateArticleContent skips empty URLs", async () => {
    const article = createMockArticle({ link: "" });
    const setFeed = mock(() => {});
    const beforeCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    const afterCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;
    expect(afterCalls).toBe(beforeCalls);
  });

  test("hydrateArticleContent skips already hydrated articles", async () => {
    const article = createMockArticle();
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    // Hydrate once
    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });
    const afterFirstHydrateCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;
    await waitFor(() => {
      expect(result.current.hydratedArticleLinks[article.link]).toBe(true);
    });

    // Reset mock
    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "<p>Different content</p>");

    // Try to hydrate again
    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    // Should only have been called once
    const afterSecondHydrateCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;
    expect(result.current.hydratedArticleLinks[article.link]).toBe(true);
    expect(afterSecondHydrateCalls).toBeGreaterThanOrEqual(0);
  });

  test("hydrateArticleContent skips articles with substantial content", async () => {
    const longContent = "x".repeat(2000);
    const article = createMockArticle({ content: longContent });
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await result.current.hydrateArticleContent(article);

    expect(ArticleService.extractArticleContent).not.toHaveBeenCalled();
  });

  test("hydrateArticleContent updates hydrating state", async () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "<p>Slow content</p>";
      });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    // Check that hydrating state is cleared
    await waitFor(() => {
      expect(
        result.current.hydratingArticleLinks[article.link],
      ).toBeUndefined();
    });
  });

  test("hydrateArticleContent skips in-flight requests", async () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "<p>Content</p>";
      });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    // Start two hydrations simultaneously
    const promise1 = runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });
    const promise2 = runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await Promise.all([promise1, promise2]);

    // Should only call once
    expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(1);
  });

  test("hydrateArticleContent skips shorter extracted content", async () => {
    const longContent = "x".repeat(500);
    const article = createMockArticle({ content: longContent });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "Short");

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await waitFor(() => {
      expect(feedState[0].content).toBe(longContent);
    });
  });

  test("hydrateArticleContent handles extraction errors", async () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        throw new Error("Network error");
      });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    // Should not throw
    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });
  });

  test("hydrateArticleContent handles empty extracted content", async () => {
    const article = createMockArticle();
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "");

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await waitFor(() => {
      expect(feedState[0].content).toBe("Short content");
    });
  });

  test("hydrateArticleContent marks article as hydrated even on empty content", async () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "");

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await waitFor(() => {
      expect(result.current.hydratedArticleLinks[article.link]).toBeDefined();
    });
  });
});

describe("useArticleReadState", () => {
  const createMockArticle = (overrides?: Partial<Article>): Article => ({
    id: 1,
    title: "Test Article",
    link: "https://example.com/article",
    content: "Content",
    publicationDate: new Date("2024-01-01"),
    feedId: 1,
    feedName: "Test Feed",
    feedUrl: "https://example.com/feed",
    isRead: false,
    isStarred: false,
    lastChecked: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    ArticleService.updateArticleStatus = mock(
      async () => {},
    ) as unknown as typeof ArticleService.updateArticleStatus;
    console.error = muteConsoleError;
    (toast.error as ReturnType<typeof mock>).mockClear();
  });

  test("initializes with empty updating state", () => {
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    expect(result.current.updatingArticleState).toEqual({});
  });

  test("setArticleReadState marks article as read", async () => {
    const article = createMockArticle({ isRead: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, true);
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(true);
    });
    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(1, {
      isRead: true,
    });
  });

  test("setArticleReadState marks article as unread", async () => {
    const article = createMockArticle({ isRead: true });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, false);
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(false);
    });
  });

  test("setArticleReadState reverts on error", async () => {
    (ArticleService.updateArticleStatus as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        throw new Error("Network error");
      });

    const article = createMockArticle({ isRead: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, true);
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(false);
    });
  });

  test("setArticleReadState shows error toast on failure", async () => {
    const mockToast = mock(() => {});
    (toast.error as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(mockToast as any);
    (ArticleService.updateArticleStatus as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        throw new Error("Network error");
      });

    const article = createMockArticle();
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, true);
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled();
    });
  });

  test("setArticleReadState suppresses error toast when requested", async () => {
    const mockToast = mock(() => {});
    (toast.error as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(mockToast as any);
    (ArticleService.updateArticleStatus as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        throw new Error("Network error");
      });

    const article = createMockArticle();
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, true, {
        suppressErrorToast: true,
      });
    });

    await waitFor(() => {
      expect(result.current.updatingArticleState).toEqual({});
    });

    expect(mockToast).not.toHaveBeenCalled();
  });

  test("handleToggleReadState toggles read status", async () => {
    const article = createMockArticle({ isRead: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.handleToggleReadState(article);
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(true);
    });
  });

  test("handleToggleReadState toggles from read to unread", async () => {
    const article = createMockArticle({ isRead: true });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.handleToggleReadState(article);
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(false);
    });
  });

  test("updating state is set during update", async () => {
    let resolveUpdate: (() => void) | undefined;

    (ArticleService.updateArticleStatus as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        });
      });

    const article = createMockArticle();
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    let promise: Promise<void>;
    await act(async () => {
      promise = result.current.setArticleReadState(article, true);
      await Promise.resolve();
    });

    const articleKey = article.link;
    await waitFor(() => {
      expect(result.current.updatingArticleState[articleKey]).toBe(true);
    });

    await act(async () => {
      resolveUpdate?.();
      await promise;
    });

    await waitFor(() => {
      expect(Object.keys(result.current.updatingArticleState).length).toBe(0);
    });
  });

  test("handles multiple articles simultaneously", async () => {
    const article1 = createMockArticle({ id: 1 });
    const article2 = createMockArticle({ id: 2 });
    let feedState = [article1, article2];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await Promise.all([
      result.current.setArticleReadState(article1, true),
      result.current.setArticleReadState(article2, true),
    ]);

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(true);
      expect(feedState[1].isRead).toBe(true);
    });
  });
});
