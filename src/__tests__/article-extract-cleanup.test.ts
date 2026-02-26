import {
  POST,
  cleanExtractedArticleHtml,
  extractDailyKosStoryFallbackHtml,
  fetchHtml,
  getHostname,
  hasReadableArticleBody,
  hasDailyKosStoryImage,
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

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("article extract cleanup", () => {
  test("removes Daily Kos footer boilerplate and preserves article body", () => {
    const input = `
      <p>Real article paragraph one.</p>
      <p>Real article paragraph two.</p>
      <p>Daily Kos</p>
      <ul>
        <li><a href="https://www.dailykos.com/">Front Page</a></li>
        <li><a href="https://comics.dailykos.com/">Comics</a></li>
        <li><a href="https://www.dailykos.com/subscribe">Subscribe</a></li>
      </ul>
      <p>About</p>
      <ul>
        <li><a href="https://www.dailykos.com/privacy">Privacy</a></li>
        <li><a href="https://www.dailykos.com/masthead">Masthead</a></li>
      </ul>
    `;

    const cleaned = cleanExtractedArticleHtml(
      input,
      "https://www.dailykos.com/stories/2026/2/24/example",
    );

    expect(cleaned).toContain("Real article paragraph one");
    expect(cleaned).toContain("Real article paragraph two");
    expect(cleaned.toLowerCase()).not.toContain("front page");
    expect(cleaned.toLowerCase()).not.toContain("masthead");
    expect(cleaned.toLowerCase()).not.toContain("<p>about</p>");
  });

  test("drops footer-only Daily Kos extraction output", () => {
    const footerOnly = `
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

    const cleaned = cleanExtractedArticleHtml(
      footerOnly,
      "https://www.dailykos.com/stories/2026/2/24/example",
    );

    expect(cleaned).toBe("");
  });

  test("does not apply Daily Kos cleanup to other domains", () => {
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
          <img src="https://cdn.prod.dailykos.com/images/1528012/story_image/20260217edcbc-a.jpg?1771360334" alt="Cartoon" />
          <figcaption></figcaption>
        </figure>
      </div>
      <div class="story__text">
        <p>A cartoon by Mike Luckovich.</p>
        <hr>
        <p><strong>Related | <a href="https://www.dailykos.com/stories/2026/2/6/2367483">Example related</a></strong></p>
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

  test("normalizeExtractedHtmlSpacing removes empty paragraphs and inter-tag blank lines", () => {
    const cleaned = normalizeExtractedHtmlSpacing(
      "<p></p>\n\n<p>One</p>\n\n<p>Two</p>",
    );

    expect(cleaned).toBe("<p>One</p>\n<p>Two</p>");
  });

  test("downloaded html matches extraction pipeline snapshots", async () => {
    const fixtures = [
      {
        name: "article-1",
        url: "https://www.abc27.com/news/massive-fire-breaks-out-at-york-county-salvage-yard/",
      },
      {
        name: "article-2",
        url: "https://www.motherjones.com/politics/2026/02/epstein-files-oval-office-trump-white-house/",
      },
      {
        name: "article-3",
        url: "https://www.dailykos.com/stories/2026/2/25/2370437/-Mamdani-and-AOC-prove-who-s-really-the-party-of-family-values?pm_campaign=blog&pm_medium=rss&pm_source=main",
      },
      {
        name: "article-4",
        url: "https://news.sky.com/story/we-decided-to-stand-up-to-a-bully-says-ukrainian-who-swapped-wall-street-for-the-frontline-13511695",
      },
    ] as const;

    for (const fixture of fixtures) {
      const before = readFileSync(
        join(
          process.cwd(),
          `src/__tests__/snapshots/expect-extraction/${fixture.name}.html`,
        ),
        "utf8",
      );
      const expectedAfter = readFileSync(
        join(
          process.cwd(),
          `src/__tests__/snapshots/expect-extraction/article-expect-${fixture.name.split("-")[1]}.html`,
        ),
        "utf8",
      ).trim();

      expect(expectedAfter.length).toBeGreaterThan(0);

      const extracted = await extractFromHtml(before, fixture.url, {
        contentLengthThreshold: 120,
      });
      const rawContent =
        extracted?.content?.trim() || extracted?.description?.trim() || "";
      const normalized = sanitizeExtractedContent(rawContent);
      let cleaned = cleanExtractedArticleHtml(normalized, fixture.url);

      if (
        getHostname(fixture.url).endsWith("dailykos.com") &&
        (!hasDailyKosStoryImage(cleaned) || !hasReadableArticleBody(cleaned))
      ) {
        const fallbackContent = cleanExtractedArticleHtml(
          sanitizeExtractedContent(extractDailyKosStoryFallbackHtml(before)),
          fixture.url,
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
    expect(getHostname("https://WWW.DailyKos.com/story")).toBe(
      "www.dailykos.com",
    );
    expect(getHostname("not a url")).toBe("");
  });

  test("stripKnownDailyKosBoilerplate removes known footer sections", () => {
    const input = `
      <section>© Kos Media Footer</section>
      <p>Daily Kos</p><ul><li><a href="https://www.dailykos.com/">Front Page</a></li></ul>
      <p>About</p><ul><li><a href="https://www.dailykos.com/privacy">Privacy</a></li></ul>
      <p><strong>Related | <a href="https://www.dailykos.com/stories/x">Thing</a></strong></p>
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
        '<img src="https://cdn.prod.dailykos.com/images/abc/story.jpg" />',
      ),
    ).toBe(true);
    expect(
      hasDailyKosStoryImage(
        '<img src="https://example.com/images/story.jpg" />',
      ),
    ).toBe(false);
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
      parseAndValidateArticleUrlFn: async () =>
        "https://www.dailykos.com/story",
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
