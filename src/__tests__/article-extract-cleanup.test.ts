import {
  cleanExtractedArticleHtml,
  extractDailyKosStoryFallbackHtml,
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
});
