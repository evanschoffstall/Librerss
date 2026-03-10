import { buildDdgReferer } from "@/lib/fetch/referer";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

// ── fetch/referer – buildDdgReferer ─────────────────────────────────────────

describe("fetch/referer – buildDdgReferer", () => {
  test("builds referer from URL slug", () => {
    const result = buildDdgReferer(
      "https://example.com/articles/ai-breakthroughs-2024",
    );
    expect(result).toContain("duckduckgo.com");
    expect(result).toContain("ai+breakthroughs+2024");
  });

  test("falls back for invalid URL", () => {
    const result = buildDdgReferer("not a url @@##");
    expect(result).toBe("https://duckduckgo.com/?q=news+right+now&ia=web");
  });

  test("uses default query when slug is empty", () => {
    const result = buildDdgReferer("https://example.com/");
    expect(result).toContain("duckduckgo.com");
    expect(result).toContain("news+right+now");
  });

  test("strips file extension from slug", () => {
    const result = buildDdgReferer("https://example.com/article.html");
    expect(result).toContain("article");
    expect(result).not.toContain(".html");
  });
});
