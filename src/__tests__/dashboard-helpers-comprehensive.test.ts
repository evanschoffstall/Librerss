import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
  window.localStorage.clear();
});

afterEach(() => {
  mock.restore();
  window.localStorage.clear();
});

type ArticleLike = {
  id: number;
  title: string;
  link: string;
  content: string;
  publicationDate: Date;
  lastChecked: Date;
  feedId: number;
  feedName?: string;
  feedUrl?: string;
  isRead?: boolean;
  isStarred?: boolean;
};

const makeArticle = (overrides: Partial<ArticleLike> = {}): ArticleLike => ({
  id: 1,
  title: "Title",
  link: "https://example.com/article",
  content: "body",
  publicationDate: new Date("2024-01-01T00:00:00.000Z"),
  lastChecked: new Date("2024-01-01T00:00:00.000Z"),
  feedId: 1,
  ...overrides,
});

describe("dashboard article helpers comprehensive", () => {
  test("dedupeAndSortArticles drops empty links and prefers longer content", async () => {
    const { dedupeAndSortArticles, getArticleKey } =
      await import("@/app/dashboard/helpers/article-helpers");

    const a1 = makeArticle({
      id: 1,
      link: " https://example.com/a ",
      content: "short",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    });
    const a1Better = makeArticle({
      id: 2,
      link: "https://example.com/a",
      content: "this content is definitely longer",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    });
    const a2 = makeArticle({
      id: 3,
      link: "https://example.com/b",
      publicationDate: new Date("2024-01-03T00:00:00.000Z"),
    });
    const empty = makeArticle({ id: 4, link: "   " });

    const result = dedupeAndSortArticles([a1, a1Better, a2, empty] as any);

    expect(result).toHaveLength(2);
    expect(result[0]?.link).toBe("https://example.com/b");
    expect(result[1]?.content).toBe("this content is definitely longer");
    expect(getArticleKey(a1 as any)).toBe("https://example.com/a");
  });

  test("dedupeAndSortArticles uses newer publicationDate as tiebreaker", async () => {
    const { dedupeAndSortArticles } =
      await import("@/app/dashboard/helpers/article-helpers");

    const older = makeArticle({
      id: 5,
      link: "https://example.com/c",
      content: "same-size",
      publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    });
    const newer = makeArticle({
      id: 6,
      link: "https://example.com/c",
      content: "same-size",
      publicationDate: new Date("2024-01-05T00:00:00.000Z"),
    });

    const result = dedupeAndSortArticles([older, newer] as any);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(6);
  });

  test("buildPreview handles overflow and non-overflow content", async () => {
    const { buildPreview } =
      await import("@/app/dashboard/helpers/article-content");

    const short = buildPreview("small");
    expect(short.preview).toBe("small");
    expect(short.hasOverflow).toBe(false);

    const longWithSpaces = `${"word ".repeat(45)}tail`;
    const overflow = buildPreview(longWithSpaces);
    expect(overflow.hasOverflow).toBe(true);
    expect(overflow.preview.length).toBeLessThanOrEqual(170);
    expect(overflow.preview.endsWith(" ")).toBe(false);

    const longWithoutSpaces = "x".repeat(300);
    const hardCut = buildPreview(longWithoutSpaces);
    expect(hardCut.hasOverflow).toBe(true);
    expect(hardCut.preview.length).toBe(170);
  });

  test("getArticleSourceLabel prioritizes feedName then hostname fallback", async () => {
    const { getArticleSourceLabel, getUrlHostnameLabel } =
      await import("@/app/dashboard/helpers/article-content");

    const named = makeArticle({
      feedName: "My Feed",
      feedUrl: "https://x.com",
    });
    expect(getArticleSourceLabel(named as any)).toBe("My Feed");

    const fromFeedUrl = makeArticle({
      feedName: "   ",
      feedUrl: "https://www.blog.example.com/post",
      link: "https://fallback.example/article",
    });
    expect(getArticleSourceLabel(fromFeedUrl as any)).toBe("blog.example.com");
    expect(getUrlHostnameLabel("https://www.news.example.com")).toBe(
      "news.example.com",
    );

    const fromLink = makeArticle({
      feedName: "",
      feedUrl: undefined,
      link: "not-a-url",
    });
    expect(getArticleSourceLabel(fromLink as any)).toBe("not-a-url");
  });

  test("getRichContentClass returns expanded and collapsed variants", async () => {
    const { getRichContentClass } =
      await import("@/app/dashboard/helpers/article-content");

    const expanded = getRichContentClass(true);
    const collapsed = getRichContentClass(false);

    expect(expanded).toContain("text-[0.97rem]");
    expect(expanded).toContain("[&_img]:max-w-full");
    expect(collapsed).toContain("text-[0.91rem]");
    expect(collapsed).toContain("[&_code]:rounded");
  });

  test("mapBatchResultsToArticles keeps article feedName when source name missing", async () => {
    const { mapBatchResultsToArticles } =
      await import("@/app/dashboard/helpers/batch-helpers");

    const result = mapBatchResultsToArticles(
      [
        {
          url: "https://feeds.example.com/rss",
          ok: true,
          articles: [
            makeArticle({
              feedName: "Example Feed",
              feedUrl: "https://feeds.example.com/rss",
            }),
          ],
        },
      ],
      new Map([["https://feeds.example.com/rss", undefined]]),
      false,
      () => [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.feedName).toBe("Example Feed");
  });

  test("mapBatchResultsToArticles does not set feedName to feed URL", async () => {
    const { mapBatchResultsToArticles } =
      await import("@/app/dashboard/helpers/batch-helpers");

    const result = mapBatchResultsToArticles(
      [
        {
          url: "https://feeds.example.com/rss",
          ok: true,
          articles: [
            makeArticle({
              feedName: undefined,
              feedUrl: "https://feeds.example.com/rss",
              link: "https://news.example.com/post",
            }),
          ],
        },
      ],
      new Map([["https://feeds.example.com/rss", undefined]]),
      false,
      () => [],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.feedName).toBeUndefined();
  });
});

describe("dashboard favicons comprehensive", () => {
  test("getFaviconCacheKey picks first valid hostname from candidates", async () => {
    const { getFaviconCacheKey } =
      await import("@/app/dashboard/helpers/favicons");

    expect(
      getFaviconCacheKey(
        undefined,
        "not-a-url",
        "https://news.example.com/path",
      ),
    ).toBe("news.example.com");
    expect(getFaviconCacheKey(undefined, "bad")).toBeNull();
  });

  test("hydrate loads valid persisted entries and drops expired failures", async () => {
    const v1Key = "librerss:favicon-index-cache:v1";
    const v2Key = "librerss:favicon-index-cache:v2";

    window.localStorage.setItem(v1Key, "legacy");
    window.localStorage.setItem(
      v2Key,
      JSON.stringify({
        "ok.example.com": { index: 4 },
        "legacy-number.example.com": 2,
        "expired.example.com": {
          index: -1,
          failedAt: Date.now() - 25 * 60 * 60 * 1000,
        },
        "legacy-failed.example.com": { index: -1 },
      }),
    );

    const { getCachedFaviconIndex } =
      await import("@/app/dashboard/helpers/favicons");

    expect(getCachedFaviconIndex("ok.example.com")).toBe(4);
    expect(getCachedFaviconIndex("legacy-number.example.com")).toBe(2);
    expect(getCachedFaviconIndex("expired.example.com")).toBe(0);
    expect(getCachedFaviconIndex("legacy-failed.example.com")).toBe(0);
    expect(window.localStorage.getItem(v1Key)).toBeNull();
  });

  test("cache index set/get works for success and failure entries", async () => {
    const { getCachedFaviconIndex, setCachedFaviconIndex } =
      await import("@/app/dashboard/helpers/favicons");

    expect(getCachedFaviconIndex("example.com")).toBe(0);

    setCachedFaviconIndex("example.com", 2);
    expect(getCachedFaviconIndex("example.com")).toBe(2);

    setCachedFaviconIndex("failed.example.com", -1);
    expect(getCachedFaviconIndex("failed.example.com")).toBe(-1);

    setCachedFaviconIndex(null, 99);
    expect(getCachedFaviconIndex(null)).toBe(0);
  });

  test("cache trimming keeps storage bounded after many inserts", async () => {
    const { getCachedFaviconIndex, setCachedFaviconIndex } =
      await import("@/app/dashboard/helpers/favicons");

    for (let index = 0; index < 430; index += 1) {
      setCachedFaviconIndex(`bulk-${index}.example.com`, index % 3);
    }

    const raw = window.localStorage.getItem("librerss:favicon-index-cache:v2");
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw ?? "{}");
    expect(Object.keys(parsed).length).toBeLessThanOrEqual(400);
    expect(
      getCachedFaviconIndex("bulk-429.example.com"),
    ).toBeGreaterThanOrEqual(0);
  });

  test("hydrate cache handles persisted payload shape safely", async () => {
    const key = "librerss:favicon-index-cache:v2";
    window.localStorage.setItem(
      key,
      JSON.stringify({
        "ok.example.com": { index: 3 },
        "legacy.example.com": 1,
        "": { index: 2 },
        "bad.example.com": { index: "x" },
      }),
    );

    const { getCachedFaviconIndex } =
      await import("@/app/dashboard/helpers/favicons");

    const ok = getCachedFaviconIndex("ok.example.com");
    const legacy = getCachedFaviconIndex("legacy.example.com");
    const bad = getCachedFaviconIndex("bad.example.com");

    expect(typeof ok).toBe("number");
    expect(typeof legacy).toBe("number");
    expect(bad).toBe(0);
  });

  test("merged favicon candidates include provider and direct icon URLs", async () => {
    const { getMergedFaviconCandidates, getFaviconUrl, getHostnameLabel } =
      await import("@/app/dashboard/helpers/favicons");

    const candidates = getMergedFaviconCandidates(
      "https://sub.blog.example.com/path",
      "https://example.org",
    );

    expect(candidates.length).toBeGreaterThan(8);
    expect(
      candidates.some((url) => url.includes("google.com/s2/favicons")),
    ).toBe(true);
    expect(candidates.some((url) => url.endsWith("/favicon.ico"))).toBe(true);
    expect(getFaviconUrl("https://example.org")).toContain("example.org");
    expect(getFaviconUrl("not-a-url")).toBe("");
    expect(getHostnameLabel("https://www.Example.com/path")).toBe(
      "example.com",
    );

    const ipCandidates = getMergedFaviconCandidates("http://127.0.0.1/app");
    expect(ipCandidates.some((url) => url.includes("127.0.0.1"))).toBe(true);

    const singleHostCandidates = getMergedFaviconCandidates("http://intranet");
    expect(singleHostCandidates.some((url) => url.includes("intranet"))).toBe(
      true,
    );
  });

  test("favicon tint colors are deterministic and include default fallback", async () => {
    const { getFaviconTintColors } =
      await import("@/app/dashboard/helpers/favicons");

    const a = getFaviconTintColors("https://example.com/a");
    const b = getFaviconTintColors("https://example.com/a");
    const c = getFaviconTintColors("https://other.example/a");
    const d = getFaviconTintColors(undefined, " ");

    expect(a).toEqual(b);
    expect(a.foreground).toMatch(/^hsl\(/);
    expect(a.background).toMatch(/\/ 0\.35\)$/);
    expect(c.foreground).not.toBe(a.foreground);
    expect(d.foreground).toMatch(/^hsl\(/);
  });
});
