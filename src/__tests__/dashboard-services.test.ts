/**
 * Component Tests: Dashboard Services
 * Tests for src/app/dashboard/services/
 */

import { describe, expect, test } from "bun:test";

// ─── Article Content Services ─────────────────────────────────────────────────

describe("article-content services", () => {
  test("getUrlHostnameLabel extracts hostname", async () => {
    const { getUrlHostnameLabel } =
      await import("@/app/dashboard/services/article-content");
    expect(getUrlHostnameLabel("https://www.example.com/path")).toBe(
      "example.com",
    );
    expect(getUrlHostnameLabel("http://subdomain.example.com")).toBe(
      "subdomain.example.com",
    );
  });

  test("getUrlHostnameLabel removes www prefix", async () => {
    const { getUrlHostnameLabel } =
      await import("@/app/dashboard/services/article-content");
    expect(getUrlHostnameLabel("https://www.example.com")).toBe("example.com");
  });

  test("getUrlHostnameLabel handles invalid URLs", async () => {
    const { getUrlHostnameLabel } =
      await import("@/app/dashboard/services/article-content");
    expect(getUrlHostnameLabel("not-a-url")).toBe("not-a-url");
  });
});

// ─── Favicons ─────────────────────────────────────────────────────────────────

describe("favicons", () => {
  test("getFaviconUrl generates favicon URL", async () => {
    const { getFaviconUrl } = await import("@/app/dashboard/services/favicons");
    const url = getFaviconUrl("https://example.com");
    expect(url).toContain("example.com");
  });

  test("getFaviconUrl handles URLs without protocol", async () => {
    const { getFaviconUrl } = await import("@/app/dashboard/services/favicons");
    const url = getFaviconUrl("example.com");
    expect(typeof url).toBe("string");
    expect(url).toBe("");
  });

  test("getHostnameLabel extracts clean hostname", async () => {
    const { getHostnameLabel } =
      await import("@/app/dashboard/services/favicons");
    expect(getHostnameLabel("https://www.example.com")).toBe("example.com");
    expect(getHostnameLabel("http://blog.example.com")).toBe(
      "blog.example.com",
    );
  });
});

// ─── Filter Sort ──────────────────────────────────────────────────────────────

describe("article-query", () => {
  test("filterArticles by unread status", async () => {
    const { filterArticles } =
      await import("@/app/dashboard/services/article-query");
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
      await import("@/app/dashboard/services/article-query");
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
      await import("@/app/dashboard/services/article-query");
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
      await import("@/app/dashboard/services/article-query");
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
