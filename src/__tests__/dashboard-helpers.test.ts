/**
 * Component Tests: Dashboard Helpers
 * Tests for src/app/dashboard/helpers/
 */

import { describe, expect, test } from "bun:test";

// ─── Article Content Helpers ──────────────────────────────────────────────────

describe("article-content helpers", () => {
  test("getUrlHostnameLabel extracts hostname", async () => {
    const { getUrlHostnameLabel } =
      await import("@/app/dashboard/helpers/article-content");
    expect(getUrlHostnameLabel("https://www.example.com/path")).toBe(
      "example.com",
    );
    expect(getUrlHostnameLabel("http://subdomain.example.com")).toBe(
      "subdomain.example.com",
    );
  });

  test("getUrlHostnameLabel removes www prefix", async () => {
    const { getUrlHostnameLabel } =
      await import("@/app/dashboard/helpers/article-content");
    expect(getUrlHostnameLabel("https://www.example.com")).toBe("example.com");
  });

  test("getUrlHostnameLabel handles invalid URLs", async () => {
    const { getUrlHostnameLabel } =
      await import("@/app/dashboard/helpers/article-content");
    expect(getUrlHostnameLabel("not-a-url")).toBe("not-a-url");
  });

  test("extractTextContent strips HTML tags", async () => {
    const { extractTextContent } =
      await import("@/app/dashboard/helpers/article-content");
    const html = "<p>Hello <strong>world</strong></p>";
    expect(extractTextContent(html)).toBe("Hello world");
  });

  test("extractTextContent handles nested tags", async () => {
    const { extractTextContent } =
      await import("@/app/dashboard/helpers/article-content");
    const html = "<div><p>Nested <em>content</em></p></div>";
    expect(extractTextContent(html)).toBe("Nested content");
  });

  test("truncateText limits length", async () => {
    const { truncateText } =
      await import("@/app/dashboard/helpers/article-content");
    const longText = "a".repeat(200);
    const result = truncateText(longText, 100);
    expect(result.length).toBeLessThanOrEqual(103); // 100 + "..."
    expect(result).toContain("...");
  });

  test("truncateText preserves short text", async () => {
    const { truncateText } =
      await import("@/app/dashboard/helpers/article-content");
    const shortText = "Short text";
    expect(truncateText(shortText, 100)).toBe(shortText);
  });
});

// ─── Favicons ─────────────────────────────────────────────────────────────────

describe("favicons", () => {
  test("getFaviconUrl generates favicon URL", async () => {
    const { getFaviconUrl } = await import("@/app/dashboard/helpers/favicons");
    const url = getFaviconUrl("https://example.com");
    expect(url).toContain("example.com");
  });

  test("getFaviconUrl handles URLs without protocol", async () => {
    const { getFaviconUrl } = await import("@/app/dashboard/helpers/favicons");
    const url = getFaviconUrl("example.com");
    expect(typeof url).toBe("string");
    expect(url).toBe("");
  });

  test("getHostnameLabel extracts clean hostname", async () => {
    const { getHostnameLabel } =
      await import("@/app/dashboard/helpers/favicons");
    expect(getHostnameLabel("https://www.example.com")).toBe("example.com");
    expect(getHostnameLabel("http://blog.example.com")).toBe(
      "blog.example.com",
    );
  });
});

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────

describe("keyboard-shortcuts", () => {
  test("getShortcutLabel formats keyboard shortcuts", async () => {
    const { getShortcutLabel } =
      await import("@/app/dashboard/helpers/keyboard-shortcuts");
    const label = getShortcutLabel(["ctrl", "k"]);
    expect(label).toContain("ctrl");
    expect(label).toContain("k");
  });

  test("isShortcutMatch detects shortcut matches", async () => {
    const { isShortcutMatch } =
      await import("@/app/dashboard/helpers/keyboard-shortcuts");

    const event = {
      key: "k",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent;

    expect(isShortcutMatch(event, ["ctrl", "k"])).toBe(true);
    expect(isShortcutMatch(event, ["ctrl", "j"])).toBe(false);
  });
});

// ─── View State ───────────────────────────────────────────────────────────────

describe("view-state", () => {
  test("createDefaultViewState returns initial state", async () => {
    const { createDefaultViewState } =
      await import("@/app/dashboard/helpers/view-state");
    const state = createDefaultViewState();
    expect(state).toEqual({
      view: "article-list",
      selectedFeedId: null,
      selectedArticle: null,
    });
  });

  test("isArticleListView detects article list view", async () => {
    const { isArticleListView } =
      await import("@/app/dashboard/helpers/view-state");
    expect(isArticleListView({ view: "article-list" })).toBe(true);
    expect(isArticleListView({ view: "settings" })).toBe(false);
  });
});

// ─── Filter Sort ──────────────────────────────────────────────────────────────

describe("filter-sort", () => {
  test("filterArticles by unread status", async () => {
    const { filterArticles } =
      await import("@/app/dashboard/helpers/filter-sort");
    const articles = [
      { id: 1, isRead: false },
      { id: 2, isRead: true },
      { id: 3, isRead: false },
    ];
    const result = filterArticles(articles, { unreadOnly: true });
    expect(result).toHaveLength(2);
    expect(result.every((a) => !a.isRead)).toBe(true);
  });

  test("filterArticles by starred status", async () => {
    const { filterArticles } =
      await import("@/app/dashboard/helpers/filter-sort");
    const articles = [
      { id: 1, isStarred: true },
      { id: 2, isStarred: false },
      { id: 3, isStarred: true },
    ];
    const result = filterArticles(articles, { starredOnly: true });
    expect(result).toHaveLength(2);
    expect(result.every((a) => a.isStarred)).toBe(true);
  });

  test("sortArticles by date descending", async () => {
    const { sortArticles } =
      await import("@/app/dashboard/helpers/filter-sort");
    const articles = [
      { id: 1, publishedAt: new Date("2024-01-01") },
      { id: 2, publishedAt: new Date("2024-01-03") },
      { id: 3, publishedAt: new Date("2024-01-02") },
    ];
    const result = sortArticles(articles, { by: "date", order: "desc" });
    expect(result[0]?.id).toBe(2);
    expect(result[2]?.id).toBe(1);
  });

  test("sortArticles by date ascending", async () => {
    const { sortArticles } =
      await import("@/app/dashboard/helpers/filter-sort");
    const articles = [
      { id: 1, publishedAt: new Date("2024-01-03") },
      { id: 2, publishedAt: new Date("2024-01-01") },
      { id: 3, publishedAt: new Date("2024-01-02") },
    ];
    const result = sortArticles(articles, { by: "date", order: "asc" });
    expect(result[0]?.id).toBe(2);
    expect(result[2]?.id).toBe(1);
  });
});
