import {
  POST,
  cleanExtractedArticleHtml,
  extractDailyKosStoryFallbackHtml,
  fetchHtml,
  getHostname,
  hasDailyKosStoryImage,
  hasReadableArticleBody,
  isLikelyDailyKosFooterBoilerplate,
  normalizeExtractedHtmlSpacing,
  parseAndValidateArticleUrl,
  sanitizeExtractedContent,
  stripKnownDailyKosBoilerplate,
  toParagraphHtml,
} from "@/app/api/articles/extract/route";
import { extractFromHtml } from "@extractus/article-extractor";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIR = join(
  process.cwd(),
  "src/__tests__/snapshots/expect-extraction",
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
const SPECIAL_CASE_MEDIA_HOST = `cdn.prod.${SPECIAL_CASE_HOSTNAME.replace(/^www\./i, "")}`;
const SNAPSHOT_SPECIAL_CASE_HOSTNAME = getHostname(
  extractCanonicalUrlFromHtml(readExtractionFixture("article-3"), "article-3"),
);

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("article extract cleanup", () => {
  test("removes special-case publisher footer boilerplate and preserves article body", () => {
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

    expect(cleaned).toContain("Real article paragraph one");
    expect(cleaned).toContain("Real article paragraph two");
    expect(cleaned.toLowerCase()).not.toContain("front page");
    expect(cleaned.toLowerCase()).not.toContain("masthead");
    expect(cleaned.toLowerCase()).not.toContain("<p>about</p>");
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

  test("does not apply special-case cleanup to other domains", () => {
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

  test("extractDailyKosStoryFallbackHtml pulls story figure image and text", () => {
    const rawHtml = `
      <div class="story__image">
        <figure>
          <img src="https://${SPECIAL_CASE_MEDIA_HOST}/images/1528012/story_image/20260217edcbc-a.jpg?1771360334" alt="Cartoon" />
          <figcaption></figcaption>
        </figure>
      </div>
      <div class="story__text">
        <p>A cartoon by Mike Luckovich.</p>
        <hr>
        <p><strong>Related | <a href="https://publisher.example/stories/2026/2/6/2367483">Example related</a></strong></p>
      </div>
    `;

    const fallback = extractDailyKosStoryFallbackHtml(rawHtml);

    expect(fallback).toContain("<figure>");
    expect(fallback).toContain("story_image");
    expect(fallback).toContain("A cartoon by Mike Luckovich");
    expect(fallback).not.toContain("Related |");
  });

  test("extractDailyKosStoryFallbackHtml skips placeholder story__text blocks", () => {
    const rawHtml = `
      <div class="story__image">
        <figure>
          <img src="https://cdn.prod.dailykos.com/images/1528012/story_image/example.jpg" alt="Example" />
          <figcaption>Caption text</figcaption>
        </figure>
      </div>
      <div class="placeholder story__text"></div>
      <div class="story__text">
        <p>First paragraph.</p>
        <div class="dk-editor-embed">
          <div class="remove-embed-content">x</div>
          <a href="//youtube.com/watch?v=test">YouTube Video</a>
        </div>
        <p>Second paragraph.</p>
      </div>
    `;

    const fallback = extractDailyKosStoryFallbackHtml(rawHtml);

    expect(fallback).toContain("story_image/example.jpg");
    expect(fallback).toContain("First paragraph.");
    expect(fallback).toContain("Second paragraph.");
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
      '<figure><img data-src="/images/article.jpg" alt="Hero" /><figcaption>Caption</figcaption></figure>',
    );

    expect(cleaned).toContain("<img");
    expect(cleaned).toContain('src="/images/article.jpg"');
    expect(cleaned).toContain("Caption");
  });

  test("sanitizeExtractedContent keeps image content wrapped by section containers", () => {
    const cleaned = sanitizeExtractedContent(
      '<section><article><div><p><img src="https://example.com/hero.jpg" alt="Hero" /></p></div></article></section><p>Body text</p>',
    );

    expect(cleaned).toContain('<img src="https://example.com/hero.jpg"');
    expect(cleaned).toContain("Body text");
  });

  test("sanitizeExtractedContent recovers exactly one section-wrapped image when sanitizer drops wrappers", () => {
    const cleaned = sanitizeExtractedContent(
      '<section><article><p><img src="https://example.com/cover.jpg" alt="Cover" /></p></article></section><p>Story body.</p>',
    );

    const imgMatches = cleaned.match(/<img\b/gi) ?? [];
    expect(imgMatches).toHaveLength(1);
    expect(cleaned).toContain('src="https://example.com/cover.jpg"');
    expect(cleaned).toContain("Story body.");
  });

  test("sanitizeExtractedContent does not duplicate image when one is already preserved", () => {
    const cleaned = sanitizeExtractedContent(
      '<p><img src="https://example.com/inline.jpg" alt="Inline" /></p><p>Body copy.</p>',
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

  test("sanitizeExtractedContent removes known placeholder image URLs without dimensions", () => {
    const cleaned = sanitizeExtractedContent(
      '<section><article><p><img src="https://static.files.bbci.co.uk/core/grey-placeholder.png" alt="Placeholder" /></p></article></section><p>Body text remains.</p>',
    );

    expect(cleaned).not.toContain("grey-placeholder.png");
    expect(cleaned).toContain("Body text remains.");
  });

  test("normalizeExtractedHtmlSpacing removes empty paragraphs and inter-tag blank lines", () => {
    const cleaned = normalizeExtractedHtmlSpacing(
      "<p></p>\n\n<p>One</p>\n\n<p>Two</p>",
    );

    expect(cleaned).toBe("<p>One</p>\n<p>Two</p>");
  });

  test("downloaded html matches extraction pipeline snapshots", async () => {
    const fixtures = [
      { name: "article-1" },
      { name: "article-2" },
      { name: "article-3" },
      { name: "article-4" },
    ] as const;

    for (const fixture of fixtures) {
      const before = readExtractionFixture(fixture.name);
      const fixtureUrl = extractCanonicalUrlFromHtml(before, fixture.name);
      const expectedAfter = readFileSync(
        join(FIXTURE_DIR, `article-expect-${fixture.name.split("-")[1]}.html`),
        "utf8",
      ).trim();

      expect(expectedAfter.length).toBeGreaterThan(0);

      const extracted = await extractFromHtml(before, fixtureUrl, {
        contentLengthThreshold: 120,
      });
      const rawContent =
        extracted?.content?.trim() || extracted?.description?.trim() || "";
      const normalized = sanitizeExtractedContent(rawContent);
      let cleaned = cleanExtractedArticleHtml(normalized, fixtureUrl);

      if (
        getHostname(fixtureUrl).endsWith(SNAPSHOT_SPECIAL_CASE_HOSTNAME) &&
        (!hasDailyKosStoryImage(cleaned) || !hasReadableArticleBody(cleaned))
      ) {
        const fallbackContent = cleanExtractedArticleHtml(
          sanitizeExtractedContent(extractDailyKosStoryFallbackHtml(before)),
          fixtureUrl,
        );

        if (
          hasDailyKosStoryImage(fallbackContent) ||
          hasReadableArticleBody(fallbackContent) ||
          !cleaned.trim()
        ) {
          cleaned = fallbackContent;
        }
      }

      expect(cleaned.length).toBeGreaterThan(0);
      expect(cleaned).toBe(expectedAfter);
      expect(cleaned).not.toContain("<p></p>");
      expect(cleaned).not.toMatch(/>\s*\n\s*\n\s*</);
    }
  });

  test("getHostname normalizes valid hostnames and handles invalid urls", () => {
    expect(
      getHostname(
        SPECIAL_CASE_STORY_URL.replace("https://www.", "https://WWW."),
      ),
    ).toBe(SPECIAL_CASE_HOSTNAME);
    expect(getHostname("not a url")).toBe("");
  });

  test("stripKnownDailyKosBoilerplate removes known footer sections", () => {
    const input = `
      <section>© Kos Media Footer</section>
      <p>${SPECIAL_CASE_BRAND}</p><ul><li><a href="https://publisher.example/">Front Page</a></li></ul>
      <p>About</p><ul><li><a href="https://publisher.example/privacy">Privacy</a></li></ul>
      <p><strong>Related | <a href="https://publisher.example/stories/x">Thing</a></strong></p>
      <p>Real content remains</p>
    `;

    const stripped = stripKnownDailyKosBoilerplate(input);
    expect(stripped).toContain("Real content remains");
    expect(stripped.toLowerCase()).not.toContain("front page");
    expect(stripped.toLowerCase()).not.toContain("related |");
    expect(stripped.toLowerCase()).not.toContain("© kos media");
  });

  test("isLikelyDailyKosFooterBoilerplate detects dense footer markers", () => {
    const footer = `
      <p>Front Page Comics Subscribe Gift subscriptions Privacy Masthead Rules of the Road</p>
      <ul>
        <li><a href="#">a</a></li><li><a href="#">b</a></li><li><a href="#">c</a></li>
        <li><a href="#">d</a></li><li><a href="#">e</a></li><li><a href="#">f</a></li>
      </ul>
    `;

    expect(isLikelyDailyKosFooterBoilerplate(footer)).toBe(true);
    expect(isLikelyDailyKosFooterBoilerplate("<p>Normal story body</p>")).toBe(
      false,
    );
  });

  test("hasDailyKosStoryImage identifies expected CDN image host", () => {
    expect(
      hasDailyKosStoryImage(
        `<img src="https://${SPECIAL_CASE_MEDIA_HOST}/images/abc/story.jpg" />`,
      ),
    ).toBe(true);
    expect(
      hasDailyKosStoryImage(
        '<img src="https://example.com/images/story.jpg" />',
      ),
    ).toBe(false);
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
    const fromAuth = await POST({} as any, {
      requireMutableAuthenticatedUserFn: async () => authResponse,
    });
    expect(fromAuth).toBe(authResponse);

    const parseResponse = new Response("bad payload", { status: 400 });
    const fromParse = await POST({} as any, {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => parseResponse,
    });
    expect(fromParse).toBe(parseResponse);
  });

  test("POST can replace content with DailyKos fallback story image", async () => {
    const response = await POST({} as any, {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => SPECIAL_CASE_STORY_URL,
      fetchHtmlFn: async () => "<html />",
      extractFromHtmlFn: async () => ({
        title: "Title",
        source: "Source",
        content: "primary-content",
      }),
      sanitizeExtractedContentFn: (content) => content,
      cleanExtractedArticleHtmlFn: (content) => content,
      getHostnameFn: () => "www.dailykos.com",
      hasDailyKosStoryImageFn: (content) => content.includes("fallback-image"),
      extractDailyKosStoryFallbackHtmlFn: () => "fallback-image",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content).toBe("fallback-image");
    expect(body.title).toBe("Title");
    expect(body.source).toBe("Source");
  });

  test("POST replaces image-only special-case content with readable fallback", async () => {
    const shortCaptionOnly = `<img src="https://${SPECIAL_CASE_MEDIA_HOST}/images/example/story.jpg" /><p>Short caption.</p>`;
    const readableFallbackText =
      "<p>This fallback contains a full article paragraph with meaningful substance for readers.</p>" +
      "<p>It includes additional context so the extracted result is not just an image and a caption.</p>";

    const response = await POST({} as any, {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => SPECIAL_CASE_STORY_URL,
      fetchHtmlFn: async () => "<html />",
      extractFromHtmlFn: async () => ({
        title: "Title",
        source: "Source",
        content: shortCaptionOnly,
      }),
      sanitizeExtractedContentFn: (content) => content,
      cleanExtractedArticleHtmlFn: (content) => content,
      extractDailyKosStoryFallbackHtmlFn: () => readableFallbackText,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content).toBe(readableFallbackText);
    expect(body.content).toContain("full article paragraph");
  });

  test("POST maps axios and generic failures to expected error handlers", async () => {
    const jsonErrorFn = mock((message: string, status: number) =>
      Response.json({ error: message }, { status }),
    );
    const warnFn = mock(() => {});

    const axiosError = { response: { status: 429 } };
    const axiosResult = await POST({} as any, {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      fetchHtmlFn: async () => {
        throw axiosError;
      },
      isAxiosErrorFn: (() => true) as any,
      toErrorMessageFn: () => "upstream-throttled",
      jsonErrorFn: jsonErrorFn as any,
      warnFn: warnFn as any,
    });

    expect(axiosResult.status).toBe(429);
    expect(jsonErrorFn).toHaveBeenCalledWith("Upstream request failed", 429);

    const logAndRespondErrorFn = mock(
      (
        _message: string,
        _error: unknown,
        options?: { status?: number; publicMessage?: string },
      ) =>
        Response.json(
          { error: options?.publicMessage ?? "unknown" },
          { status: options?.status ?? 500 },
        ),
    );

    const genericResult = await POST({} as any, {
      requireMutableAuthenticatedUserFn: async () => ({ userId: 1 }) as any,
      parseAndValidateArticleUrlFn: async () => "https://example.com/article",
      fetchHtmlFn: async () => {
        throw new Error("boom");
      },
      isAxiosErrorFn: (() => false) as any,
      toErrorMessageFn: () => "normalized-boom",
      logAndRespondErrorFn: logAndRespondErrorFn as any,
      warnFn: warnFn as any,
    });

    expect(genericResult.status).toBe(502);
    expect(logAndRespondErrorFn).toHaveBeenCalledTimes(1);
    expect(logAndRespondErrorFn).toHaveBeenCalledWith(
      "Article extract error",
      expect.any(Error),
      expect.objectContaining({
        status: 502,
        publicMessage: "Failed to extract article content",
      }),
    );
  });
});
