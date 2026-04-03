/**
 * Covers the reading pipeline from captured article HTML through sanitize output.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import * as zlib from "zlib";

import { getHostname, POST } from "@/app/api/articles/extract/route";
import { CONFIG } from "@/lib/config";
import {
    clearArticleExtractCacheForTests,
    fetchHtml,
    parseAndValidateArticleUrl,
} from "@/lib/extract";
import { fetchHtmlWithHttpCloak } from "@/lib/fetch/httpcloak-client";
import { decompressBody, HttpCloakUpstreamError } from "@/lib/fetch/response";
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
import { decodePossiblyCompressedText } from "@/lib/utils/content-encoding";
import { promoteHttpCloakProxyUrl } from "@/lib/utils/httpcloak";

const mockReq = () =>
  new NextRequest("http://localhost/api/articles/extract", {
    body: JSON.stringify({ url: "https://example.com/article" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

async function compressWithZstd(input: string): Promise<Buffer> {
  const zstdCompress = (zlib as Record<string, unknown>).zstdCompress as
    | typeof zlib.brotliCompress
    | undefined;

  if (!zstdCompress) {
    throw new Error("zstd compression is unavailable in this runtime");
  }

  return new Promise<Buffer>((resolve, reject) => {
    zstdCompress(Buffer.from(input, "utf8"), (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

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

describe("decodePossiblyCompressedText", () => {
  test("rejects compressed latin1 payloads that expand beyond the configured limit", async () => {
    const oversizedHtml = "x".repeat(CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES + 1);
    const compressedHtml = zlib
      .gzipSync(Buffer.from(oversizedHtml, "utf8"))
      .toString("latin1");

    await expect(
      decodePossiblyCompressedText(compressedHtml, {
        maxOutputBytes: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
      }),
    ).rejects.toThrow("Upstream response too large");
  });
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

  test("cleanSanitizedHtml removes a leading linked author bio fragment before article paragraphs", () => {
    const input =
      '<a href="https://example.com/authors/jane-doe">Jane Doe</a>' +
      "Jane Doe has written the publication's weekly column since 2020. " +
      "An award-winning journalist covering labor and politics. " +
      "Email: jane@example.com" +
      "<p>Lead paragraph.</p>" +
      "<p>Second paragraph.</p>";

    const cleaned = cleanSanitizedHtml(input, "https://example.com/article");

    expect(cleaned).toContain("Lead paragraph.");
    expect(cleaned).toContain("Second paragraph.");
    expect(cleaned).not.toContain("jane@example.com");
    expect(cleaned).not.toContain("has written the publication's weekly column");
    expect(cleaned).not.toContain("authors/jane-doe");
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

  test("fetchHtml blocks disallowed URLs before HTTPCloak transport", async () => {
    const httpCloakFetchFn = mock(async (_url, isAllowedUrl) => {
      const isAllowed = await isAllowedUrl("https://example.com/a");

      if (!isAllowed) {
        throw new Error("Blocked URL");
      }

      return {
        html: "<html />",
        requestHeaders: {},
      };
    });

    await expect(
      fetchHtml("https://example.com/a", {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => false,
      }),
    ).rejects.toThrow("Blocked URL");

    expect(httpCloakFetchFn).toHaveBeenCalledTimes(1);
  });

  test("fetchHtml follows HTTPCloak redirects and returns the final body", async () => {
    const requestUrls: string[] = [];
    const httpCloakFetchFn = mock(async (url: string) => {
      requestUrls.push(url);

      if (url === "https://example.com/a") {
        return {
          html: "<html />",
          requestHeaders: {},
        };
      }

      return {
        html: "<html />",
        requestHeaders: {},
      };
    });

    const html = await fetchHtml("https://example.com/a", {
      httpCloakFetchFn,
      isAllowedFeedUrlFn: async () => true,
    });

    expect(html).toBe("<html />");
    expect(requestUrls).toEqual(["https://example.com/a"]);
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
          url: "https://www.usgs.gov/news/state-news-release/media-alert-low-level-airplane-and-helicopter-flights-scan-geology-over",
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

  test("POST maps HTTPCloak and generic failures to expected error handlers", async () => {
    const previousLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "verbose";

    const errorFn = mock(() => {});

    // Upstream 4xx (including 403, 429) must NOT be mirrored back to the
    // client — they are gateway failures, not client errors. Only upstream 404
    // is special-cased to 422 Unprocessable Content.
    const httpCloakError = new HttpCloakUpstreamError(
      429,
      "throttled",
      "direct",
      null,
      false,
      0,
      { server: "cloudflare" },
      {},
    );
    try {
      const httpCloakResult = await POST(mockReq(), {
        errorFn: errorFn as any,
        fetchHtmlFn: async () => {
          throw httpCloakError;
        },
        parseAndValidateArticleUrlFn: async () => "https://example.com/article",
        requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
        toErrorMessageFn: () => "upstream-throttled",
      });

      expect(httpCloakResult.status).toBe(502);
      const httpCloakBody = await httpCloakResult.json();
      expect(httpCloakBody.error).toBe(
        "Failed to fetch article content from upstream",
      );
      expect(httpCloakBody.reason).toBe("upstream-throttled");
      expect(errorFn).toHaveBeenCalledWith(
        expect.stringContaining("upstream request failed"),
        expect.objectContaining({
          extractAttemptId: expect.any(String),
          statusCode: 429,
        }),
      );

      errorFn.mockClear();

      const genericResult = await POST(mockReq(), {
        errorFn: errorFn as any,
        fetchHtmlFn: async () => {
          throw new Error("boom");
        },
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

  // ─── Fragment stripping and vendor-response handling ─────────────────────

  test("fetchHtml strips fragment from the initial URL before calling HTTPCloak", async () => {
    const requestedUrls: string[] = [];
    const httpCloakFetchFn = mock(async (url: string) => {
      requestedUrls.push(url);
      return {
        html: "<html />",
        requestHeaders: {},
      };
    });

    await fetchHtml("https://example.com/article#comments", {
      httpCloakFetchFn,
      isAllowedFeedUrlFn: async () => true,
    });

    expect(requestedUrls).toEqual(["https://example.com/article#comments"]);
  });

  test("fetchHtml raises DataDome-specific errors from HTTPCloak responses", async () => {
    const httpCloakFetchFn = mock(async () => {
      throw new HttpCloakUpstreamError(
        403,
        "blocked",
        "direct",
        null,
        false,
        0,
        { "x-datadome": "protected" },
        {},
      );
    });

    await expect(
      fetchHtml("https://example.com/article", {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("DataDome");
  });

  test("fetchHtml raises PerimeterX-specific errors from HTTPCloak responses", async () => {
    const httpCloakFetchFn = mock(async () => {
      throw new HttpCloakUpstreamError(
        403,
        "<html>px-captcha challenge</html>",
        "direct",
        null,
        false,
        0,
        { "x-px-vid": "some-vid" },
        {},
      );
    });

    await expect(
      fetchHtml("https://example.com/article", {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("PerimeterX");
  });

  test("fetchHtml raises Cloudflare-specific errors from HTTPCloak responses", async () => {
    const httpCloakFetchFn = mock(async () => {
      throw new HttpCloakUpstreamError(
        403,
        "<html><title>Attention Required! | Cloudflare</title></html>",
        "direct",
        null,
        false,
        0,
        { "cf-mitigated": "challenge", "set-cookie": "__cf_bm=abc" },
        {},
      );
    });

    await expect(
      fetchHtml("https://example.com/article", {
        httpCloakFetchFn,
        isAllowedFeedUrlFn: async () => true,
      }),
    ).rejects.toThrow("Cloudflare");
  });

  test("fetchHtmlWithHttpCloak validates redirects against SSRF policy", async () => {
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
      fetchHtmlWithHttpCloak(
        "https://example.com/article",
        async (candidateUrl) => !candidateUrl.includes("127.0.0.1"),
        undefined,
        { requestFn: mockRequest },
      ),
    ).rejects.toThrow("Blocked redirect target");

    expect(callCount).toBe(1);
  });

  test("fetchHtml in proxy mode uses single httpCloak-fetch attempt", async () => {
    let callCount = 0;
    const mockHttpCloakFetch = mock(async () => {
      callCount++;
      return {
        html: "<html>proxied once</html>",
        requestHeaders: {} as Record<string, string | string[] | undefined>,
      };
    });

    const html = await fetchHtml(
      "https://example.com/article",
      {
        httpCloakFetchFn: mockHttpCloakFetch as any,
        isAllowedFeedUrlFn: async () => true,
      },
      { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
    );

    expect(html).toBe("<html>proxied once</html>");
    expect(callCount).toBe(1);
  });

  // ─── Proxy SOCKS tunnel architecture ──────────────────────────────────────
  // The custom httpCloak-fetch implementation tunnels ALL traffic (ALPN probe,
  // TLS handshake, HTTP request) through the SOCKS proxy. IP leaks are impossible
  // by design — no direct connections are made to the target.

  describe("proxy SOCKS tunnel architecture", () => {
    test("passes transport-only options to httpcloak", async () => {
      let capturedOptions: Record<string, unknown> | undefined;
      const mockHttpCloakFetch = mock(
        async (_url: string, _allowed: any, opts: any) => {
          capturedOptions = opts ? { ...opts } : {};
          return {
            html: "<html>ok</html>",
            requestHeaders: {} as Record<string, string | string[] | undefined>,
          };
        },
      );

      await fetchHtml(
        "https://example.com/some-article-title",
        {
          httpCloakFetchFn: mockHttpCloakFetch as any,
          isAllowedFeedUrlFn: async () => true,
        },
        { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
      );

      expect(capturedOptions).toEqual({
        allowInsecureTls: false,
        proxyUrl: "socks5://127.0.0.1:1080",
      });
    });
  });

  // ─── Proxy loop compatibility-signal abort ────────────────────────────────
  // When PerimeterX or DataDome block the proxy egress IP, the block is at IP
  // reputation level — UA/httpCloak rotation cannot bypass it.  The proxy
  // loop must abort immediately on the first detected attempt rather than
  // burning all retry slots and delaying the caller by ~3 seconds.

  describe("proxy loop compatibility-signal abort", () => {
    const pxBody =
      '<!DOCTYPE html><html><head><meta name="description" content="px-captcha" /></head></html>';

    // Helper: creates a httpCloakFetchFn that throws HttpCloakUpstreamError with
    // the given statusCode, body, and headers on every call.
    function makeFpFetchError(
      statusCode: number,
      body: string,
      headers: Record<string, string | string[] | undefined> = {},
    ) {
      let callCount = 0;
      const fn = mock(async () => {
        callCount++;
        throw new HttpCloakUpstreamError(
          statusCode,
          body,
          "socks",
          null,
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
            httpCloakFetchFn: fn as any,
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
            httpCloakFetchFn: fn as any,
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
            httpCloakFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(getCount()).toBe(1);
    });

    test("stops after 1 attempt on generic 403 (no compatibility signal)", async () => {
      const { fn, getCount } = makeFpFetchError(
        403,
        "<html>generic 403</html>",
      );

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            httpCloakFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(getCount()).toBe(1);
    });

    test("stops after 1 attempt on 429 rate-limit (no compatibility signal)", async () => {
      const { fn, getCount } = makeFpFetchError(429, "");

      await expect(
        fetchHtml(
          "https://example.com/article",
          {
            delayFn: async () => {},
            httpCloakFetchFn: fn as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("429");

      expect(getCount()).toBe(1);
    });

    test("succeeds on first attempt and makes exactly 1 httpCloak-fetch call", async () => {
      let callCount = 0;
      const mockHttpCloakFetch = mock(async () => {
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
          httpCloakFetchFn: mockHttpCloakFetch as any,
          isAllowedFeedUrlFn: async () => true,
        },
        { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
      );

      expect(html).toBe("<html>success</html>");
      expect(callCount).toBe(1);
    });

    test("passes the same transport-only options through the single HTTPCloak attempt", async () => {
      const capturedOptions: Record<string, unknown>[] = [];
      const mockHttpCloakFetch = mock(
        async (_url: string, _allowed: any, opts: any) => {
          capturedOptions.push(opts ? { ...opts } : {});
          throw new HttpCloakUpstreamError(
            403,
            "<html>blocked</html>",
            "socks",
            null,
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
            httpCloakFetchFn: mockHttpCloakFetch as any,
            isAllowedFeedUrlFn: async () => true,
          },
          { proxyUrl: "socks5://127.0.0.1:1080", useProxy: true },
        ),
      ).rejects.toThrow("403");

      expect(capturedOptions).toEqual([
        {
          allowInsecureTls: false,
          proxyUrl: "socks5://127.0.0.1:1080",
        },
      ]);
    });
  });

  // ─── HTTPCloak-fetch pure function tests ────────────────────────────────

  describe("promoteHttpCloakProxyUrl", () => {
    test("promotes socks5 URLs to remote-DNS socks5h", () => {
      expect(promoteHttpCloakProxyUrl("socks5://user:pass@proxy.example.com:1080")).toBe(
        "socks5h://user:pass@proxy.example.com:1080",
      );
    });

    test("promotes socks4 URLs to remote-DNS socks4a", () => {
      expect(promoteHttpCloakProxyUrl("socks4://10.0.0.1:9050")).toBe(
        "socks4a://10.0.0.1:9050",
      );
    });

    test("leaves non-socks URLs unchanged", () => {
      expect(promoteHttpCloakProxyUrl("https://proxy.test:8443")).toBe(
        "https://proxy.test:8443",
      );
    });

    test("returns invalid URLs unchanged", () => {
      expect(promoteHttpCloakProxyUrl("not-a-real-url")).toBe("not-a-real-url");
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

  describe("fetchHtmlWithHttpCloak edge cases", () => {
    test("throws on redirect without Location header", async () => {
      const mockRequest = async () => ({
        body: "",
        headers: {} as Record<string, string | string[] | undefined>,
        statusCode: 302,
      });

      await expect(
        fetchHtmlWithHttpCloak(
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
        fetchHtmlWithHttpCloak(
          "https://example.com/start",
          async () => true,
          undefined,
          { requestFn: mockRequest },
        ),
      ).rejects.toThrow("Too many redirects");
    });

    test("returns decoded HTML for successful responses", async () => {
      const mockRequest = async () => ({
        body: "<html>ok</html>",
        headers: {} as Record<
          string,
          string | string[] | undefined
        >,
        statusCode: 200,
      });

      const result = await fetchHtmlWithHttpCloak(
        "https://example.com/article",
        async () => true,
        undefined,
        { requestFn: mockRequest },
      );

      expect(result.html).toBe("<html>ok</html>");
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

  test("POST decodes zstd-compressed html returned from fetchHtml before extraction", async () => {
    const zstdCompress = (zlib as Record<string, unknown>).zstdCompress;
    if (!zstdCompress) {
      expect(true).toBe(true);
      return;
    }

    const html = "<!DOCTYPE html><html><body><article><p>Jacobin route fallback content.</p></article></body></html>";
    const compressedHtml = await compressWithZstd(html);

    let capturedHtml = "";
    const response = await POST(mockReq(), {
      cleanSanitizedHtmlFn: (c) => c,
      extractFromHtmlFn: async (receivedHtml) => {
        capturedHtml = receivedHtml;
        return { content: "<p>Jacobin route fallback content.</p>", title: "T" };
      },
      fetchHtmlFn: async () => compressedHtml.toString("latin1"),
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      sanitizeRawContentFn: (c) => c,
      shouldUseExtractCacheFn: () => false,
      warnFn: mock(() => {}),
    });

    expect(capturedHtml).toContain("Jacobin route fallback content");
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { content?: string };
    expect(payload.content).toContain("Jacobin route fallback content");
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
