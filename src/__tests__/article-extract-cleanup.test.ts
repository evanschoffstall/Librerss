import { getHostname, POST } from "@/app/api/articles/extract/route";
import {
  clearArticleExtractCacheForTests,
  fetchHtml,
  fetchHtmlWithFingerprint,
  parseAndValidateArticleUrl
} from "@/lib/extract";
import {
  buildMetadataImageFallbackHtml,
  cleanExtractedArticleHtml,
  hasReadableArticleBody,
  isLikelyNavFooterBoilerplate,
  normalizeArticleHtmlSpacing,
  preCleanHtmlForExtraction,
  sanitizeExtractedContent,
  stripCommentEngagementBoilerplate,
  toParagraphHtml,
} from "@/lib/sanitize";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockReq = () =>
  new NextRequest("http://localhost/api/articles/extract", {
    method: "POST",
    body: JSON.stringify({ url: "https://example.com/article" }),
    headers: { "content-type": "application/json" },
  });

const FIXTURE_DIR = join(
  process.cwd(),
  "src/__tests__/templates/expect-pipeline",
);

const SPECIAL_CASE_BRAND = String.fromCharCode(
  68,
  97,
  105,
  108,
  121,
  32,
  75,
  111,
  115,
);

function readExtractionFixture(articleName: string): string {
  return readFileSync(join(FIXTURE_DIR, `${articleName}.html`), "utf8");
}

function extractCanonicalUrlFromHtml(
  html: string,
  fixtureName: string,
): string {
  const canonicalMatch = html.match(
    /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
  );
  if (canonicalMatch?.[1]) return canonicalMatch[1];

  const ogUrlMatch = html.match(
    /<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i,
  );
  if (ogUrlMatch?.[1]) return ogUrlMatch[1];

  return `https://example.invalid/${fixtureName}`;
}

const SPECIAL_CASE_STORY_URL =
  "https://www.dailykos.com/stories/2026/2/25/2370437/example-story";
const SPECIAL_CASE_HOSTNAME = getHostname(SPECIAL_CASE_STORY_URL);

beforeEach(() => {
  mock.restore();
  clearArticleExtractCacheForTests();
});

afterEach(() => {
  mock.restore();
  clearArticleExtractCacheForTests();
});

