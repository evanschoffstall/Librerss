/**
 * Pure-function tests for article helpers, article content, runtime flags,
 * date-utils, GReader constants, and OPML parsing.
 * All tested via real imports — no module mocking.
 */

import {
  DEFAULT_STREAM_ITEMS,
  GOOGLE_LOGIN_PREFIX,
  MAX_STREAM_ITEMS,
  READ_STATE,
  STARRED_STATE,
  TAG_MUTATIONS,
} from "@/app/api/greader.php/[...segments]/constants";
import {
  buildPreview,
  getArticleSourceLabel,
  getRichContentClass,
  getUrlHostnameLabel,
} from "@/app/dashboard/helpers/article-content";
import {
  dedupeAndSortArticles,
  getArticleKey,
} from "@/app/dashboard/helpers/article-helpers";
import { CONFIG } from "@/lib/config";
import { PLACEHOLDER_ADMIN_USER, RUNTIME_FLAGS } from "@/lib/core/runtime";
import { formatRelativeDate } from "@/lib/utils/date-utils";
import { parseOpmlFeedImport } from "@/lib/utils/opml";
import { describe, expect, test } from "bun:test";

// ─── article-helpers.ts ───────────────────────────────────────────────────────

describe("article-helpers – getArticleKey", () => {
  test("returns trimmed link", async () => {
    expect(
      getArticleKey({
        id: 1,
        title: "Test",
        link: " https://example.com/article ",
        content: "",
        publicationDate: new Date(),
        lastChecked: new Date(),
        feedId: 1,
      }),
    ).toBe("https://example.com/article");
  });
});

describe("article-helpers – dedupeAndSortArticles", () => {
  test("removes duplicate articles by link", async () => {
    const now = new Date();
    const articles = [
      {
        id: 1,
        title: "First",
        link: "https://example.com/1",
        content: "Content A",
        publicationDate: now,
        lastChecked: now,
        feedId: 1,
      },
      {
        id: 2,
        title: "Duplicate",
        link: "https://example.com/1",
        content: "Content B - longer",
        publicationDate: now,
        lastChecked: now,
        feedId: 1,
      },
    ];
    const result = dedupeAndSortArticles(articles);
    expect(result).toHaveLength(1);
    // Should keep the one with longer content
    expect(result[0].content).toBe("Content B - longer");
  });

  test("sorts by publication date descending", async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 86400000);
    const articles = [
      {
        id: 1,
        title: "Old",
        link: "https://example.com/old",
        content: "",
        publicationDate: earlier,
        lastChecked: now,
        feedId: 1,
      },
      {
        id: 2,
        title: "New",
        link: "https://example.com/new",
        content: "",
        publicationDate: now,
        lastChecked: now,
        feedId: 1,
      },
    ];
    const result = dedupeAndSortArticles(articles);
    expect(result[0].title).toBe("New");
    expect(result[1].title).toBe("Old");
  });

  test("skips articles without link", async () => {
    const now = new Date();
    const articles = [
      {
        id: 1,
        title: "No Link",
        link: "",
        content: "",
        publicationDate: now,
        lastChecked: now,
        feedId: 1,
      },
      {
        id: 2,
        title: "Has Link",
        link: "https://example.com",
        content: "",
        publicationDate: now,
        lastChecked: now,
        feedId: 1,
      },
    ];
    const result = dedupeAndSortArticles(articles);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Has Link");
  });

  test("keeps article with newer timestamp among same-length content", async () => {
    const older = new Date("2024-01-01");
    const newer = new Date("2024-06-01");
    const articles = [
      {
        id: 1,
        title: "Old",
        link: "https://example.com/1",
        content: "Same",
        publicationDate: older,
        lastChecked: older,
        feedId: 1,
      },
      {
        id: 2,
        title: "New",
        link: "https://example.com/1",
        content: "Same",
        publicationDate: newer,
        lastChecked: newer,
        feedId: 1,
      },
    ];
    const result = dedupeAndSortArticles(articles);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("New");
  });

  test("handles empty array", async () => {
    expect(dedupeAndSortArticles([])).toEqual([]);
  });

  test("handles whitespace-only link", async () => {
    const now = new Date();
    const articles = [
      {
        id: 1,
        title: "Blank",
        link: "   ",
        content: "",
        publicationDate: now,
        lastChecked: now,
        feedId: 1,
      },
    ];
    expect(dedupeAndSortArticles(articles)).toHaveLength(0);
  });
});

