/**
 * Covers the reading pipeline from captured article HTML through sanitize output.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { NextRequest } from "next/server";

import { getHostname, POST } from "@/app/api/articles/extract/route";
import {
  clearArticleExtractCacheForTests,
  fetchHtml,
  parseAndValidateArticleUrl,
} from "@/lib/extract";
import {
  decompressBody,
  fetchHtmlWithFingerprint,
  generateBrowserHeaders,
  GotScrapingError,
  parseSocksProxy,
} from "@/lib/fetch";
import {
  buildMetadataImageFallbackHtml,
  cleanSanitizedHtml,
  hasReadableArticleBody,
  isLikelyNavFooterBoilerplate,
  normalizeArticleHtmlSpacing,
  preCleanHtml,
  sanitizeRawContent,
  stripCommentEngagementBoilerplate,
  toParagraphHtml,
} from "@/lib/sanitize";

const mockReq = () =>
  new NextRequest("http://localhost/api/articles/extract", {
    body: JSON.stringify({ url: "https://example.com/article" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

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

    const cleaned = cleanSanitizedHtml(input, SPECIAL_CASE_STORY_URL);

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

    const cleaned = cleanSanitizedHtml(footerOnly, SPECIAL_CASE_STORY_URL);

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

    const cleaned = cleanSanitizedHtml(input, "https://example.com/article");

    expect(cleaned).toContain("Normal content");
    expect(cleaned).toContain("<p>About</p>");
  });

  test("removes lead figure headings and duplicate lead image", () => {
    const duplicatedLeadMedia =
      '<img src="https://example.com/lead.jpg" width="1200" height="800" />' +
      "<h2>PIA26706 Figure A</h2>" +
      "<h2>PIA26706 Animation</h2>" +
      "<h2>Description</h2>" +
      "<p>Body intro text.</p>" +
      '<a href="https://example.com/lead.jpg"><img src="https://example.com/lead.jpg" width="1200" height="800" /></a>' +
      "<p>Figure details.</p>";

    const cleaned = cleanSanitizedHtml(
      duplicatedLeadMedia,
      "https://example.com/article",
    );

    expect(cleaned).not.toContain("PIA26706 Figure A");
    expect(cleaned).not.toContain("PIA26706 Animation");
    expect(cleaned).not.toContain("<h2>Description</h2>");
    expect(
      cleaned.match(/<img\b[^>]*\bsrc="https:\/\/example\.com\/lead\.jpg"/g)
        ?.length,
    ).toBe(1);
    expect(cleaned).toContain("Body intro text.");
  });

  test("preserves non-boilerplate lead headings", () => {
    const meaningfulLeadHeading =
      '<img src="https://example.com/lead.jpg" width="1200" height="800" />' +
      "<h2>Mission Overview</h2>" +
      "<p>Body intro text.</p>";

    const cleaned = cleanSanitizedHtml(
      meaningfulLeadHeading,
      "https://example.com/article",
    );

    expect(cleaned).toContain("<h2>Mission Overview</h2>");
    expect(cleaned).toContain("Body intro text.");
  });

  describe("preCleanHtml", () => {
    test("removes <script> and <style> blocks", () => {
      const html =
        "<p>article</p><script>alert(1)</script><style>.x{}</style><p>more</p>";
      const result = preCleanHtml(html);
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
      const result = preCleanHtml(html);
      expect(result).toContain("Article body.");
      expect(result).not.toContain("Privacy");
      expect(result).not.toContain("© 2025");
    });

    test("removes <header> element so extractor does not pick up site navigation", () => {
      const html =
        "<header><nav><a href='/'>Home</a><a href='/about'>About</a></nav>" +
        "<div class='site-masthead'>Publisher Name</div></header>" +
        "<p>Article paragraph one.</p><p>Article paragraph two.</p>";
      const result = preCleanHtml(html);
      expect(result).toContain("Article paragraph one.");
      expect(result).not.toContain("site-masthead");
      expect(result).not.toContain("Publisher Name");
    });

    test("removes both <header> and <footer> when both present", () => {
      const html =
        "<header><a href='/'>Home</a></header>" +
        "<p>Real content here.</p>" +
        "<footer><p>Copyright notice</p></footer>";
      const result = preCleanHtml(html);
      expect(result).toContain("Real content here.");
      expect(result).not.toContain("Copyright notice");
      expect(result).not.toContain("<header");
      expect(result).not.toContain("<footer");
    });

    test("handles HTML without header or footer unchanged in structure", () => {
      const html = "<div><p>Just an article.</p></div>";
      const result = preCleanHtml(html);
      expect(result).toContain("Just an article.");
    });

    test("removes comment widget containers by id", () => {
      const html =
        "<p>Article text.</p>" +
        '<div id="viafoura-comments"><p>Leave a comment</p></div>';
      const result = preCleanHtml(html);
      expect(result).toContain("Article text.");
      expect(result).not.toContain("Leave a comment");
    });

    test("preserves content-rich noscript article fallback blocks", () => {
      const html =
        "<div>shell</div>" +
        "<noscript>" +
        "<div class='story__text'>" +
        "<p>Field Notes is a weekly series on design trends and everyday culture.</p>" +
        "<p>The museum's spring renovation has shown how small material choices can reshape a public space, from brighter galleries to quieter reading corners.</p>" +
        "<p>Visitors now move through the building more slowly, noticing details that once disappeared behind dark walls and crowded displays.</p>" +
        "</div>" +
        "</noscript>" +
        "<noscript><a href='/privacy'>Privacy</a></noscript>";

      const result = preCleanHtml(html);

      expect(result).toContain("spring renovation");
      expect(result).toContain("crowded displays");
      expect(result).not.toContain("/privacy");
    });
  });

  test("toParagraphHtml creates paragraph blocks from plain text", () => {
    const html = toParagraphHtml("One\nline\n\nTwo");
    expect(html).toContain("<p>One<br />line</p>");
    expect(html).toContain("<p>Two</p>");
  });

  test("sanitizeRawContent returns empty for blank content", () => {
    expect(sanitizeRawContent("   ")).toBe("");
  });

  test("sanitizeRawContent wraps plain text and keeps safe markup", () => {
    const cleaned = sanitizeRawContent("Headline\n\nSecond paragraph");
    expect(cleaned).toContain("<p>");
    expect(cleaned).toContain("Headline");
    expect(cleaned).toContain("Second paragraph");
  });

  test("sanitizeRawContent sanitizes existing html input", () => {
    const cleaned = sanitizeRawContent("<p>Safe</p><script>alert(1)</script>");
    expect(cleaned).toContain("Safe");
    expect(cleaned).not.toContain("<script>");
  });

  test("sanitizeRawContent preserves figures and promotes lazy image sources", () => {
    const cleaned = sanitizeRawContent(
      '<figure><img data-src="/images/article.jpg" alt="Hero" width="800" height="600" /></figure>',
    );

    expect(cleaned).toContain("<img");
    expect(cleaned).toContain('src="/images/article.jpg"');
  });

  test("sanitizeRawContent keeps image content wrapped by section containers", () => {
    const cleaned = sanitizeRawContent(
      '<section><article><div><p><img src="https://example.com/hero.jpg" alt="Hero" width="800" height="600" /></p></div></article></section><p>Body text</p>',
    );

    expect(cleaned).toContain('<img src="https://example.com/hero.jpg"');
    expect(cleaned).toContain("Body text");
  });

  test("sanitizeRawContent recovers exactly one section-wrapped image when sanitizer drops wrappers", () => {
    const cleaned = sanitizeRawContent(
      '<section><article><p><img src="https://example.com/cover.jpg" alt="Cover" width="800" height="600" /></p></article></section><p>Story body.</p>',
    );

    const imgMatches = cleaned.match(/<img\b/gi) ?? [];
    expect(imgMatches).toHaveLength(1);
    expect(cleaned).toContain('src="https://example.com/cover.jpg"');
    expect(cleaned).toContain("Story body.");
  });

  test("sanitizeRawContent recovers multiple safe section-wrapped images when none survive sanitizer output", () => {
    const cleaned = sanitizeRawContent(
      '<section><article><p><img src="https://example.com/cover.jpg" alt="Cover" width="800" height="600" /></p><p><img src="https://example.com/cartoon.jpg" alt="Cartoon" width="800" height="600" /></p></article></section><p>Story body.</p>',
    );

    const imgMatches = cleaned.match(/<img\b/gi) ?? [];
    expect(imgMatches).toHaveLength(2);
    expect(cleaned).toContain('src="https://example.com/cover.jpg"');
    expect(cleaned).toContain('src="https://example.com/cartoon.jpg"');
    expect(cleaned).toContain("Story body.");
  });

  test("sanitizeRawContent does not duplicate image when one is already preserved", () => {
    const cleaned = sanitizeRawContent(
      '<p><img src="https://example.com/inline.jpg" alt="Inline" width="800" height="600" /></p><p>Body copy.</p>',
    );

    const imgMatches = cleaned.match(/<img\b/gi) ?? [];
    expect(imgMatches).toHaveLength(1);
    expect(cleaned).toContain('src="https://example.com/inline.jpg"');
    expect(cleaned).toContain("Body copy.");
  });

  test("sanitizeRawContent removes direct tiny placeholder images below minimum size", () => {
    const cleaned = sanitizeRawContent(
      '<img src="https://static.example.com/grey-placeholder.png" width="150" height="84" alt="placeholder" /><p>Article body.</p>',
    );

    expect(cleaned).not.toContain("grey-placeholder.png");
    expect(cleaned).toContain("Article body.");
  });

  test("sanitizeRawContent filters recovered tiny images below minimum size", () => {
    const cleaned = sanitizeRawContent(
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

  test("cleanSanitizedHtml removes leaked comment-gate paragraphs for non-special domains", () => {
    const input =
      "<p>Lead paragraph.</p>" +
      "<p>You must confirm your public display name before commenting</p>" +
      "<p>Please logout and then login again, you will then be prompted to enter your display name.</p>" +
      "<p>Second paragraph.</p>";

    const cleaned = cleanSanitizedHtml(
      input,
      "https://www.livescience.com/archaeology/neanderthal-human-interbreeding",
    );

    expect(cleaned).toContain("Lead paragraph.");
    expect(cleaned).toContain("Second paragraph.");
    expect(cleaned.toLowerCase()).not.toContain("public display name");
    expect(cleaned.toLowerCase()).not.toContain("please logout");
  });

  test("sanitizeRawContent removes known placeholder image URLs without dimensions", () => {
    const cleaned = sanitizeRawContent(
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

  test("parseAndValidateArticleUrl handles missing URL, blocked URL, and valid URL", async () => {
    const missingUrl = await parseAndValidateArticleUrl("  ");
    expect(missingUrl).toBeInstanceOf(Response);
    expect((missingUrl as Response).status).toBe(400);

    const blocked = await parseAndValidateArticleUrl(
      "https://blocked.example",
      {
        isAllowedFeedUrlFn: async () => false,
      },
    );
    expect(blocked).toBeInstanceOf(Response);
    expect((blocked as Response).status).toBe(400);

    const allowed = await parseAndValidateArticleUrl(
      "  https://example.com/article  ",
      {
        isAllowedFeedUrlFn: async () => true,
      },
    );
    expect(allowed).toBe("https://example.com/article");

    // Fragment must be stripped: HTTP requests must not carry URL fragments
    // (RFC 3986 §3.5). CDNs can return 403/400 for requests with raw fragments.
    const withFragment = await parseAndValidateArticleUrl(
      "https://example.com/article#comments",
      {
        isAllowedFeedUrlFn: async () => true,
      },
    );
    expect(withFragment).toBe("https://example.com/article");

    const withQueryAndFragment = await parseAndValidateArticleUrl(
      "https://example.com/article?ref=rss#section-2",
      {
        isAllowedFeedUrlFn: async () => true,
      },
    );
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
        return { data: "", headers: { location: "/b" }, status: 302 } as any;
      }
      return { data: 1234, headers: {}, status: 200 } as any;
    });

    const html = await fetchHtml("https://example.com/a", {
      axiosGetFn: axiosGetFn as any,
      isAllowedFeedUrlFn: async () => true,
    });
    expect(html).toBe("1234");
    expect(axiosGetFn).toHaveBeenCalledTimes(2);
  });

  test("fetchHtml rejects redirects without location and redirect loops", async () => {
    const noLocation = mock(async () => ({
      data: "",
      headers: {},
      status: 302,
    }));
    await expect(
      fetchHtml("https://example.com/a", {
        axiosGetFn: noLocation as any,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("Redirect without Location header");

    const loop = mock(async () => ({
      data: "",
      headers: { location: "/loop" },
      status: 302,
    }));
    await expect(
      fetchHtml("https://example.com/loop", {
        axiosGetFn: loop as any,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("Too many redirects");
  });

  test("fetchHtml supports array-valued redirect location header", async () => {
    const axiosGetFn = mock(async (url: string) => {
      if (url === "https://example.com/a") {
        return {
          data: "",
          headers: { location: ["/b", "/ignored"] },
          status: 302,
        } as any;
      }

      return { data: "<html />", headers: {}, status: 200 } as any;
    });

    const html = await fetchHtml("https://example.com/a", {
      axiosGetFn: axiosGetFn as any,
      isAllowedFeedUrlFn: async () => true,
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
      parseAndValidateArticleUrlFn: async () => parseResponse,
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
    });
    expect(fromParse).toBe(parseResponse);
  });

  test("POST bypasses auth entirely for local placeholder snapshot requests", async () => {
    const authFn = mock(async () => {
      throw new Error("placeholder snapshot request should not authenticate");
    });

    const response = await POST(
      new NextRequest("http://localhost/api/articles/extract", {
        body: JSON.stringify({
          url: "https://science.nasa.gov/photojournal/jpl-3d-printed-part-springs-forward/",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
      {
        requireMutableAuthenticatedUserFn: authFn,
      },
    );

    expect(response.status).toBe(200);
    expect(authFn).not.toHaveBeenCalled();
    const body = await response.json();
    expect(typeof body.content).toBe("string");
    expect(body.content.length).toBeGreaterThan(0);
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
        errorFn: errorFn as any,
        fetchHtmlFn: async () => {
          throw axiosError;
        },
        isAxiosErrorFn: (() => true) as any,
        parseAndValidateArticleUrlFn: async () => "https://example.com/article",
        requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
        toErrorMessageFn: () => "upstream-throttled",
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
        errorFn: errorFn as any,
        fetchHtmlFn: async () => {
          throw new Error("boom");
        },
        isAxiosErrorFn: (() => false) as any,
        parseAndValidateArticleUrlFn: async () => "https://example.com/article",
        requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
        toErrorMessageFn: () => "normalized-boom",
      });

      expect(genericResult.status).toBe(502);
      const genericBody = await genericResult.json();
      expect(genericBody.error).toBe("Failed to extract article content");
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
      return { data: "<html />", headers: {}, status: 200 } as any;
    });

    await fetchHtml("https://example.com/article#comments", {
      axiosGetFn: axiosGetFn as any,
      isAllowedFeedUrlFn: async () => true,
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
          data: "",
          headers: { location: "https://example.com/article#section-2" },
          status: 302,
        } as any;
      }
      return { data: "<html />", headers: {}, status: 200 } as any;
    });

    await fetchHtml("https://example.com/a", {
      axiosGetFn: axiosGetFn as any,
      isAllowedFeedUrlFn: async () => true,
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
          data: "",
          headers: { location: chain[url] },
          status: 302,
        } as any;
      }
      return { data: "<html>final</html>", headers: {}, status: 200 } as any;
    });

    const html = await fetchHtml("https://example.com/a", {
      axiosGetFn: axiosGetFn as any,
      isAllowedFeedUrlFn: async () => true,
    });

    expect(html).toBe("<html>final</html>");
    // 5 redirects + 1 final = 6 calls
    expect(axiosGetFn).toHaveBeenCalledTimes(6);
  });

  test("fetchHtml raises DataDome-specific error on 403 with x-datadome: protected", async () => {
    const axiosGetFn = mock(async () => {
      const err: any = new Error("Request failed with status code 403");
      err.isAxiosError = true;
      err.response = { headers: { "x-datadome": "protected" }, status: 403 };
      throw err;
    });

    await expect(
      fetchHtml("https://example.com/article", {
        axiosGetFn: axiosGetFn as any,
        isAllowedFeedUrlFn: async () => true,
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
      err.response = { data: pxBody, headers: {}, status: 403 };
      throw err;
    });

    await expect(
      fetchHtml("https://example.com/article", {
        axiosGetFn: axiosGetFn as any,
        isAllowedFeedUrlFn: async () => true,
        isAxiosErrorFn: ((e: any) => e?.isAxiosError === true) as any,
      }),
    ).rejects.toThrow("PerimeterX");
  });

  test("fetchHtml raises PerimeterX-specific error on 403 with x-px-* response header", async () => {
    const axiosGetFn = mock(async () => {
      const err: any = new Error("Request failed with status code 403");
      err.isAxiosError = true;
      err.response = {
        data: "",
        headers: { "x-px-vid": "some-vid" },
        status: 403,
      };
      throw err;
    });

    await expect(
      fetchHtml("https://example.com/article", {
        axiosGetFn: axiosGetFn as any,
        isAllowedFeedUrlFn: async () => true,
        isAxiosErrorFn: ((e: any) => e?.isAxiosError === true) as any,
      }),
    ).rejects.toThrow("PerimeterX");
  });

  test("fetchHtml raises Cloudflare-specific error on 403 challenge response", async () => {
    const cfBody =
      "<html><title>Attention Required! | Cloudflare</title><script>window.__cf_chl_opt = {};</script></html>";
    const axiosGetFn = mock(async () => {
      const err: any = new Error("Request failed with status code 403");
      err.isAxiosError = true;
      err.response = {
        data: cfBody,
        headers: { "cf-mitigated": "challenge", "set-cookie": "__cf_bm=abc" },
        status: 403,
      };
      throw err;
    });

    await expect(
      fetchHtml("https://example.com/article", {
        axiosGetFn: axiosGetFn as any,
        isAllowedFeedUrlFn: async () => true,
        isAxiosErrorFn: ((e: any) => e?.isAxiosError === true) as any,
      }),
    ).rejects.toThrow("Cloudflare");
  });

  test("fetchHtml raises reCAPTCHA-specific error on 403 recaptcha body", async () => {
    const recaptchaBody =
      '<html><script src="https://www.google.com/recaptcha/api.js"></script><div class="g-recaptcha"></div></html>';
    const axiosGetFn = mock(async () => {
      const err: any = new Error("Request failed with status code 403");
      err.isAxiosError = true;
      err.response = { data: recaptchaBody, headers: {}, status: 403 };
      throw err;
    });

    await expect(
      fetchHtml("https://example.com/article", {
        axiosGetFn: axiosGetFn as any,
        isAllowedFeedUrlFn: async () => true,
        isAxiosErrorFn: ((e: any) => e?.isAxiosError === true) as any,
      }),
    ).rejects.toThrow("reCAPTCHA");
  });

  test("fetchHtmlWithFingerprint validates redirects against SSRF policy", async () => {
    let callCount = 0;
    const mockRequest = async (url: URL) => {
      callCount++;
      if (url.href === "https://example.com/article") {
        return {
          body: "",
          headers: { location: "http://127.0.0.1/private" } as Record<
            string,
            string | string[] | undefined
          >,
          statusCode: 302,
        };
      }
      return {
        body: "ok",
        headers: {} as Record<string, string | string[] | undefined>,
        statusCode: 200,
      };
    };

    await expect(
      fetchHtmlWithFingerprint(
        "https://example.com/article",
        async (candidateUrl) => !candidateUrl.includes("127.0.0.1"),
        undefined,
        { requestFn: mockRequest },
      ),
    ).rejects.toThrow("Blocked redirect target");

    expect(callCount).toBe(1);
  });

  test("fetchHtml in proxy mode uses single fingerprint-fetch attempt", async () => {
    let callCount = 0;
    const mockFpFetch = mock(async () => {
      callCount++;
      return {
        html: "<html>proxied once</html>",
        requestHeaders: {} as Record<string, string | string[] | undefined>,
      };
    });

    const html = await fetchHtml(
      "https://example.com/article",
      {
        fingerprintFetchFn: mockFpFetch as any,
        isAllowedFeedUrlFn: async () => true,
      },
      { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
    );

    expect(html).toBe("<html>proxied once</html>");
    expect(callCount).toBe(1);
  });

  // ─── Proxy SOCKS tunnel architecture ──────────────────────────────────────
  // The custom fingerprint-fetch implementation tunnels ALL traffic (ALPN probe,
  // TLS handshake, HTTP request) through the SOCKS proxy. IP leaks are impossible
  // by design — no direct connections are made to the target.

  describe("proxy SOCKS tunnel architecture", () => {
    test("sets Sec-Fetch-Site cross-site when referer is provided", async () => {
      let capturedHeaders: Record<string, string> | undefined;
      const mockFpFetch = mock(
        async (_url: string, _allowed: any, opts: any) => {
          capturedHeaders = {
            referer: opts?.referer ?? "",
            "sec-fetch-site": "cross-site",
          };
          return {
            html: "<html>ok</html>",
            requestHeaders: {} as Record<string, string | string[] | undefined>,
          };
        },
      );

      await fetchHtml(
        "https://example.com/some-article-title",
        {
          fingerprintFetchFn: mockFpFetch as any,
          isAllowedFeedUrlFn: async () => true,
        },
        { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
      );

      // The proxy path always supplies a DDG referer (cross-site navigation).
      expect(capturedHeaders?.referer).toContain("duckduckgo.com");
    });
  });

  // ─── Proxy loop bot-detection abort ───────────────────────────────────────
  // When PerimeterX or DataDome block the proxy egress IP, the block is at IP
  // reputation level — UA/fingerprint rotation cannot bypass it.  The proxy
  // loop must abort immediately on the first detected attempt rather than
  // burning all retry slots and delaying the caller by ~3 seconds.

  describe("proxy loop bot-detection abort", () => {
    const pxBody =
      '<!DOCTYPE html><html><head><meta name="description" content="px-captcha" /></head></html>';

    // Helper: creates a fingerprintFetchFn that throws GotScrapingError with
    // the given statusCode, body, and headers on every call.
    function makeFpFetchError(
      statusCode: number,
      body: string,
      headers: Record<string, string | string[] | undefined> = {},
    ) {
      let callCount = 0;
      const fn = mock(async () => {
        callCount++;
        throw new GotScrapingError(
          statusCode,
          body,
          "socks",
          null,
          131,
          false,
          0,
          headers,
          {},
        );
      });
      return { fn, getCount: () => callCount };
    }

    test("aborts after 1 attempt on PerimeterX body detection (px-captcha)", async () => {
      const { fn, getCount } = makeFpFetchError(403, pxBody);

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            fingerprintFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(getCount()).toBe(1);
    });

    test("aborts after 1 attempt on PerimeterX x-px-* response header", async () => {
      const { fn, getCount } = makeFpFetchError(403, "", {
        "x-px-vid": "some-vid-value",
      });

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            fingerprintFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(getCount()).toBe(1);
    });

    test("aborts after 1 attempt on DataDome x-datadome: protected header", async () => {
      const { fn, getCount } = makeFpFetchError(403, "", {
        "x-datadome": "protected",
      });

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            fingerprintFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(getCount()).toBe(1);
    });

    test("retries all 3 attempts on generic 403 (no bot-detection signal)", async () => {
      const { fn, getCount } = makeFpFetchError(
        403,
        "<html>generic 403</html>",
      );

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            fingerprintFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      // 3 total: 1 initial + 2 retries (EXTRACT_403_RETRIES = 2)
      expect(getCount()).toBe(3);
    });

    test("retries all 3 attempts on 429 rate-limit (no bot signal)", async () => {
      const { fn, getCount } = makeFpFetchError(429, "");

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            fingerprintFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("429");

      expect(getCount()).toBe(3);
    });

    test("succeeds on first attempt and makes exactly 1 fingerprint-fetch call", async () => {
      let callCount = 0;
      const mockFpFetch = mock(async () => {
        callCount++;
        return {
          html: "<html>success</html>",
          requestHeaders: {} as Record<string, string | string[] | undefined>,
        };
      });

      const html = await fetchHtml(
        "https://example.com/article",
        {
          delayFn: async () => {},
          fingerprintFetchFn: mockFpFetch as any,
          isAllowedFeedUrlFn: async () => true,
        },
        { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
      );

      expect(html).toBe("<html>success</html>");
      expect(callCount).toBe(1);
    });

    test("rotates fingerprint pool on each proxy retry", async () => {
      const capturedSecChUas: string[] = [];
      const mockFpFetch = mock(
        async (_url: string, _allowed: any, opts: any) => {
          if (opts?.secChUa) capturedSecChUas.push(opts.secChUa);
          throw new GotScrapingError(
            403,
            "<html>blocked</html>",
            "socks",
            null,
            opts?.browserVersion ?? 131,
            false,
            0,
            {},
            {},
          );
        },
      );

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            fingerprintFetchFn: mockFpFetch as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      // All 3 attempts must have run, using the fingerprint pool (currently has 1 entry)
      expect(capturedSecChUas.length).toBe(3);
      // Since pool has 1 entry, all attempts use the same fingerprint
      expect(new Set(capturedSecChUas).size).toBe(1);
    });
  });

  // ─── Fingerprint-fetch pure function tests ────────────────────────────────

  describe("parseSocksProxy", () => {
    test("parses socks5 URL with credentials", () => {
      const result = parseSocksProxy(
        "socks5://user:pass@proxy.example.com:1080",
      );
      expect(result.host).toBe("proxy.example.com");
      expect(result.port).toBe(1080);
      expect(result.type).toBe(5);
      expect(result.userId).toBe("user");
      expect(result.password).toBe("pass");
    });

    test("parses socks4 URL without credentials", () => {
      const result = parseSocksProxy("socks4://10.0.0.1:9050");
      expect(result.host).toBe("10.0.0.1");
      expect(result.port).toBe(9050);
      expect(result.type).toBe(4);
      expect(result.userId).toBeUndefined();
    });

    test("defaults port to 1080", () => {
      const result = parseSocksProxy("socks5://proxy.test");
      expect(result.port).toBe(1080);
    });

    test("decodes percent-encoded credentials", () => {
      const result = parseSocksProxy("socks5://us%40er:p%23ss@proxy.test:1080");
      expect(result.userId).toBe("us@er");
      expect(result.password).toBe("p#ss");
    });
  });

  describe("decompressBody", () => {
    test("returns plain text as-is for identity encoding", async () => {
      const buf = Buffer.from("hello world", "utf-8");
      expect(await decompressBody(buf, "")).toBe("hello world");
    });

    test("decompresses gzip", async () => {
      const { gzipSync } = await import("node:zlib");
      const compressed = gzipSync(Buffer.from("gzip content"));
      expect(await decompressBody(compressed, "gzip")).toBe("gzip content");
    });

    test("decompresses x-gzip", async () => {
      const { gzipSync } = await import("node:zlib");
      const compressed = gzipSync(Buffer.from("x-gzip content"));
      expect(await decompressBody(compressed, "x-gzip")).toBe("x-gzip content");
    });

    test("decompresses brotli", async () => {
      const { brotliCompressSync } = await import("node:zlib");
      const compressed = brotliCompressSync(Buffer.from("brotli content"));
      expect(await decompressBody(compressed, "br")).toBe("brotli content");
    });

    test("decompresses deflate", async () => {
      const { deflateSync } = await import("node:zlib");
      const compressed = deflateSync(Buffer.from("deflate content"));
      expect(await decompressBody(compressed, "deflate")).toBe(
        "deflate content",
      );
    });

    test("returns raw UTF-8 for unknown encoding", async () => {
      const buf = Buffer.from("raw", "utf-8");
      expect(await decompressBody(buf, "unknown")).toBe("raw");
    });
  });

  describe("generateBrowserHeaders", () => {
    test("produces headers with expected keys", () => {
      const headers = generateBrowserHeaders("1");
      expect(headers["Accept-Language"]).toBe("en-US,en;q=0.9");
      expect(headers["Accept-Encoding"]).toBe("gzip, deflate, br, zstd");
      expect(headers["priority"]).toBe("u=0, i");
      expect(typeof headers["User-Agent"]).toBe("string");
    });

    test("includes accept override", () => {
      const headers = generateBrowserHeaders("1", { accept: "text/html" });
      expect(headers["Accept"]).toBe("text/html");
    });

    test("sets cross-site fetch mode when referer provided", () => {
      const headers = generateBrowserHeaders("1", {
        referer: "https://duckduckgo.com",
      });
      expect(headers["Referer"]).toBe("https://duckduckgo.com");
      expect(headers["Sec-Fetch-Site"]).toBe("cross-site");
    });

    test("strips h2 pseudo-headers", () => {
      const headers = generateBrowserHeaders("2");
      for (const key of Object.keys(headers)) {
        expect(key.startsWith(":")).toBe(false);
      }
    });
  });

  describe("fetchHtmlWithFingerprint edge cases", () => {
    test("throws on redirect without Location header", async () => {
      const mockRequest = async () => ({
        body: "",
        headers: {} as Record<string, string | string[] | undefined>,
        statusCode: 302,
      });

      await expect(
        fetchHtmlWithFingerprint(
          "https://example.com/article",
          async () => true,
          undefined,
          { requestFn: mockRequest },
        ),
      ).rejects.toThrow("Redirect without Location header");
    });

    test("throws on too many redirects", async () => {
      let hop = 0;
      const mockRequest = async () => {
        hop++;
        return {
          body: "",
          headers: { location: `https://example.com/hop${hop}` } as Record<
            string,
            string | string[] | undefined
          >,
          statusCode: 301,
        };
      };

      await expect(
        fetchHtmlWithFingerprint(
          "https://example.com/start",
          async () => true,
          undefined,
          { requestFn: mockRequest },
        ),
      ).rejects.toThrow("Too many redirects");
    });

    test("stores response cookies in jar", async () => {
      const { CookieJar: Jar } = await import("tough-cookie");
      const jar = new Jar();
      const mockRequest = async () => ({
        body: "<html>ok</html>",
        headers: { "set-cookie": "sid=abc; Path=/" } as Record<
          string,
          string | string[] | undefined
        >,
        statusCode: 200,
      });

      await fetchHtmlWithFingerprint(
        "https://example.com/article",
        async () => true,
        { cookieJar: jar },
        { requestFn: mockRequest },
      );

      const cookies = jar.getCookieStringSync("https://example.com/");
      expect(cookies).toContain("sid=abc");
    });
  });

  // ─── POST logging ─────────────────────────────────────────────────────────

  test("POST returns extracted content on success", async () => {
    const response = await POST(mockReq(), {
      cleanSanitizedHtmlFn: (c) => c,
      extractFromHtmlFn: async () => ({
        content: "<p>Real article content here that is long enough.</p>",
        title: "Title",
      }),
      fetchHtmlFn: async () => "<html />",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (c) => c,
      warnFn: mock(() => {}),
    });

    expect(response.status).toBe(200);
    const payload: { content: string } = await response.json();
    expect(payload.content).toContain("Real article content");
  });

  test("POST fires warn log when extractor returns no content", async () => {
    const warnFn = mock(() => {});

    await POST(mockReq(), {
      cleanSanitizedHtmlFn: (c) => c,
      extractFromHtmlFn: async () => null,
      fetchHtmlFn: async () => "<html />",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (c) => c,
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
      cleanSanitizedHtmlFn: () => "",
      extractFromHtmlFn: async () => ({ content: "<p>stuff</p>", title: "T" }),
      fetchHtmlFn: async () => "<html />",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: () => "",
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
      extractFromHtmlFn: async () => ({
        content: footerOnlyExtraction,
        title: "Cartoon: But the portions are huge!",
      }),
      fetchHtmlFn: async () => `
        <html>
          <head>
            <meta property="og:image" content="https://cdn.prod.dailykos.com/images/1528229/story_image/20260218edshe-b.jpg?1771436292" />
            <meta property="og:description" content="A cartoon by Drew Sheneman." />
          </head>
        </html>
      `,
      parseAndValidateArticleUrlFn: async () =>
        "https://www.dailykos.com/stories/2026/2/27/2369312/-Cartoon-But-the-portions-are-huge",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      warnFn: warnFn as any,
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.content).toContain(
      'src="https://cdn.prod.dailykos.com/images/1528229/story_image/20260218edshe-b.jpg?1771436292"',
    );
    expect(payload.content).toContain("A cartoon by Drew Sheneman.");
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
      extractFromHtmlFn: async () => ({
        content: footerOnlyExtraction,
        title: "Cartoon: But the portions are huge!",
      }),
      fetchHtmlFn: async () => `
        <html>
          <head>
            <meta property="og:image" content="javascript:alert(1)" />
            <meta property="og:description" content="Unsafe metadata image." />
          </head>
        </html>
      `,
      parseAndValidateArticleUrlFn: async () =>
        "https://www.dailykos.com/stories/2026/2/27/2369312/-Cartoon-But-the-portions-are-huge",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      warnFn: warnFn as any,
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
      content: "cached-content",
      source: "Source",
      title: "Title",
    }));
    const warnFn = mock(() => {});

    const deps = {
      cleanSanitizedHtmlFn: (content: string) => content,
      extractFromHtmlFn: extractFromHtmlFn as any,
      fetchHtmlFn: fetchHtmlFn as any,
      getHostnameFn: () => "example.com",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (content: string) => content,
      shouldUseExtractCacheFn: () => true,
      warnFn: warnFn as any,
    };

    const firstResponse = await POST(mockReq(), deps);
    const secondResponse = await POST(mockReq(), deps);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(fetchHtmlFn).toHaveBeenCalledTimes(1);
    expect(extractFromHtmlFn).toHaveBeenCalledTimes(1);
    expect(await secondResponse.json()).toEqual({
      content: "cached-content",
      source: "Source",
      title: "Title",
    });
  });

  test("POST bypasses extract cache when disabled", async () => {
    const fetchHtmlFn = mock(async () => "<html />");
    const extractFromHtmlFn = mock(async () => ({
      content: "uncached-content",
      source: "Source",
      title: "Title",
    }));
    const warnFn = mock(() => {});

    const deps = {
      cleanSanitizedHtmlFn: (content: string) => content,
      extractFromHtmlFn: extractFromHtmlFn as any,
      fetchHtmlFn: fetchHtmlFn as any,
      getHostnameFn: () => "example.com",
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (content: string) => content,
      shouldUseExtractCacheFn: () => false,
      warnFn: warnFn as any,
    };

    const firstResponse = await POST(mockReq(), deps);
    const secondResponse = await POST(mockReq(), deps);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(fetchHtmlFn).toHaveBeenCalledTimes(2);
    expect(extractFromHtmlFn).toHaveBeenCalledTimes(2);
  });
});