describe("article extract cleanup", () => {
  test("preserves article body when mixed content is below nav/footer detection threshold", () => {
    const input = `
      <p>Real article paragraph one.</p>
      <p>Real article paragraph two.</p>
      <p>${SPECIAL_CASE_BRAND}</p>
      <ul>
        <li><a href="https://publisher.example/">Front Page</a></li>
        <li><a href="https://comics.publisher.example/">Comics</a></li>
        <li><a href="https://publisher.example/subscribe">Subscribe</a></li>
      </ul>
      <p>About</p>
      <ul>
        <li><a href="https://publisher.example/privacy">Privacy</a></li>
        <li><a href="https://publisher.example/masthead">Masthead</a></li>
      </ul>
    `;

    const cleaned = cleanExtractedArticleHtml(input, SPECIAL_CASE_STORY_URL);

    // Generic pipeline keeps mixed content when nav/footer threshold is not reached.
    expect(cleaned).toContain("Real article paragraph one");
    expect(cleaned).toContain("Real article paragraph two");
  });

  test("drops footer-only special-case extraction output", () => {
    const footerOnly = `
      <p>${SPECIAL_CASE_BRAND}</p>
      <ul>
        <li><a href="https://publisher.example/">Front Page</a></li>
        <li><a href="https://comics.publisher.example/">Comics</a></li>
        <li><a href="https://feeds.publisher.example/">RSS</a></li>
        <li><a href="https://publisher.example/subscribe">Subscribe</a></li>
        <li><a href="https://publisher.example/terms">Terms</a></li>
        <li><a href="https://publisher.example/privacy">Privacy</a></li>
      </ul>
      <p>About</p>
      <ul>
        <li><a href="https://publisher.example/masthead">Masthead</a></li>
      </ul>
    `;

    const cleaned = cleanExtractedArticleHtml(
      footerOnly,
      SPECIAL_CASE_STORY_URL,
    );

    expect(cleaned).toBe("");
  });

  test("does not drop content that lacks sufficient nav/footer signals", () => {
    const input = `
      <p>About</p>
      <ul>
        <li><a href="https://example.com/privacy">Privacy</a></li>
      </ul>
      <p>Normal content</p>
    `;

    const cleaned = cleanExtractedArticleHtml(
      input,
      "https://example.com/article",
    );

    expect(cleaned).toContain("Normal content");
    expect(cleaned).toContain("<p>About</p>");
  });

  describe("preCleanHtmlForExtraction", () => {
    test("removes <script> and <style> blocks", () => {
      const html =
        "<p>article</p><script>alert(1)</script><style>.x{}</style><p>more</p>";
      const result = preCleanHtmlForExtraction(html);
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("<style>");
      expect(result).toContain("article");
      expect(result).toContain("more");
    });

    test("removes <footer> element so extractor does not pick up site chrome", () => {
      const html =
        "<p>Article body.</p>" +
        "<footer><nav><ul><li><a href='/home'>Home</a></li>" +
        "<li><a href='/privacy'>Privacy</a></li>" +
        "<li><a href='/terms'>Terms</a></li></ul></nav>" +
        "<p>© 2025 Publisher Inc.</p></footer>";
      const result = preCleanHtmlForExtraction(html);
      expect(result).toContain("Article body.");
      expect(result).not.toContain("Privacy");
      expect(result).not.toContain("© 2025");
    });

    test("removes <header> element so extractor does not pick up site navigation", () => {
      const html =
        "<header><nav><a href='/'>Home</a><a href='/about'>About</a></nav>" +
        "<div class='site-masthead'>Publisher Name</div></header>" +
        "<p>Article paragraph one.</p><p>Article paragraph two.</p>";
      const result = preCleanHtmlForExtraction(html);
      expect(result).toContain("Article paragraph one.");
      expect(result).not.toContain("site-masthead");
      expect(result).not.toContain("Publisher Name");
    });

    test("removes both <header> and <footer> when both present", () => {
      const html =
        "<header><a href='/'>Home</a></header>" +
        "<p>Real content here.</p>" +
        "<footer><p>Copyright notice</p></footer>";
      const result = preCleanHtmlForExtraction(html);
      expect(result).toContain("Real content here.");
      expect(result).not.toContain("Copyright notice");
      expect(result).not.toContain("<header");
      expect(result).not.toContain("<footer");
    });

    test("handles HTML without header or footer unchanged in structure", () => {
      const html = "<div><p>Just an article.</p></div>";
      const result = preCleanHtmlForExtraction(html);
      expect(result).toContain("Just an article.");
    });

    test("removes comment widget containers by id", () => {
      const html =
        "<p>Article text.</p>" +
        '<div id="viafoura-comments"><p>Leave a comment</p></div>';
      const result = preCleanHtmlForExtraction(html);
      expect(result).toContain("Article text.");
      expect(result).not.toContain("Leave a comment");
    });

    test("preserves content-rich noscript article fallback blocks", () => {
      const html =
        "<div>shell</div>" +
        "<noscript>" +
        "<div class='story__text'>" +
        "<p>Survey Says is a weekly series on political trends and culture.</p>" +
        "<p>President Donald Trump\u2019s second term has fulfilled many of the darkest fears people had about his first, with sweeping executive actions and escalating federal overreach.</p>" +
        "<p>These are the abuses of a would-be dictator who learned from his first occupation of the White House and now goes bigger and faster.</p>" +
        "</div>" +
        "</noscript>" +
        "<noscript><a href='/privacy'>Privacy</a></noscript>";

      const result = preCleanHtmlForExtraction(html);

      expect(result).toContain("President Donald Trump");
      expect(result).toContain("would-be dictator");
      expect(result).not.toContain("/privacy");
    });
  });

  test("toParagraphHtml creates paragraph blocks from plain text", () => {
    const html = toParagraphHtml("One\nline\n\nTwo");
    expect(html).toContain("<p>One<br />line</p>");
    expect(html).toContain("<p>Two</p>");
  });

  test("sanitizeExtractedContent returns empty for blank content", () => {
    expect(sanitizeExtractedContent("   ")).toBe("");
  });

  test("sanitizeExtractedContent wraps plain text and keeps safe markup", () => {
    const cleaned = sanitizeExtractedContent("Headline\n\nSecond paragraph");
    expect(cleaned).toContain("<p>");
    expect(cleaned).toContain("Headline");
    expect(cleaned).toContain("Second paragraph");
  });

  test("sanitizeExtractedContent sanitizes existing html input", () => {
    const cleaned = sanitizeExtractedContent(
      "<p>Safe</p><script>alert(1)</script>",
    );
    expect(cleaned).toContain("Safe");
    expect(cleaned).not.toContain("<script>");
  });

  test("sanitizeExtractedContent preserves figures and promotes lazy image sources", () => {
    const cleaned = sanitizeExtractedContent(
      '<figure><img data-src="/images/article.jpg" alt="Hero" width="800" height="600" /></figure>',
    );

    expect(cleaned).toContain("<img");
    expect(cleaned).toContain('src="/images/article.jpg"');
  });

  test("sanitizeExtractedContent keeps image content wrapped by section containers", () => {
    const cleaned = sanitizeExtractedContent(
      '<section><article><div><p><img src="https://example.com/hero.jpg" alt="Hero" width="800" height="600" /></p></div></article></section><p>Body text</p>',
    );

    expect(cleaned).toContain('<img src="https://example.com/hero.jpg"');
    expect(cleaned).toContain("Body text");
  });

  test("sanitizeExtractedContent recovers exactly one section-wrapped image when sanitizer drops wrappers", () => {
    const cleaned = sanitizeExtractedContent(
      '<section><article><p><img src="https://example.com/cover.jpg" alt="Cover" width="800" height="600" /></p></article></section><p>Story body.</p>',
    );

    const imgMatches = cleaned.match(/<img\b/gi) ?? [];
    expect(imgMatches).toHaveLength(1);
    expect(cleaned).toContain('src="https://example.com/cover.jpg"');
    expect(cleaned).toContain("Story body.");
  });

  test("sanitizeExtractedContent recovers multiple safe section-wrapped images when none survive sanitizer output", () => {
    const cleaned = sanitizeExtractedContent(
      '<section><article><p><img src="https://example.com/cover.jpg" alt="Cover" width="800" height="600" /></p><p><img src="https://example.com/cartoon.jpg" alt="Cartoon" width="800" height="600" /></p></article></section><p>Story body.</p>',
    );

    const imgMatches = cleaned.match(/<img\b/gi) ?? [];
    expect(imgMatches).toHaveLength(2);
    expect(cleaned).toContain('src="https://example.com/cover.jpg"');
    expect(cleaned).toContain('src="https://example.com/cartoon.jpg"');
    expect(cleaned).toContain("Story body.");
  });

  test("sanitizeExtractedContent does not duplicate image when one is already preserved", () => {
    const cleaned = sanitizeExtractedContent(
      '<p><img src="https://example.com/inline.jpg" alt="Inline" width="800" height="600" /></p><p>Body copy.</p>',
    );

    const imgMatches = cleaned.match(/<img\b/gi) ?? [];
    expect(imgMatches).toHaveLength(1);
    expect(cleaned).toContain('src="https://example.com/inline.jpg"');
    expect(cleaned).toContain("Body copy.");
  });

  test("sanitizeExtractedContent removes direct tiny placeholder images below minimum size", () => {
    const cleaned = sanitizeExtractedContent(
      '<img src="https://static.example.com/grey-placeholder.png" width="150" height="84" alt="placeholder" /><p>Article body.</p>',
    );

    expect(cleaned).not.toContain("grey-placeholder.png");
    expect(cleaned).toContain("Article body.");
  });

  test("sanitizeExtractedContent filters recovered tiny images below minimum size", () => {
    const cleaned = sanitizeExtractedContent(
      '<section><article><p><img src="https://example.com/tiny.jpg" width="24" height="24" alt="Tiny" /></p></article></section><p>Body text remains.</p>',
    );

    expect(cleaned).not.toContain("tiny.jpg");
    expect(cleaned).toContain("Body text remains.");
  });

  test("stripCommentEngagementBoilerplate removes login and commenting prompt paragraphs", () => {
    const input =
      '<img src="https://cdn.mos.cms.futurecdn.net/wWN99SCnGejGkViA9SXtm6.png" alt="hero" />' +
      "<p>You must confirm your public display name before commenting</p>" +
      "<p>Please logout and then login again, you will then be prompted to enter your display name.</p>" +
      "<p>Real article body paragraph.</p>";

    const cleaned = stripCommentEngagementBoilerplate(input);

    expect(cleaned).toContain("futurecdn.net/wWN99SCnGejGkViA9SXtm6.png");
    expect(cleaned).toContain("Real article body paragraph.");
    expect(cleaned.toLowerCase()).not.toContain("display name");
    expect(cleaned.toLowerCase()).not.toContain("please logout");
  });

  test("cleanExtractedArticleHtml removes leaked comment-gate paragraphs for non-special domains", () => {
    const input =
      "<p>Lead paragraph.</p>" +
      "<p>You must confirm your public display name before commenting</p>" +
      "<p>Please logout and then login again, you will then be prompted to enter your display name.</p>" +
      "<p>Second paragraph.</p>";

    const cleaned = cleanExtractedArticleHtml(
      input,
      "https://www.livescience.com/archaeology/neanderthal-human-interbreeding",
    );

    expect(cleaned).toContain("Lead paragraph.");
    expect(cleaned).toContain("Second paragraph.");
    expect(cleaned.toLowerCase()).not.toContain("public display name");
    expect(cleaned.toLowerCase()).not.toContain("please logout");
  });

  test("sanitizeExtractedContent removes known placeholder image URLs without dimensions", () => {
    const cleaned = sanitizeExtractedContent(
      '<section><article><p><img src="https://static.files.bbci.co.uk/core/grey-placeholder.png" alt="Placeholder" /></p></article></section><p>Body text remains.</p>',
    );

    expect(cleaned).not.toContain("grey-placeholder.png");
    expect(cleaned).toContain("Body text remains.");
  });

  test("buildMetadataImageFallbackHtml uses og:image and og:description", () => {
    const fallback = buildMetadataImageFallbackHtml(`
      <html>
        <head>
          <meta property="og:image" content="https://cdn.example.com/cartoon.jpg" />
          <meta property="og:description" content="A cartoon by Tim Campbell." />
        </head>
      </html>
    `);

    expect(fallback).toContain(
      '<img src="https://cdn.example.com/cartoon.jpg"',
    );
    expect(fallback).toContain("A cartoon by Tim Campbell.");
  });

  test("buildMetadataImageFallbackHtml returns empty when image metadata is missing or unsafe", () => {
    const noImage = buildMetadataImageFallbackHtml(`
      <html><head><meta property="og:description" content="No image" /></head></html>
    `);

    const unsafeImage = buildMetadataImageFallbackHtml(`
      <html>
        <head>
          <meta property="og:image" content="javascript:alert(1)" />
          <meta property="og:description" content="Unsafe" />
        </head>
      </html>
    `);

    expect(noImage).toBe("");
    expect(unsafeImage).toBe("");
  });

  test("normalizeArticleHtmlSpacing removes empty paragraphs and inter-tag blank lines", () => {
    const cleaned = normalizeArticleHtmlSpacing(
      "<p></p>\n\n<p>One</p>\n\n<p>Two</p>",
    );

    expect(cleaned).toBe("<p>One</p>\n<p>Two</p>");
  });

  test("getHostname normalizes valid hostnames and handles invalid urls", () => {
    expect(
      getHostname(
        SPECIAL_CASE_STORY_URL.replace("https://www.", "https://WWW."),
      ),
    ).toBe(SPECIAL_CASE_HOSTNAME);
    expect(getHostname("not a url")).toBe("");
  });

  test("isLikelyNavFooterBoilerplate detects dense nav/footer marker content", () => {
    const footer = `
      <p>Front Page Comics Subscribe Gift subscriptions Privacy Masthead Rules of the Road</p>
      <ul>
        <li><a href="#">a</a></li><li><a href="#">b</a></li><li><a href="#">c</a></li>
        <li><a href="#">d</a></li><li><a href="#">e</a></li><li><a href="#">f</a></li>
      </ul>
    `;

    expect(isLikelyNavFooterBoilerplate(footer)).toBe(true);
    expect(isLikelyNavFooterBoilerplate("<p>Normal story body</p>")).toBe(
      false,
    );
  });

  test("hasReadableArticleBody distinguishes image-only from real article body", () => {
    const imageOnly =
      '<img src="https://cdn.prod.dailykos.com/images/example/story.jpg" /><p>Short caption.</p>';
    const fullArticle =
      "<p>Paragraph one with enough narrative substance to represent article content.</p>" +
      "<p>Paragraph two adds more context and meaningful details for readers.</p>";

    expect(hasReadableArticleBody(imageOnly)).toBe(false);
    expect(hasReadableArticleBody(fullArticle)).toBe(true);
  });

  test("parseAndValidateArticleUrl handles parser response, missing URL, blocked URL, and valid URL", async () => {
    const parserResponse = new Response("bad request", { status: 400 });
    const fromParser = await parseAndValidateArticleUrl({} as any, {
      parseJsonBodyOrResponseFn: async () => parserResponse,
    });
    expect(fromParser).toBe(parserResponse);

    const missingUrl = await parseAndValidateArticleUrl({} as any, {
      parseJsonBodyOrResponseFn: (async () => ({ url: "  " })) as any,
    });
    expect(missingUrl).toBeInstanceOf(Response);
    expect((missingUrl as Response).status).toBe(400);

    const blocked = await parseAndValidateArticleUrl({} as any, {
      parseJsonBodyOrResponseFn: (async () => ({
        url: "https://blocked.example",
      })) as any,
      isAllowedFeedUrlFn: async () => false,
    });
    expect(blocked).toBeInstanceOf(Response);
    expect((blocked as Response).status).toBe(400);

    const allowed = await parseAndValidateArticleUrl({} as any, {
      parseJsonBodyOrResponseFn: (async () => ({
        url: "  https://example.com/article  ",
      })) as any,
      isAllowedFeedUrlFn: async () => true,
    });
    expect(allowed).toBe("https://example.com/article");

    // Fragment must be stripped: HTTP requests must not carry URL fragments
    // (RFC 3986 §3.5). CDNs can return 403/400 for requests with raw fragments.
    const withFragment = await parseAndValidateArticleUrl({} as any, {
      parseJsonBodyOrResponseFn: (async () => ({
        url: "https://example.com/article#comments",
      })) as any,
      isAllowedFeedUrlFn: async () => true,
    });
    expect(withFragment).toBe("https://example.com/article");

    const withQueryAndFragment = await parseAndValidateArticleUrl({} as any, {
      parseJsonBodyOrResponseFn: (async () => ({
        url: "https://example.com/article?ref=rss#section-2",
      })) as any,
      isAllowedFeedUrlFn: async () => true,
    });
    expect(withQueryAndFragment).toBe("https://example.com/article?ref=rss");
  });

  test("fetchHtml blocks disallowed URLs and supports redirects", async () => {
    await expect(
      fetchHtml("https://example.com/a", {
        isAllowedFeedUrlFn: async () => false,
      }),
    ).rejects.toThrow("Blocked URL");

    const axiosGetFn = mock(async (url: string) => {
      if (url === "https://example.com/a") {
        return { status: 302, headers: { location: "/b" }, data: "" } as any;
      }
      return { status: 200, headers: {}, data: 1234 } as any;
    });

    const html = await fetchHtml("https://example.com/a", {
      isAllowedFeedUrlFn: async () => true,
      axiosGetFn: axiosGetFn as any,
    });
    expect(html).toBe("1234");
    expect(axiosGetFn).toHaveBeenCalledTimes(2);
  });

  test("fetchHtml rejects redirects without location and redirect loops", async () => {
    const noLocation = mock(async () => ({
      status: 302,
      headers: {},
      data: "",
    }));
    await expect(
      fetchHtml("https://example.com/a", {
        isAllowedFeedUrlFn: async () => true,
        axiosGetFn: noLocation as any,
      }),
    ).rejects.toThrow("Redirect without Location header");

    const loop = mock(async () => ({
      status: 302,
      headers: { location: "/loop" },
      data: "",
    }));
    await expect(
      fetchHtml("https://example.com/loop", {
        isAllowedFeedUrlFn: async () => true,
        axiosGetFn: loop as any,
      }),
    ).rejects.toThrow("Too many redirects");
  });

  test("fetchHtml supports array-valued redirect location header", async () => {
    const axiosGetFn = mock(async (url: string) => {
      if (url === "https://example.com/a") {
        return {
          status: 302,
          headers: { location: ["/b", "/ignored"] },
          data: "",
        } as any;
      }

      return { status: 200, headers: {}, data: "<html />" } as any;
    });

    const html = await fetchHtml("https://example.com/a", {
      isAllowedFeedUrlFn: async () => true,
      axiosGetFn: axiosGetFn as any,
    });

    expect(html).toBe("<html />");
    expect(axiosGetFn).toHaveBeenCalledTimes(2);
  });

  test("POST returns early auth/parse responses", async () => {
    const authResponse = new Response("unauthorized", { status: 401 });
    const fromAuth = await POST(mockReq(), {
      requireMutableAuthenticatedUserFn: async () => authResponse,
    });
    expect(fromAuth).toBe(authResponse);

    const parseResponse = new Response("bad payload", { status: 400 });
    const fromParse = await POST(mockReq(), {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => parseResponse,
    });
    expect(fromParse).toBe(parseResponse);
  });

  test("POST maps axios and generic failures to expected error handlers", async () => {
    const previousLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "verbose";

    const errorFn = mock(() => {});

    // Upstream 4xx (including 403, 429) must NOT be mirrored back to the
    // client — they are gateway failures, not client errors. Only upstream 404
    // is special-cased to 422 Unprocessable Content.
    const axiosError = { response: { status: 429 } };
    try {
      const axiosResult = await POST(mockReq(), {
        requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
        parseAndValidateArticleUrlFn: async () => "https://example.com/article",
        fetchHtmlFn: async () => {
          throw axiosError;
        },
        isAxiosErrorFn: (() => true) as any,
        toErrorMessageFn: () => "upstream-throttled",
        errorFn: errorFn as any,
      });

      expect(axiosResult.status).toBe(502);
      const axiosBody = await axiosResult.json();
      expect(axiosBody.error).toBe(
        "Failed to fetch article content from upstream",
      );
      expect(axiosBody.reason).toBe("upstream-throttled");
      expect(errorFn).toHaveBeenCalledWith(
        expect.stringContaining("upstream request failed"),
        expect.objectContaining({
          extractAttemptId: expect.any(String),
        }),
      );

      errorFn.mockClear();

      const genericResult = await POST(mockReq(), {
        requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
        parseAndValidateArticleUrlFn: async () => "https://example.com/article",
        fetchHtmlFn: async () => {
          throw new Error("boom");
        },
        isAxiosErrorFn: (() => false) as any,
        toErrorMessageFn: () => "normalized-boom",
        errorFn: errorFn as any,
      });

      expect(genericResult.status).toBe(502);
      const genericBody = await genericResult.json();
      expect(genericBody.error).toBe(
        "Failed to extract article content",
      );
      expect(genericBody.reason).toBe("normalized-boom");
      expect(errorFn).toHaveBeenCalledTimes(1);
    } finally {
      if (previousLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previousLogLevel;
      }
    }
  });

  // ─── Fragment stripping in upstream request layer ─────────────────────────

  test("fetchHtml strips fragment from initial URL before sending to upstream", async () => {
    const requestedUrls: string[] = [];
    const axiosGetFn = mock(async (url: string) => {
      requestedUrls.push(url);
      return { status: 200, headers: {}, data: "<html />" } as any;
    });

    await fetchHtml("https://example.com/article#comments", {
      isAllowedFeedUrlFn: async () => true,
      axiosGetFn: axiosGetFn as any,
    });

    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toBe("https://example.com/article");
    expect(requestedUrls[0]).not.toContain("#");
  });

  test("fetchHtml strips fragment from redirect Location targets before next hop", async () => {
    const requestedUrls: string[] = [];
    const axiosGetFn = mock(async (url: string) => {
      requestedUrls.push(url);
      if (url === "https://example.com/a") {
        // Redirect target contains a fragment — common in tracking redirectors
        return {
          status: 302,
          headers: { location: "https://example.com/article#section-2" },
          data: "",
        } as any;
      }
      return { status: 200, headers: {}, data: "<html />" } as any;
    });

    await fetchHtml("https://example.com/a", {
      isAllowedFeedUrlFn: async () => true,
      axiosGetFn: axiosGetFn as any,
    });

    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[1]).toBe("https://example.com/article");
    expect(requestedUrls[1]).not.toContain("#");
  });

  test("fetchHtml allows up to 5 redirect hops (not 3)", async () => {
    // Build a chain: /a → /b → /c → /d → /e → /final (5 redirects then 200)
    const axiosGetFn = mock(async (url: string) => {
      const chain: Record<string, string> = {
        "https://example.com/a": "/b",
        "https://example.com/b": "/c",
        "https://example.com/c": "/d",
        "https://example.com/d": "/e",
        "https://example.com/e": "/final",
      };
      if (chain[url]) {
        return {
          status: 302,
          headers: { location: chain[url] },
          data: "",
        } as any;
      }
      return { status: 200, headers: {}, data: "<html>final</html>" } as any;
    });

    const html = await fetchHtml("https://example.com/a", {
      isAllowedFeedUrlFn: async () => true,
      axiosGetFn: axiosGetFn as any,
    });

    expect(html).toBe("<html>final</html>");
    // 5 redirects + 1 final = 6 calls
    expect(axiosGetFn).toHaveBeenCalledTimes(6);
  });

  test("fetchHtml raises DataDome-specific error on 403 with x-datadome: protected", async () => {
    const axiosGetFn = mock(async () => {
      const err: any = new Error("Request failed with status code 403");
      err.isAxiosError = true;
      err.response = { status: 403, headers: { "x-datadome": "protected" } };
      throw err;
    });

    await expect(
      fetchHtml("https://example.com/article", {
        isAllowedFeedUrlFn: async () => true,
        axiosGetFn: axiosGetFn as any,
        isAxiosErrorFn: ((e: any) => e?.isAxiosError === true) as any,
      }),
    ).rejects.toThrow("DataDome");
  });

  test("fetchHtml raises PerimeterX-specific error on 403 with px-captcha in body", async () => {
    const pxBody =
      '<!DOCTYPE html><html><head><meta name="description" content="px-captcha" /><title>Access to this page has been denied</title></head></html>';
    const axiosGetFn = mock(async () => {
      const err: any = new Error("Request failed with status code 403");
      err.isAxiosError = true;
      err.response = { status: 403, headers: {}, data: pxBody };
      throw err;
    });

    await expect(
      fetchHtml("https://example.com/article", {
        isAllowedFeedUrlFn: async () => true,
        axiosGetFn: axiosGetFn as any,
        isAxiosErrorFn: ((e: any) => e?.isAxiosError === true) as any,
      }),
    ).rejects.toThrow("PerimeterX");
  });

  test("fetchHtml raises PerimeterX-specific error on 403 with x-px-* response header", async () => {
    const axiosGetFn = mock(async () => {
      const err: any = new Error("Request failed with status code 403");
      err.isAxiosError = true;
      err.response = {
        status: 403,
        headers: { "x-px-vid": "some-vid" },
        data: "",
      };
      throw err;
    });

    await expect(
      fetchHtml("https://example.com/article", {
        isAllowedFeedUrlFn: async () => true,
        axiosGetFn: axiosGetFn as any,
        isAxiosErrorFn: ((e: any) => e?.isAxiosError === true) as any,
      }),
    ).rejects.toThrow("PerimeterX");
  });

  test("fetchHtmlWithFingerprint validates redirects against SSRF policy", async () => {
    const gotGet = mock(async (inputUrl: string) => {
      if (inputUrl === "https://example.com/article") {
        return {
          statusCode: 302,
          headers: { location: "http://127.0.0.1/private" },
          body: "",
        };
      }

      return { statusCode: 200, headers: {}, body: "ok" };
    });

    mock.module("got-scraping", () => ({
      gotScraping: { get: gotGet },
    }));

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/article",
        async (candidateUrl) => !candidateUrl.includes("127.0.0.1"),
      ),
    ).rejects.toThrow("Blocked redirect target");

    expect(gotGet).toHaveBeenCalledTimes(1);
  });

  // ─── POST logging ─────────────────────────────────────────────────────────

  test("POST fires info logs at start, after fetch, and on success", async () => {
    const infoFn = mock(() => {});

    await POST(mockReq(), {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      fetchHtmlFn: async () => "<html />",
      extractFromHtmlFn: async () => ({
        title: "Title",
        content: "<p>Real article content here that is long enough.</p>",
      }),
      sanitizeExtractedContentFn: (c) => c,
      cleanExtractedArticleHtmlFn: (c) => c,
      infoFn: infoFn as any,
      warnFn: mock(() => {}),
    });

    const messages: string[] = infoFn.mock.calls.map(
      (c: any[]) => c[0] as string,
    );
    expect(messages.some((m) => m.includes("started"))).toBe(true);
    expect(messages.some((m) => m.includes("fetched"))).toBe(true);
    expect(messages.some((m) => m.includes("completed"))).toBe(true);
  });

  test("POST fires warn log when extractor returns no content", async () => {
    const warnFn = mock(() => {});

    await POST(mockReq(), {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      fetchHtmlFn: async () => "<html />",
      extractFromHtmlFn: async () => null,
      sanitizeExtractedContentFn: (c) => c,
      cleanExtractedArticleHtmlFn: (c) => c,
      infoFn: mock(() => {}),
      warnFn: warnFn as any,
    });

    const warnMessages: string[] = warnFn.mock.calls.map(
      (c: any[]) => c[0] as string,
    );
    expect(warnMessages.some((m) => m.includes("no content"))).toBe(true);
  });

  test("POST fires warn log when content is empty after full pipeline", async () => {
    const warnFn = mock(() => {});

    await POST(mockReq(), {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      fetchHtmlFn: async () => "<html />",
      extractFromHtmlFn: async () => ({ title: "T", content: "<p>stuff</p>" }),
      sanitizeExtractedContentFn: () => "",
      cleanExtractedArticleHtmlFn: () => "",
      infoFn: mock(() => {}),
      warnFn: warnFn as any,
    });

    const warnMessages: string[] = warnFn.mock.calls.map(
      (c: any[]) => c[0] as string,
    );
    expect(
      warnMessages.some((m) =>
        m.includes("empty after full extraction pipeline"),
      ),
    ).toBe(true);
  });

  test("POST falls back to metadata image when extractor output is nav/footer boilerplate", async () => {
    const infoFn = mock(() => {});
    const warnFn = mock(() => {});

    const footerOnlyExtraction = `
      <p>Daily Kos</p>
      <ul>
        <li><a href="https://www.dailykos.com/">Front Page</a></li>
        <li><a href="https://comics.dailykos.com/">Comics</a></li>
        <li><a href="https://feeds.dailykos.com/">RSS</a></li>
        <li><a href="https://www.dailykos.com/subscribe">Subscribe</a></li>
        <li><a href="https://www.dailykos.com/terms">Terms</a></li>
        <li><a href="https://www.dailykos.com/privacy">Privacy</a></li>
      </ul>
      <p>About</p>
      <ul>
        <li><a href="https://www.dailykos.com/masthead">Masthead</a></li>
      </ul>
    `;

    const response = await POST(mockReq(), {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () =>
        "https://www.dailykos.com/stories/2026/2/27/2369312/-Cartoon-But-the-portions-are-huge",
      fetchHtmlFn: async () => `
        <html>
          <head>
            <meta property="og:image" content="https://cdn.prod.dailykos.com/images/1528229/story_image/20260218edshe-b.jpg?1771436292" />
            <meta property="og:description" content="A cartoon by Drew Sheneman." />
          </head>
        </html>
      `,
      extractFromHtmlFn: async () => ({
        title: "Cartoon: But the portions are huge!",
        content: footerOnlyExtraction,
      }),
      infoFn: infoFn as any,
      warnFn: warnFn as any,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain(
      'src="https://cdn.prod.dailykos.com/images/1528229/story_image/20260218edshe-b.jpg?1771436292"',
    );
    expect(payload.content).toContain("A cartoon by Drew Sheneman.");
    expect(
      infoFn.mock.calls.some((call: any[]) =>
        String(call[0]).includes("metadata image fallback"),
      ),
    ).toBe(true);
    expect(
      warnFn.mock.calls.some((call: any[]) =>
        String(call[0]).includes("empty after full extraction pipeline"),
      ),
    ).toBe(false);
  });

  test("POST keeps empty content when metadata image fallback URL is unsafe", async () => {
    const warnFn = mock(() => {});

    const footerOnlyExtraction = `
      <p>Daily Kos</p>
      <ul>
        <li><a href="https://www.dailykos.com/">Front Page</a></li>
        <li><a href="https://comics.dailykos.com/">Comics</a></li>
        <li><a href="https://feeds.dailykos.com/">RSS</a></li>
        <li><a href="https://www.dailykos.com/subscribe">Subscribe</a></li>
        <li><a href="https://www.dailykos.com/terms">Terms</a></li>
        <li><a href="https://www.dailykos.com/privacy">Privacy</a></li>
      </ul>
      <p>About</p>
      <ul>
        <li><a href="https://www.dailykos.com/masthead">Masthead</a></li>
      </ul>
    `;

    const response = await POST(mockReq(), {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () =>
        "https://www.dailykos.com/stories/2026/2/27/2369312/-Cartoon-But-the-portions-are-huge",
      fetchHtmlFn: async () => `
        <html>
          <head>
            <meta property="og:image" content="javascript:alert(1)" />
            <meta property="og:description" content="Unsafe metadata image." />
          </head>
        </html>
      `,
      extractFromHtmlFn: async () => ({
        title: "Cartoon: But the portions are huge!",
        content: footerOnlyExtraction,
      }),
      warnFn: warnFn as any,
      infoFn: mock(() => {}) as any,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toBe("");
    expect(
      warnFn.mock.calls.some((call: any[]) =>
        String(call[0]).includes("empty after full extraction pipeline"),
      ),
    ).toBe(true);
  });

  test("POST uses extract cache when enabled", async () => {
    const fetchHtmlFn = mock(async () => "<html />");
    const extractFromHtmlFn = mock(async () => ({
      title: "Title",
      source: "Source",
      content: "cached-content",
    }));
    const infoFn = mock(() => {});
    const warnFn = mock(() => {});

    const deps = {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      fetchHtmlFn: fetchHtmlFn as any,
      extractFromHtmlFn: extractFromHtmlFn as any,
      sanitizeExtractedContentFn: (content: string) => content,
      cleanExtractedArticleHtmlFn: (content: string) => content,
      getHostnameFn: () => "example.com",
      infoFn: infoFn as any,
      warnFn: warnFn as any,
      shouldUseExtractCacheFn: () => true,
    };

    const firstResponse = await POST(mockReq(), deps);
    const secondResponse = await POST(mockReq(), deps);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(fetchHtmlFn).toHaveBeenCalledTimes(1);
    expect(extractFromHtmlFn).toHaveBeenCalledTimes(1);
    expect(await secondResponse.json()).toEqual({
      content: "cached-content",
      title: "Title",
      source: "Source",
    });
  });

  test("POST bypasses extract cache when disabled", async () => {
    const fetchHtmlFn = mock(async () => "<html />");
    const extractFromHtmlFn = mock(async () => ({
      title: "Title",
      source: "Source",
      content: "uncached-content",
    }));
    const infoFn = mock(() => {});
    const warnFn = mock(() => {});

    const deps = {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      fetchHtmlFn: fetchHtmlFn as any,
      extractFromHtmlFn: extractFromHtmlFn as any,
      sanitizeExtractedContentFn: (content: string) => content,
      cleanExtractedArticleHtmlFn: (content: string) => content,
      getHostnameFn: () => "example.com",
      infoFn: infoFn as any,
      warnFn: warnFn as any,
      shouldUseExtractCacheFn: () => false,
    };

    const firstResponse = await POST(mockReq(), deps);
    const secondResponse = await POST(mockReq(), deps);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(fetchHtmlFn).toHaveBeenCalledTimes(2);
    expect(extractFromHtmlFn).toHaveBeenCalledTimes(2);
  });
});