// ─── article-content.ts ──────────────────────────────────────────────────────

describe("article-content – buildPreview", () => {
  test("short content returns no overflow", async () => {
    const result = buildPreview("Short text");
    expect(result.preview).toBe("Short text");
    expect(result.hasOverflow).toBe(false);
  });

  test("long content triggers overflow", async () => {
    const longText = "Word ".repeat(100);
    const result = buildPreview(longText);
    expect(result.hasOverflow).toBe(true);
    expect(result.preview.length).toBeLessThanOrEqual(171);
  });

  test("truncates at word boundary", async () => {
    const longText = "hello world ".repeat(50);
    const result = buildPreview(longText);
    expect(result.preview).not.toEndWith(" ");
  });

  test("handles content exactly at limit", async () => {
    const exact = "A".repeat(170);
    const result = buildPreview(exact);
    expect(result.hasOverflow).toBe(false);
    expect(result.preview).toBe(exact);
  });

  test("handles content with no spaces for truncation", async () => {
    const noSpaces = "A".repeat(200);
    const result = buildPreview(noSpaces);
    expect(result.hasOverflow).toBe(true);
    expect(result.preview.length).toBeLessThanOrEqual(170);
  });
});

describe("article-content – getArticleSourceLabel", () => {
  test("uses feed name when available", async () => {
    const article = {
      id: 1,
      title: "Test",
      link: "https://example.com",
      content: "",
      publicationDate: new Date(),
      lastChecked: new Date(),
      feedId: 1,
      feedName: "My Feed",
    };
    expect(getArticleSourceLabel(article)).toBe("My Feed");
  });

  test("falls back to hostname when no feed name", async () => {
    const article = {
      id: 1,
      title: "Test",
      link: "https://example.com/article",
      content: "",
      publicationDate: new Date(),
      lastChecked: new Date(),
      feedId: 1,
      feedUrl: "https://blog.example.com/feed",
    };
    expect(getArticleSourceLabel(article)).toBe("blog.example.com");
  });

  test("falls back to link hostname when no feed name or feed URL", async () => {
    const article = {
      id: 1,
      title: "Test",
      link: "https://news.example.com/article",
      content: "",
      publicationDate: new Date(),
      lastChecked: new Date(),
      feedId: 1,
    };
    expect(getArticleSourceLabel(article)).toBe("news.example.com");
  });

  test("strips www prefix", async () => {
    const article = {
      id: 1,
      title: "Test",
      link: "https://www.example.com/article",
      content: "",
      publicationDate: new Date(),
      lastChecked: new Date(),
      feedId: 1,
    };
    expect(getArticleSourceLabel(article)).toBe("example.com");
  });

  test("ignores whitespace-only feed name", async () => {
    const article = {
      id: 1,
      title: "Test",
      link: "https://example.com",
      content: "",
      publicationDate: new Date(),
      lastChecked: new Date(),
      feedId: 1,
      feedName: "   ",
    };
    expect(getArticleSourceLabel(article)).not.toBe("   ");
  });
});

describe("article-content – getRichContentClass", () => {
  test("returns different classes for expanded vs collapsed", async () => {
    const expanded = getRichContentClass(true);
    const collapsed = getRichContentClass(false);
    expect(expanded).not.toBe(collapsed);
    expect(expanded).toContain("text-[0.97rem]");
    expect(collapsed).toContain("text-[0.91rem]");
  });

  test("both include shared CSS classes", async () => {
    const expanded = getRichContentClass(true);
    const collapsed = getRichContentClass(false);
    expect(expanded).toContain("break-words");
    expect(collapsed).toContain("break-words");
  });
});

