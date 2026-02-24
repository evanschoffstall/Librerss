import {
  cleanExtractedArticleHtml,
  extractDailyKosStoryFallbackHtml,
  getHostname,
  hasDailyKosStoryImage,
  isLikelyDailyKosFooterBoilerplate,
  sanitizeExtractedContent,
  stripKnownDailyKosBoilerplate,
  toParagraphHtml,
} from "@/app/api/articles/extract/route";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

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
});