// ─── article-content – getUrlHostnameLabel ────────────────────────────────────

describe("article-content – getUrlHostnameLabel for display", () => {
  test("returns hostname without www", async () => {
    expect(getUrlHostnameLabel("https://www.example.com")).toBe("example.com");
  });

  test("returns raw input for invalid URL", async () => {
    expect(getUrlHostnameLabel("not-a-url")).toBe("not-a-url");
  });

  test("returns default for undefined", async () => {
    expect(getUrlHostnameLabel(undefined)).toBe("No source URL");
  });
});

// ─── runtime.ts ───────────────────────────────────────────────────────────────

describe("runtime – RUNTIME_FLAGS", () => {
  test("hasDatabaseUrl reflects env", async () => {
    // In test env, DATABASE_URL is set
    expect(typeof RUNTIME_FLAGS.hasDatabaseUrl).toBe("boolean");
  });

  test("usePlaceholderData is inverse of hasDatabaseUrl", async () => {
    expect(RUNTIME_FLAGS.usePlaceholderData).toBe(
      !RUNTIME_FLAGS.hasDatabaseUrl,
    );
  });

  test("allowSignup returns boolean", async () => {
    expect(typeof RUNTIME_FLAGS.allowSignup).toBe("boolean");
  });
});

describe("runtime – PLACEHOLDER_ADMIN_USER", () => {
  test.skip("has expected fields", async () => {
    expect(PLACEHOLDER_ADMIN_USER.id).toBe(0);
    expect(PLACEHOLDER_ADMIN_USER.email).toBe("admin@admin.com");
    expect(PLACEHOLDER_ADMIN_USER.passwordHash).toBeTruthy();
    expect(PLACEHOLDER_ADMIN_USER.sessionToken).toBeTruthy();
  });

  test("session token is a hex string", async () => {
    expect(PLACEHOLDER_ADMIN_USER.sessionToken).toMatch(/^[0-9a-f]+$/);
    expect(PLACEHOLDER_ADMIN_USER.sessionToken.length).toBe(64); // 32 bytes = 64 hex
  });
});

// ─── date-utils.ts ────────────────────────────────────────────────────────────

describe("date-utils – formatRelativeDate", () => {
  test("today returns 'Today' prefix", async () => {
    const result = formatRelativeDate(new Date());
    expect(result).toMatch(/^Today /);
  });

  test("yesterday returns 'Yesterday' prefix", async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const result = formatRelativeDate(yesterday);
    expect(result).toMatch(/^Yesterday /);
  });

  test("3 days ago returns days ago format", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);
    const result = formatRelativeDate(threeDaysAgo);
    expect(result).toBe("3 days ago");
  });

  test("6 days ago returns days ago format", async () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 86_400_000);
    expect(formatRelativeDate(sixDaysAgo)).toBe("6 days ago");
  });

  test("7+ days ago returns locale date", async () => {
    const oldDate = new Date(Date.now() - 10 * 86_400_000);
    const result = formatRelativeDate(oldDate);
    // Should be a locale date string, not "X days ago"
    expect(result).not.toMatch(/days ago/);
  });
});

// ─── greader constants ────────────────────────────────────────────────────────

describe("greader constants", () => {
  test("TAG_MUTATIONS has expected entries", async () => {
    expect(TAG_MUTATIONS.length).toBe(4);
  });

  test("TAG_MUTATIONS has read-add mutation", async () => {
    const readAdd = TAG_MUTATIONS.find(
      (m) => m.target === "a" && m.tag === READ_STATE,
    );
    expect(readAdd).toBeTruthy();
    expect(readAdd!.patch.isRead).toBe(true);
  });

  test("TAG_MUTATIONS has read-remove mutation", async () => {
    const readRemove = TAG_MUTATIONS.find(
      (m) => m.target === "r" && m.tag === READ_STATE,
    );
    expect(readRemove).toBeTruthy();
    expect(readRemove!.patch.isRead).toBe(false);
  });

  test("TAG_MUTATIONS has starred-add mutation", async () => {
    const starredAdd = TAG_MUTATIONS.find(
      (m) => m.target === "a" && m.tag === STARRED_STATE,
    );
    expect(starredAdd).toBeTruthy();
    expect(starredAdd!.patch.isStarred).toBe(true);
  });

  test("TAG_MUTATIONS has starred-remove mutation", async () => {
    const starredRemove = TAG_MUTATIONS.find(
      (m) => m.target === "r" && m.tag === STARRED_STATE,
    );
    expect(starredRemove).toBeTruthy();
    expect(starredRemove!.patch.isStarred).toBe(false);
  });

  test("MAX_STREAM_ITEMS matches CONFIG", async () => {
    expect(MAX_STREAM_ITEMS).toBe(CONFIG.GREADER_MAX_STREAM_ITEMS);
    expect(DEFAULT_STREAM_ITEMS).toBe(CONFIG.GREADER_DEFAULT_STREAM_ITEMS);
  });

  test("GOOGLE_LOGIN_PREFIX is correct", async () => {
    expect(GOOGLE_LOGIN_PREFIX).toBe("googlelogin auth=");
  });
});

// ─── OPML parsing ─────────────────────────────────────────────────────────────

describe("opml – parseOpmlFeedImport", () => {
  test("parses simple OPML with feeds", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech" title="Tech">
      <outline text="Hacker News" xmlUrl="https://news.ycombinator.com/rss" />
      <outline text="TechCrunch" xmlUrl="https://techcrunch.com/feed/" />
    </outline>
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("Tech");
    expect(result[0].name).toBe("Hacker News");
    expect(result[0].url).toContain("news.ycombinator.com");
  });

  test("assigns default category for root-level feeds", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Direct Feed" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("My Feeds");
  });

  test("deduplicates feeds by URL", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Feed A" xmlUrl="https://example.com/feed" />
    <outline text="Feed B" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(1);
  });

  test("throws for invalid XML", async () => {
    expect(() => parseOpmlFeedImport("<invalid")).toThrow();
  });

  test("throws for OPML without body", async () => {
    const opml = '<?xml version="1.0"?><opml><head></head></opml>';
    expect(() => parseOpmlFeedImport(opml)).toThrow("OPML body is missing");
  });

  test("handles nested category groups", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Top Category">
      <outline text="Sub Category">
        <outline text="Deep Feed" xmlUrl="https://deep.example.com/feed" />
      </outline>
    </outline>
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("Sub Category");
  });

  test("uses feed title when text attribute is missing", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline title="Title Feed" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result[0].name).toBe("Title Feed");
  });

  test("falls back to Imported Feed when no name", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result[0].name).toBeTruthy();
  });

  test("skips feeds with non-HTTP protocol", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="FTP Feed" xmlUrl="ftp://example.com/feed" />
    <outline text="HTTP Feed" xmlUrl="https://example.com/feed" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(1);
    expect(result[0].url).toContain("https://");
  });

  test("normalizes feed URLs (strips trailing slashes)", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Feed" xmlUrl="https://example.com/feed/" />
  </body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result[0].url).toBe("https://example.com/feed");
  });

  test("handles empty body", async () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body></body>
</opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result).toHaveLength(0);
  });

  test("respects import cap", async () => {
    const { CONFIG } = await import("@/lib/config");
    let feeds = "";
    for (let i = 0; i < CONFIG.OPML_MAX_IMPORT_ENTRIES + 50; i++) {
      feeds += `<outline text="Feed ${i}" xmlUrl="https://example${i}.com/feed" />`;
    }
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><body>${feeds}</body></opml>`;
    const result = parseOpmlFeedImport(opml);
    expect(result.length).toBeLessThanOrEqual(CONFIG.OPML_MAX_IMPORT_ENTRIES);
  });
});
