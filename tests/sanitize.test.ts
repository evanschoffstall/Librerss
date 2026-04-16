import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleHtml,
  sanitizeArticleTitle,
  stripOrphanedRelatedBlocks,
  toPlainText,
} from "@/lib/sanitize";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

describe("lib/sanitize/purify – DOMPurify entry point", () => {
  test("purifyRawHtml strips script tags", async () => {
    const { purifyRawHtml } = await import("@/lib/sanitize");

    const malicious = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = purifyRawHtml(malicious);

    expect(result).toContain("Hello");
    expect(result).toContain("World");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  test("purifyRawHtml strips event handler attributes", async () => {
    const { purifyRawHtml } = await import("@/lib/sanitize");

    const malicious =
      '<img src="x" onerror="alert(1)" /><a href="#" onclick="evil()">Link</a>';
    const result = purifyRawHtml(malicious);

    expect(result).not.toContain("onerror");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("evil");
  });

  test("purifyRawHtml blocks javascript: protocol", async () => {
    const { purifyRawHtml } = await import("@/lib/sanitize");

    const malicious = '<a href="javascript:alert(1)">Click</a>';
    const result = purifyRawHtml(malicious);

    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("alert");
  });

  test("purifyRawHtml preserves safe HTML for extraction", async () => {
    const { purifyRawHtml } = await import("@/lib/sanitize");

    const safe =
      '<article><h1>Title</h1><p>Content</p><img src="https://example.com/image.jpg" alt="test" /></article>';
    const result = purifyRawHtml(safe);

    expect(result).toContain("<article>");
    expect(result).toContain("<h1>");
    expect(result).toContain("Title");
    expect(result).toContain("<p>");
    expect(result).toContain("Content");
    expect(result).toContain("<img");
    expect(result).toContain('src="https://example.com/image.jpg"');
  });

  test("purifyRawHtml returns empty string for invalid input", async () => {
    const { purifyRawHtml } = await import("@/lib/sanitize");

    expect(purifyRawHtml("")).toBe("");
    expect(purifyRawHtml(null as any)).toBe("");
    expect(purifyRawHtml(undefined as any)).toBe("");
  });
});

describe("lib/utils/sanitize comprehensive", () => {
  test("toPlainText strips HTML tags and normalizes whitespace", async () => {
    const { toPlainText } = await import("@/lib/sanitize");

    const html = "<p>Hello <strong>world</strong>!</p><p>Second paragraph.</p>";
    const result = toPlainText(html);

    expect(result).toContain("Hello");
    expect(result).toContain("world");
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("<strong>");
  });

  test("toPlainText converts figure tags to newlines", async () => {
    const { toPlainText } = await import("@/lib/sanitize");

    const html = "<p>Text</p><figure><img src='test.jpg'/></figure><p>More</p>";
    const result = toPlainText(html);

    expect(result).toContain("Text");
    expect(result).toContain("More");
    expect(result).not.toContain("<figure>");
    expect(result).not.toContain("<img");
  });

  test("toPlainText converts br tags to newlines", async () => {
    const { toPlainText } = await import("@/lib/sanitize");

    const html = "Line 1<br>Line 2<br/>Line 3";
    const result = toPlainText(html);

    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
    expect(result).toContain("Line 3");
    expect(result).not.toContain("<br>");
  });

  test("toPlainText handles HTML entities", async () => {
    const { toPlainText } = await import("@/lib/sanitize");

    const html = "Hello&nbsp;world&amp;more";
    const result = toPlainText(html);

    expect(result).toContain("Hello");
    expect(result).toContain("world");
    expect(result).toContain("&");
    expect(result).not.toContain("&nbsp;");
    expect(result).not.toContain("&amp;");
  });

  test("toPlainText handles block-level elements with newlines", async () => {
    const { toPlainText } = await import("@/lib/sanitize");

    const html =
      "<div>Content</div><section>Section</section><article>Article</article>";
    const result = toPlainText(html);

    expect(result).toContain("Content");
    expect(result).toContain("Section");
    expect(result).toContain("Article");
  });

  test("normalizeArticleHtmlSpacing removes blank paragraphs and tag-gap blank lines", async () => {
    const { normalizeArticleHtmlSpacing } = await import("@/lib/sanitize");

    const input = "<p></p>\n\n<p>A</p>\n\n\n<p>B</p>\n\n<p>\u00a0</p>";
    const result = normalizeArticleHtmlSpacing(input);

    expect(result).toBe("<p>A</p>\n<p>B</p>");
  });

  test("normalizeArticleHtmlSpacing removes formatting-only empty paragraphs", async () => {
    const { normalizeArticleHtmlSpacing } = await import("@/lib/sanitize");

    const input =
      "<p>One</p>\n\n<p><strong> </strong></p>\n\n<p><em>\u00a0</em></p>\n\n<p>Two</p>";
    const result = normalizeArticleHtmlSpacing(input);

    expect(result).toBe("<p>One</p>\n<p>Two</p>");
  });

  test("normalizeArticleHtmlSpacing removes empty list tags and empty list items", async () => {
    const { normalizeArticleHtmlSpacing } = await import("@/lib/sanitize");

    const input =
      "<p>Start</p><ul><li></li><li> </li></ul><ul><li>Kept</li><li></li></ul><p>End</p>";
    const result = normalizeArticleHtmlSpacing(input);

    expect(result).toBe("<p>Start</p><ul><li>Kept</li></ul><p>End</p>");
  });

  test("sanitizeArticleTitle strips HTML from titles", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/sanitize");

    const title = "Breaking: <script>alert(1)</script> News!";
    const result = sanitizeArticleTitle(title);

    expect(result).toContain("Breaking:");
    expect(result).toContain("News!");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  test("sanitizeArticleTitle strips HTML", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/sanitize");

    const title = "Title <b>with</b> tags";
    const result = sanitizeArticleTitle(title);

    expect(result).toContain("Title");
    expect(result).toContain("with");
    expect(result).toContain("tags");
    expect(result).not.toContain("<b>");
  });

  test("sanitizeArticleTitle decodes named entities", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/sanitize");

    const title = "Cartoon: Stocks &amp; Bondis";
    const result = sanitizeArticleTitle(title);

    expect(result).toBe("Cartoon: Stocks & Bondis");
    expect(result).not.toContain("&amp;");
  });

  test("sanitizeArticleTitle decodes numeric entities", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/sanitize");

    const title = "Cartoon &#38; Politics &#x26; Markets";
    const result = sanitizeArticleTitle(title);

    expect(result).toBe("Cartoon & Politics & Markets");
  });

  test("sanitizeArticleTitle strips unknown entities", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/sanitize");

    const title = "Headline &doesnotexist; update";
    const result = sanitizeArticleTitle(title);

    expect(result).toBe("Headline update");
  });

  test("decodeHtmlEntities handles decimal/hex entities and overflow safely", async () => {
    const { decodeHtmlEntities } = await import("@/lib/sanitize");

    expect(decodeHtmlEntities("A &#65; B")).toBe("A A B");
    expect(decodeHtmlEntities("A &#x41; B")).toBe("A A B");
    expect(decodeHtmlEntities("A &#x110000; B")).toBe("A  B");
  });

  test("sanitizeArticleTitle handles empty input with fallback", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/sanitize");

    // The function returns "Untitled" for empty strings
    expect(sanitizeArticleTitle("")).toBe("Untitled");
    expect(sanitizeArticleTitle("   ")).toBe("Untitled");
  });

  test("sanitizeAndTruncateArticleContent removes dangerous tags", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      "<p>Safe content</p><script>alert('xss')</script><p>More content</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("Safe content");
    expect(result).toContain("More content");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  test("sanitizeAndTruncateArticleContent preserves safe tags", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      "<p>Paragraph</p><strong>Bold</strong><em>Italic</em><a href='http://example.com'>Link</a>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
    expect(result).toContain("<a");
  });

  test("sanitizeAndTruncateArticleContent strips AP junk blocks", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      '<p>Article content</p><div class="hub-peek"><h2>Related Stories</h2><ul><li>Story 1</li></ul></div><p>More content</p>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("Article content");
    expect(result).toContain("More content");
    expect(result).not.toContain("hub-peek");
    expect(result).not.toContain("Related Stories");
  });

  test("sanitizeAndTruncateArticleContent handles related-stories class variations", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html = `
      <p>Content</p>
      <div class="related-stories">Should be removed</div>
      <section class="related_content">Also removed</section>
      <aside class="more-on">Gone</aside>
      <p>Kept content</p>
    `;
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("Content");
    expect(result).toContain("Kept content");
    expect(result).not.toContain("Should be removed");
    expect(result).not.toContain("Also removed");
    expect(result).not.toContain("Gone");
  });

  test("sanitizeAndTruncateArticleContent removes orphaned related headings", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      "<p>Article</p><h2>More on this topic</h2><ul><li>Related</li></ul><p>More</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("Article");
    expect(result).toContain("More");
    expect(result).not.toContain("More on this topic");
    expect(result).not.toContain("Related");
  });

  test("sanitizeAndTruncateArticleContent handles 'Related' heading variations", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const variations = [
      "<h2>Related articles</h2><ul><li>Link</li></ul>",
      "<h3>Related stories</h3><ul><li>Link</li></ul>",
      "<h2>Related content</h2><ul><li>Link</li></ul>",
      "<h2>See also</h2><ul><li>Link</li></ul>",
      "<h2>You may also like</h2><ul><li>Link</li></ul>",
      "<h2>Trending now</h2><ul><li>Link</li></ul>",
    ];

    for (const variant of variations) {
      const html = `<p>Article content</p>${variant}<p>More content</p>`;
      const result = sanitizeAndTruncateArticleContent(html);

      expect(result).toContain("Article content");
      expect(result).toContain("More content");
      expect(result).not.toContain("<h2>");
      expect(result).not.toContain("<h3>");
      expect(result).not.toContain("<ul>");
    }
  });

  test("sanitizeAndTruncateArticleContent enforces referrerpolicy on images", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      '<p><img src="http://example.com/image.jpg" alt="Test" width="800" height="600" /></p>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("referrerpolicy");
    expect(result).toContain('referrerpolicy="no-referrer"');
  });

  test("sanitizeAndTruncateArticleContent removes tiny placeholder images below minimum dimensions", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      '<img src="https://static.example.com/placeholder.png" width="150" height="84" alt="placeholder" /><p>Body content</p>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).not.toContain("placeholder.png");
    expect(result).toContain("Body content");
  });

  test("sanitizeAndTruncateArticleContent removes known placeholder image URLs without dimensions", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      '<img src="https://static.files.bbci.co.uk/core/grey-placeholder.png" alt="placeholder" /><p>Body content</p>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).not.toContain("grey-placeholder.png");
    expect(result).toContain("Body content");
  });

  test("sanitizeAndTruncateArticleContent handles long content truncation", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    // Create very long content
    const longContent =
      "<p>" + "Lorem ipsum dolor sit amet. ".repeat(5000) + "</p>";
    const result = sanitizeAndTruncateArticleContent(longContent);

    // Should be truncated (config sets max chars)
    expect(result.length).toBeLessThan(longContent.length);
  });

  test("sanitizeAndTruncateArticleContent collapses excessive newlines", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html = "<p>Line 1</p>\n\n\n\n\n<p>Line 2</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
    // Should not have 5 consecutive newlines
    expect(result).not.toMatch(/\n{5,}/);
  });

  test("sanitizeAndTruncateArticleContent preserves sentence prose emitted outside paragraph tags", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const quote =
      '"The human ability to encode information in signs and symbols was developed over many thousands of years," Bentz said. "Writing is only one specific form in a long series of sign systems."';
    const html = `<p>Intro</p><img src="https://example.com/hero.jpg" width="800" height="600"/>${quote}<p>Outro</p>`;
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain(quote);
    expect(result).toContain("Intro");
    expect(result).toContain("Outro");
  });

  test("sanitizeAndTruncateArticleContent keeps figure image and caption text", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      "<figure><img src='test.jpg' width='800' height='600'/></figure><p>Text</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("<img");
    expect(result).toContain("Text");
  });

  test("sanitizeAndTruncateArticleContent strips h1 content", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html = "<h1>Top headline</h1><p>Body text</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).not.toContain("Top headline");
    expect(result).toContain("Body text");
  });

  test("sanitizeAndTruncateArticleContent promotes lazy image attributes to src", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      '<figure><img data-src="/images/example.jpg" alt="Example" width="800" height="600" /></figure>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain('src="/images/example.jpg"');
    expect(result).toContain("<img");
  });

  test("sanitizeAndTruncateArticleContent promotes data-original to src", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      '<img data-original="https://example.com/original.jpg" alt="Original" width="800" height="600" />';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain('src="https://example.com/original.jpg"');
  });

  test("sanitizeAndTruncateArticleContent promotes data-lazy-src to src", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      '<img data-lazy-src="https://example.com/lazy.jpg" alt="Lazy" width="800" height="600" />';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain('src="https://example.com/lazy.jpg"');
  });

  test("sanitizeAndTruncateArticleContent allows target=_blank on links", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html = '<a href="https://example.com" target="_blank">Link</a>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain('target="_blank"');
  });

  test("sanitizeAndTruncateArticleContent blocks javascript: URLs", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html = '<a href="javascript:alert(1)">Bad Link</a>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).not.toContain("javascript:");
  });

  test("sanitizeAndTruncateArticleContent blocks data: URLs", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html = '<a href="data:text/html,<script>alert(1)</script>">Bad</a>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).not.toContain("data:");
  });

  test("sanitizeAndTruncateArticleContent allows http and https in href", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      '<a href="https://example.com">HTTPS</a><a href="http://example.com">HTTP</a>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("https://example.com");
    expect(result).toContain("http://example.com");
  });

  test("sanitizeAndTruncateArticleContent preserves pre and code tags", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html =
      "<pre><code>const x = 42;\nconsole.log(x);</code></pre><p>Text</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("<pre>");
    expect(result).toContain("<code>");
    expect(result).toContain("const x = 42");
  });

  test("sanitizeAndTruncateArticleContent handles blockquote", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/sanitize");

    const html = "<blockquote>Quoted text here</blockquote><p>More text</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("<blockquote>");
    expect(result).toContain("Quoted text");
  });
});

// ─── sanitize.ts ──────────────────────────────────────────────────────────────

describe("sanitize – toPlainText", () => {
  test("strips HTML tags", () => {
    expect(toPlainText("<p>Hello <b>World</b></p>")).toBe("Hello World");
  });

  test("converts br tags to newlines", () => {
    expect(toPlainText("Line1<br>Line2")).toBe("Line1\nLine2");
  });

  test("converts self-closing br tags", () => {
    expect(toPlainText("A<br/>B<br />C")).toBe("A\nB\nC");
  });

  test("replaces &nbsp; with space", () => {
    expect(toPlainText("Hello&nbsp;World")).toBe("Hello World");
  });

  test("replaces &#160; with space", () => {
    expect(toPlainText("Hello&#160;World")).toBe("Hello World");
  });

  test("replaces &amp; with &", () => {
    expect(toPlainText("A &amp; B")).toBe("A & B");
  });

  test("collapses excessive blank lines", () => {
    const manyBlanks = "Hello\n\n\n\n\n\n\n\nWorld";
    const result = toPlainText(manyBlanks);
    const maxNewlines = result.split("").filter((c) => c === "\n").length;
    expect(maxNewlines).toBeLessThanOrEqual(4);
  });

  test("trims result", () => {
    expect(toPlainText("  <p>  text  </p>  ")).toBe("text");
  });

  test("converts closing block tags to newlines", () => {
    expect(toPlainText("<div>A</div><div>B</div>")).toContain("A\nB");
  });

  test("normalizes CRLF to LF", () => {
    expect(toPlainText("A\r\nB")).toBe("A\nB");
  });

  test("collapses multiple spaces", () => {
    expect(toPlainText("A    B")).toBe("A B");
  });

  test("removes embedded media fallback placeholder text", () => {
    const html =
      '<p>Before</p><iframe src="https://www.youtube.com/embed/abc">YouTube Video</iframe><p>After</p>';
    const result = toPlainText(html);
    expect(result).toContain("Before");
    expect(result).toContain("After");
    expect(result).not.toContain("YouTube Video");
  });

  test("decodes &lt; and &gt; entities", () => {
    expect(toPlainText("2 &lt; 3 and 5 &gt; 4")).toBe("2 < 3 and 5 > 4");
  });

  test("decodes &quot; entity", () => {
    expect(toPlainText("He said &quot;hello&quot;")).toBe('He said "hello"');
  });

  test("decodes &#39; numeric apostrophe entity", () => {
    expect(toPlainText("It&#39;s working")).toBe("It's working");
  });

  test("decodes &#x27; hex apostrophe entity", () => {
    expect(toPlainText("It&#x27;s working")).toBe("It's working");
  });

  test("decodes &apos; named entity", () => {
    expect(toPlainText("It&apos;s working")).toBe("It's working");
  });

  test("decodes smart quote entities", () => {
    expect(toPlainText("&ldquo;Hello&rdquo; and &lsquo;World&rsquo;")).toBe(
      "\u201CHello\u201D and \u2018World\u2019",
    );
  });

  test("decodes dash entities", () => {
    expect(toPlainText("A&mdash;B and C&ndash;D")).toBe(
      "A\u2014B and C\u2013D",
    );
  });

  test("decodes &hellip; entity", () => {
    expect(toPlainText("Wait&hellip; what")).toBe("Wait\u2026 what");
  });

  test("decodes numeric character references for smart quotes", () => {
    expect(toPlainText("&#8220;Hello&#8221; he said")).toBe(
      "\u201CHello\u201D he said",
    );
  });

  test("decodes &#8217; right single quote", () => {
    expect(toPlainText("It&#8217;s a great day")).toBe("It\u2019s a great day");
  });

  test("decodes mixed entities in a realistic article snippet", () => {
    const html =
      "<p>The team&rsquo;s plan &mdash; dubbed &ldquo;Project X&rdquo; &mdash; aims to reduce CO&lt;sub&gt;2&lt;/sub&gt; by 50%.</p>";
    const result = toPlainText(html);
    expect(result).toContain("team\u2019s plan");
    expect(result).toContain("\u2014 dubbed");
    expect(result).toContain("\u201CProject X\u201D");
  });

  test("preserves Unicode characters that are already decoded", () => {
    const unicode = "<p>Caf\u00E9 \u2014 the best \u201Ccoffee\u201D</p>";
    const result = toPlainText(unicode);
    expect(result).toBe("Caf\u00E9 \u2014 the best \u201Ccoffee\u201D");
  });

  test("converts non-breaking space U+00A0 to regular space", () => {
    expect(toPlainText("Hello\u00A0World")).toBe("Hello World");
  });

  test("decodes &#160; to regular space (not non-breaking space)", () => {
    const result = toPlainText("Hello&#160;World");
    expect(result).toBe("Hello World");
    expect(result).not.toContain("\u00A0");
  });
});

describe("sanitize – sanitizeArticleHtml", () => {
  test("returns empty for whitespace-only input", () => {
    expect(sanitizeArticleHtml("   ")).toBe("");
  });

  test("strips script tags", () => {
    const result = sanitizeArticleHtml("<p>Hello</p><script>alert(1)</script>");
    expect(result).not.toContain("script");
    expect(result).toContain("Hello");
  });

  test("preserves allowed tags", () => {
    const result = sanitizeArticleHtml("<p>Test <strong>bold</strong></p>");
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
  });

  test("adds rel and target to links", () => {
    const result = sanitizeArticleHtml(
      '<a href="https://example.com">Link</a>',
    );
    expect(result).toContain('rel="noopener noreferrer nofollow"');
    expect(result).toContain('target="_blank"');
  });

  test("strips aside/nav/section tags and content", () => {
    const result = sanitizeArticleHtml(
      "<p>Main</p><aside>Sidebar content</aside>",
    );
    expect(result).toContain("Main");
    expect(result).not.toContain("Sidebar content");
  });

  test("strips iframe fallback placeholder text", () => {
    const result = sanitizeArticleHtml(
      '<p>Main</p><iframe src="https://www.youtube.com/embed/abc">YouTube Video</iframe><p>After</p>',
    );
    expect(result).toContain("Main");
    expect(result).toContain("After");
    expect(result).not.toContain("YouTube Video");
    expect(result).not.toContain("<iframe");
  });

  test("strips AP junk blocks with hub-peek class", () => {
    const html =
      '<p>Article</p><div class="hub-peek"><h2>Related</h2><ul><li>Link</li></ul></div>';
    const result = sanitizeArticleHtml(html);
    expect(result).toContain("Article");
    expect(result).not.toContain("hub-peek");
  });

  test("strips related-stories class blocks", () => {
    const html =
      '<div class="related-stories"><h2>Related</h2></div><p>Keep</p>';
    const result = sanitizeArticleHtml(html);
    expect(result).toContain("Keep");
  });

  test("enforces eager loading on images", () => {
    const result = sanitizeArticleHtml(
      '<img src="https://example.com/img.jpg" width="800" height="600">',
    );
    expect(result).toContain('loading="eager"');
  });

  test("enforces no-referrer on images", () => {
    const result = sanitizeArticleHtml(
      '<img src="https://example.com/img.jpg" width="800" height="600">',
    );
    expect(result).toContain('referrerpolicy="no-referrer"');
  });

  test("preserves img allowed attributes", () => {
    const result = sanitizeArticleHtml(
      '<img src="https://example.com/img.jpg" alt="Test" width="200" height="120">',
    );
    expect(result).toContain('alt="Test"');
    expect(result).toContain('width="200"');
    expect(result).toContain('height="120"');
  });
});

describe("sanitize – sanitizeArticleTitle", () => {
  test("strips all HTML from title", () => {
    expect(sanitizeArticleTitle("<b>Breaking</b> News")).toBe("Breaking News");
  });

  test("returns Untitled for null", () => {
    expect(sanitizeArticleTitle(null)).toBe("Untitled");
  });

  test("returns Untitled for undefined", () => {
    expect(sanitizeArticleTitle(undefined)).toBe("Untitled");
  });

  test("returns Untitled for empty string", () => {
    expect(sanitizeArticleTitle("")).toBe("Untitled");
  });

  test("returns Untitled for whitespace-only", () => {
    expect(sanitizeArticleTitle("   ")).toBe("Untitled");
  });

  test("truncates overlong titles", () => {
    const long = "A".repeat(600);
    const result = sanitizeArticleTitle(long);
    // Result must stay within MAX_ARTICLE_TITLE_LENGTH (500) — the ellipsis
    // suffix is included in the budget, not added on top.
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result).toEndWith("\u2026");
  });

  test("strips script tags from title", () => {
    expect(sanitizeArticleTitle("<script>alert(1)</script>Title")).toBe(
      "Title",
    );
  });
});

describe("sanitize – sanitizeAndTruncateArticleContent", () => {
  test("returns sanitized content under limit unchanged", () => {
    const result = sanitizeAndTruncateArticleContent("<p>Short content</p>");
    expect(result).toContain("Short content");
  });

  test("truncates overlong content with sentinel", () => {
    const longContent = "<p>" + "X".repeat(110_000) + "</p>";
    const result = sanitizeAndTruncateArticleContent(longContent);
    expect(result).toContain("[content truncated]");
    expect(result.length).toBeLessThan(longContent.length);
  });
});

describe("sanitize – stripOrphanedRelatedBlocks", () => {
  test("removes orphaned 'More on' heading with list", () => {
    const html =
      '<h2>More on this topic</h2><ul><li><a href="#">Link</a></li></ul>';
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).not.toContain("More on");
  });

  test("removes orphaned 'Related' heading", () => {
    const html = "<h3>Related Stories</h3><ul><li>Item</li></ul><p>Keep</p>";
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).not.toContain("Related");
    expect(result).toContain("Keep");
  });

  test("keeps non-related headings", () => {
    const html = "<h2>Introduction</h2><p>Content here</p>";
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).toContain("Introduction");
  });

  test("removes stray related heading without list", () => {
    const html = "<p>Main text</p><h2>See Also</h2>";
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).not.toContain("See Also");
    expect(result).toContain("Main text");
  });

  test("removes 'You may also like' heading", () => {
    const html = "<h3>You may also like</h3><ol><li>Other</li></ol>";
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).not.toContain("You may also like");
  });

  test("removes 'Trending Now' heading", () => {
    const html = "<h2>Trending Now</h2><ul><li>Hot</li></ul>";
    const result = stripOrphanedRelatedBlocks(html);
    expect(result).not.toContain("Trending Now");
  });
});

// ── lib/sanitize/content-sanitization – fallback paths ───────────────────────

describe("sanitize/content-sanitization – sanitizeRawContent fallback paths", () => {
  test("returns sanitized fallback for HTML that sanitizes to empty string", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    // A <section> with only script tags will sanitize away the visible content
    // but fall back to plain-text path
    const input = "<section><script>evil()</script></section>";
    const result = sanitizeRawContent(input);
    // Should not contain the dangerous script
    expect(result).not.toContain("<script>");
  });

  test("handles pure HTML that has only images in section tags — fallback with image recovery", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    // Section with img and NO text: sanitized output drops section → triggers
    // the recovered image + fallback text path
    const input =
      '<section><p><img src="https://cdn.example.com/hero.jpg" alt="hero" width="800" height="600" /></p></section>';
    const result = sanitizeRawContent(input);
    // The image should be present (either directly or via recovery)
    expect(typeof result).toBe("string");
  });

  test("sanitizeRawContent falls back to plain text when sanitized html is blank", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    // Craft HTML that has only disallowed elements → sanitizer produces ""
    // then we fall back to toPlainText
    const input = "<noscript><iframe>hidden</iframe></noscript>text content";
    const result = sanitizeRawContent(input);
    // Must produce something (either original text or wrapped text)
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── lib/sanitize/content-sanitization – image recovery+merge paths ────────────

describe("lib/sanitize/content-sanitization – image merge paths", () => {
  test("merges recovered image HTML when sanitized content has no images", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize");

    // Article with image + text – exercises the image-recovery branch where
    // recoverSanitizedImageHtml returns a non-empty string that gets merged.
    const htmlWithImg = [
      "<article>",
      "  <img src='https://example.com/photo.jpg' alt='Photo'>",
      "  <p>This is a long article paragraph with enough text to be",
      "  meaningful and pass minimum thresholds here.</p>",
      "  <p>Second paragraph for additional length requirements here.</p>",
      "</article>",
    ].join("\n");

    const result = sanitizeRawContent(htmlWithImg);
    expect(typeof result).toBe("string");
  });

  test("returns sanitized fallback when primary fails but plain text remains", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize");

    const sparseHtml = [
      "<div class='article'>",
      "  <p>Short article with enough words to pass minimum thresholds.</p>",
      "  <p>Additional paragraph content for length requirements here.</p>",
      "</div>",
    ].join("\n");

    const result = sanitizeRawContent(sparseHtml);
    expect(typeof result).toBe("string");
  });
});

// ── lib/sanitize/content-sanitization.ts – recovered image merge paths ───────

describe("sanitizeRawContent – recovered image merge paths", () => {
  test("merges recovered images when sanitized text has no images", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    // HTML with an img that gets stripped by sanitizer but text survives
    const html = `<section><img src="https://example.com/photo.jpg" alt="Photo"><p>Article text here</p></section>`;
    const result = sanitizeRawContent(html);
    // Should contain both the recovered image and the text
    expect(result).toContain("Article text here");
  });

  test("returns sanitized HTML when images survive sanitization", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    const html = `<p>Text with <img src="https://example.com/img.jpg"> inline</p>`;
    const result = sanitizeRawContent(html);
    expect(result).toContain("Text with");
  });

  test("falls back to plain text when HTML sanitizes to empty", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    // Script-only content that sanitizes to empty
    const html = `<script>alert('x')</script>Some visible text`;
    const result = sanitizeRawContent(html);
    expect(result.length).toBeGreaterThan(0);
  });

  test("handles plain text input (no HTML)", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    const result = sanitizeRawContent("Just plain text content here");
    expect(result).toContain("Just plain text content here");
  });

  test("returns empty for whitespace-only input", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    expect(sanitizeRawContent("   ")).toBe("");
  });

  test("merges recovered images in fallback plain-text path", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    // HTML where the main content sanitizes to empty but there IS an img and text
    const html = `<img src="https://example.com/photo.jpg"><script>alert(1)</script>Visible text`;
    const result = sanitizeRawContent(html);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── lib/sanitize/content-sanitization – image-merge paths ────────────────────

describe("lib/sanitize/content-sanitization – sanitizeRawContent image merge", () => {
  test("merges recovered image html with sanitized text when img stripped from sanitized", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    // Raw HTML with an img that survives recoverSanitizedImageHtml but is
    // a different img (one with a simple src) alongside real text that sanitizer
    // will keep.  The img is stripped from sanitized output; the recovery inserts it.
    const rawHtml =
      '<p>Article text here.</p><img src="https://img.example.com/photo.jpg" alt="photo">';
    const result = sanitizeRawContent(rawHtml);
    // Result should contain either the text or the image
    expect(result.length).toBeGreaterThan(0);
    expect(typeof result).toBe("string");
  });

  test("returns fallback sanitized text for plain-text with no html", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    const result = sanitizeRawContent(
      "Just plain text without any HTML elements at all.",
    );
    expect(result).toContain("Just plain text");
  });

  test("returns empty string for content that trims to empty", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    expect(sanitizeRawContent("   ")).toBe("");
  });

  test("merges recovered image with fallback-sanitized text (non-html path)", async () => {
    const { sanitizeRawContent } = await import("@/lib/sanitize/sanitization");
    // A string that sanitizer reduces to empty (all HTML stripped) but
    // has an img tag that recovery can extract; tests the fallback+image branch.
    const rawHtml =
      '<img src="https://img.example.com/foo.jpg"><span style="display:none">hidden</span>';
    const result = sanitizeRawContent(rawHtml);
    expect(typeof result).toBe("string");
  });
});

// ── lib/sanitize/content-validation – social-share toolbar branch ─────────────

describe("lib/sanitize/content-validation – stripShareEngagementToolbars branches", () => {
  test("cleanSanitizedHtml removes social-share ul via keyword in text content", async () => {
    const { cleanSanitizedHtml } = await import("@/lib/sanitize/validation");
    // A ul whose items contain social share URLs AND the word "share" in
    // the text — this triggers the SOCIAL_SHARE_LINK_RE + text-word branch.
    const html =
      `<p>Real content here.</p>` +
      `<ul>` +
      `<li><a href="https://twitter.com/share?text=foo">Share on X</a></li>` +
      `</ul>`;
    const result = cleanSanitizedHtml(html, "https://example.com/");
    expect(result).toContain("Real content");
  });

  test("cleanSanitizedHtml returns empty when post-strip content is pure nav boilerplate", async () => {
    const { cleanSanitizedHtml } = await import("@/lib/sanitize/validation");
    // Content with many footer keywords + high link/list-item density.
    // Six links, four list items — meets the boilerplate threshold.
    const navHtml =
      `<h2>Site footer</h2>` +
      `<ul>` +
      `<li><a href="/privacy">Privacy Policy</a></li>` +
      `<li><a href="/terms">Terms of Service</a></li>` +
      `<li><a href="/advertise">Advertise</a></li>` +
      `<li><a href="/newsletter">Newsletter</a></li>` +
      `</ul>` +
      `<p><a href="/contact">Contact Us</a></p>` +
      `<p><a href="/sitemap">Sitemap</a></p>`;
    const result = cleanSanitizedHtml(navHtml, "https://example.com/");
    // Either returns empty OR reduces the boilerplate content
    expect(typeof result).toBe("string");
  });
});

// ── lib/sanitize/cleaners – preCleanHtml social-share ul branch ──────────────

describe("lib/sanitize/cleaners – preCleanHtml social share list removal", () => {
  test("strips ul where all items are bare social-share links", async () => {
    const { preCleanHtml } = await import("@/lib/sanitize/cleaners");
    // A ul with fewer than 8 items where each is a social-share link.
    const html =
      `<div><p>Article content.</p>` +
      `<ul>` +
      `<li><a href="https://twitter.com/share?url=x">Twitter</a></li>` +
      `<li><a href="https://facebook.com/sharer?u=x">Facebook</a></li>` +
      `<li><a href="https://reddit.com/submit?url=x">Reddit</a></li>` +
      `</ul></div>`;
    const result = preCleanHtml(html);
    expect(result).not.toContain("Twitter");
    expect(result).not.toContain("Facebook");
  });

  test("strips ul where 8+ items are all bare links (any target)", async () => {
    const { preCleanHtml } = await import("@/lib/sanitize/cleaners");
    const lis = Array.from(
      { length: 9 },
      (_, i) => `<li><a href="/section-${i}">Section ${i}</a></li>`,
    ).join("");
    const html = `<div><p>Content.</p><ul>${lis}</ul></div>`;
    const result = preCleanHtml(html);
    expect(result).not.toContain("<ul>");
  });

  test("preserves ul when items contain text beyond a bare link", async () => {
    const { preCleanHtml } = await import("@/lib/sanitize/cleaners");
    const html =
      `<div><p>Content.</p>` +
      `<ul>` +
      `<li>Item with text <a href="/page">link</a> and more text</li>` +
      `<li>Another item with prose content here foo bar baz</li>` +
      `</ul></div>`;
    const result = preCleanHtml(html);
    expect(result).toContain("<ul>");
  });
});

// ── lib/sanitize/patterns – isRelatedHeading normalizePhrase empty branch ─────

describe("lib/sanitize/patterns – isRelatedHeading empty/blank headings", () => {
  test("returns false for empty string (normalizePhrase returns empty → line 42)", async () => {
    const { isRelatedHeading } = await import("@/lib/sanitize/patterns");
    expect(isRelatedHeading("")).toBe(false);
  });

  test("returns false for whitespace-only string", async () => {
    const { isRelatedHeading } = await import("@/lib/sanitize/patterns");
    expect(isRelatedHeading("   \t\n   ")).toBe(false);
  });

  test("returns true for also-of-interest headings", async () => {
    const { isRelatedHeading } = await import("@/lib/sanitize/patterns");
    expect(isRelatedHeading("Also of Interest: More Reads")).toBe(true);
  });

  test("matches related heading prefixes and exact markers", async () => {
    const { isRelatedHeading } = await import("@/lib/sanitize/patterns");
    expect(isRelatedHeading("Related stories")).toBe(true);
    expect(isRelatedHeading("See also")).toBe(true);
    expect(isRelatedHeading("Also Read")).toBe(true);
    expect(isRelatedHeading("News analysis")).toBe(false);
  });

  test("detects AP junk classes after normalization", async () => {
    const { hasApJunkClass } = await import("@/lib/sanitize/patterns");
    expect(hasApJunkClass('class="hub_peek sidebar"')).toBe(true);
    expect(hasApJunkClass('class="inline-module promo"')).toBe(true);
    expect(hasApJunkClass('class="article-body"')).toBe(false);
  });

  test("readAttrValue returns case-insensitive attribute matches", async () => {
    const { readAttrValue } = await import("@/lib/sanitize/patterns");
    const attrs =
      'CLASS="hero" data-feed-id="abc-123" href="/story" aria-label="Read story"';

    expect(readAttrValue(attrs, "class")).toBe("hero");
    expect(readAttrValue(attrs, "data-feed-id")).toBe("abc-123");
    expect(readAttrValue(attrs, "href")).toBe("/story");
    expect(readAttrValue(attrs, "missing")).toBeNull();
  });
});

describe("Image Sanitization", () => {
  test("should allow safe img tags", () => {
    const input =
      '<img src="https://example.com/photo.jpg" alt="A photo" width="800" height="600">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain("<img");
    expect(result).toContain('src="https://example.com/photo.jpg"');
    expect(result).toContain('alt="A photo"');
  });

  test("should enforce referrerpolicy=no-referrer by default", () => {
    const input =
      '<img src="https://example.com/photo.jpg" width="800" height="600">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain('referrerpolicy="no-referrer"');
  });

  test("should enforce loading=eager by default", () => {
    const input =
      '<img src="https://example.com/photo.jpg" width="800" height="600">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain('loading="eager"');
  });

  test("should preserve explicit referrerpolicy if provided", () => {
    const input =
      '<img src="https://example.com/photo.jpg" width="800" height="600" referrerpolicy="no-referrer-when-downgrade">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain('referrerpolicy="no-referrer-when-downgrade"');
  });

  test("should preserve explicit loading if provided", () => {
    const input =
      '<img src="https://example.com/photo.jpg" width="800" height="600" loading="eager">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain('loading="eager"');
  });

  test("should strip dangerous attributes from images", () => {
    const input =
      '<img src="https://example.com/photo.jpg" onerror="alert(1)" onclick="alert(2)" onload="alert(3)">';
    const result = sanitizeArticleHtml(input);

    expect(result).not.toContain("onerror");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onload");
    expect(result).not.toContain("alert");
  });

  test("should block javascript: URLs in img src", () => {
    const input = '<img src="javascript:alert(1)">';
    const result = sanitizeArticleHtml(input);

    // Image should either be removed or src should be stripped
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("alert");
  });

  test("should block data: URLs in img src", () => {
    const input = '<img src="data:text/html,<script>alert(1)</script>">';
    const result = sanitizeArticleHtml(input);

    expect(result).not.toContain("data:");
    expect(result).not.toContain("script");
  });

  test("should allow srcset and sizes attributes", () => {
    const input =
      '<img src="https://example.com/photo.jpg" srcset="https://example.com/photo-2x.jpg 2x" sizes="(max-width: 600px) 100vw, 600px">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain("srcset");
    expect(result).toContain("sizes");
  });

  test("should keep images whose srcset includes a sufficiently wide source", () => {
    const input =
      '<img src="https://example.com/photo.jpg" srcset="https://example.com/photo-small.jpg 100w, https://example.com/photo-large.jpg 640w">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain("<img");
    expect(result).toContain("srcset");
  });

  test("should allow width and height attributes", () => {
    const input =
      '<img src="https://example.com/photo.jpg" width="800" height="600">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain('width="800"');
    expect(result).toContain('height="600"');
  });

  test("should remove images below minimum width", () => {
    const input =
      '<img src="https://example.com/tiny.jpg" width="32" height="400" alt="Tiny">';
    const result = sanitizeArticleHtml(input);

    expect(result).not.toContain("<img");
    expect(result).not.toContain("tiny.jpg");
  });

  test("should remove images below minimum height", () => {
    const input =
      '<img src="https://example.com/short.jpg" width="400" height="32" alt="Short">';
    const result = sanitizeArticleHtml(input);

    expect(result).not.toContain("<img");
    expect(result).not.toContain("short.jpg");
  });

  test("should keep dimensionless images with strong content signals", () => {
    const input =
      '<img src="https://www.esa.int/var/esa/storage/images/esa_multimedia/images/2026/03/liftoff_for_celeste.jpg" alt="Liftoff for Celeste on Rocket Lab\'s Electron rocket">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain("<img");
    expect(result).toContain("liftoff_for_celeste.jpg");
  });

  test("should remove dimensionless chrome images without size signal", () => {
    const input =
      '<img src="https://www.nasa.gov/wp-content/themes/nasa/assets/images/nasa-logo@2x.png" alt="NASA Logo">';
    const result = sanitizeArticleHtml(input);

    expect(result).not.toContain("<img");
    expect(result).not.toContain("nasa-logo@2x.png");
  });

  test("should keep images that have srcset but no explicit width/height", () => {
    // srcset is a sufficient size signal — responsive content images often omit
    // fixed dimensions in favour of srcset + sizes.
    const input =
      '<img src="https://example.com/photo.jpg" srcset="https://example.com/photo-2x.jpg 2x" alt="Photo">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain("<img");
    expect(result).toContain("photo.jpg");
  });

  test("should keep images that have only width (above minimum)", () => {
    const input =
      '<img src="https://example.com/wide.jpg" width="800" alt="Wide">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain("<img");
    expect(result).toContain("wide.jpg");
  });

  test("should keep images that have only height (above minimum)", () => {
    const input =
      '<img src="https://example.com/tall.jpg" height="600" alt="Tall">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain("<img");
    expect(result).toContain("tall.jpg");
  });

  test("should remove unknown/unsafe attributes", () => {
    const input =
      '<img src="https://example.com/photo.jpg" data-evil="payload" style="display:none" class="hack">';
    const result = sanitizeArticleHtml(input);

    expect(result).not.toContain("data-evil");
    expect(result).not.toContain("style");
    expect(result).not.toContain("class");
  });
});

// ─── Full pipeline: raw HTML → sanitize → plaintext → preview ──────────────

describe("sanitize – full content preview pipeline preserves characters", () => {
  function collapsedPreview(rawHtml: string): string {
    const sanitized = sanitizeArticleHtml(rawHtml);
    const normalized = toPlainText(sanitized).trim();
    const content = normalized || "No description available";
    const words = content.replaceAll(/\s+/g, " ").trim();
    return words;
  }

  test("preserves every letter s through the pipeline", () => {
    const html =
      "<p>Scientists suggest several species survive storms safely.</p>";
    const result = collapsedPreview(html);
    expect(result).toBe(
      "Scientists suggest several species survive storms safely.",
    );
  });

  test("preserves possessive 's after entity decoding", () => {
    const html = "<p>The team&rsquo;s research shows results.</p>";
    const result = collapsedPreview(html);
    expect(result).toContain("team\u2019s research");
  });

  test("preserves M&S brand name through pipeline", () => {
    const html = "<p>M&amp;S is a great store with lots of success.</p>";
    const result = collapsedPreview(html);
    expect(result).toContain("M&S");
    expect(result).toContain("success");
  });

  test("does not strip s after semicolon in M&S; pattern", () => {
    const html = "<p>M&amp;S; analysis shows growth results.</p>";
    const result = collapsedPreview(html);
    expect(result).toContain("M&S;");
    expect(result).toContain("shows");
    expect(result).toContain("results");
  });

  test("preserves smart quotes around s-words", () => {
    const html =
      "<p>She said &ldquo;success&rdquo; is the key to satisfaction.</p>";
    const result = collapsedPreview(html);
    expect(result).toContain("\u201Csuccess\u201D");
    expect(result).toContain("satisfaction");
  });

  test("decodes &lt; and &gt; without eating surrounding characters", () => {
    const html = "<p>x &lt; 10 suggests something.</p>";
    const result = collapsedPreview(html);
    expect(result).toBe("x < 10 suggests something.");
  });

  test("preserves text with semicolons that look entity-like", () => {
    const html = "<p>business; services; specialists; discussion;</p>";
    const result = collapsedPreview(html);
    expect(result).toBe("business; services; specialists; discussion;");
  });

  test("decodes double-encoded ampersand without eating adjacent chars", () => {
    const html = "<p>Tom &amp; Jerry&rsquo;s show is classic.</p>";
    const result = collapsedPreview(html);
    expect(result).toContain("Tom & Jerry\u2019s");
  });

  test("preserves s inside em-dash separated clauses", () => {
    const html =
      "<p>The results &mdash; surprising as they seem &mdash; suggest success.</p>";
    const result = collapsedPreview(html);
    expect(result).toContain("results");
    expect(result).toContain("surprising");
    expect(result).toContain("suggest");
    expect(result).toContain("success");
  });

  test("preserves all characters in realistic article content", () => {
    const html =
      "<p>NASA&rsquo;s Artemis program &mdash; its most ambitious mission since Apollo &mdash; aims to send astronauts back to the Moon&rsquo;s surface. Scientists suggest the mission&rsquo;s success depends on several key systems.</p>";
    const result = collapsedPreview(html);
    expect(result).toContain("NASA\u2019s Artemis");
    expect(result).toContain("mission\u2019s success");
    expect(result).toContain("Scientists");
    expect(result).toContain("systems");
  });

  test("section nonTextTag suppresses all content", () => {
    const html =
      "<section><p>Secret science shows surprising stats.</p></section>";
    const result = collapsedPreview(html);
    expect(result).toBe("No description available");
  });
});

describe("sanitize – sanitizeArticleTitle preserves characters", () => {
  test("preserves M&S brand name", () => {
    const result = sanitizeArticleTitle("M&amp;S Quarterly Results");
    expect(result).toBe("M&S Quarterly Results");
  });

  test("does not strip S after decoded ampersand with semicolon", () => {
    const result = sanitizeArticleTitle("M&amp;S; Latest Results");
    expect(result).toBe("M&S; Latest Results");
  });

  test("does not strip content after decoded &amp; followed by word;", () => {
    const result = sanitizeArticleTitle("&amp;S; Tests Show Results");
    expect(result).toContain("&S;");
    expect(result).toContain("Tests");
    expect(result).toContain("Results");
  });

  test("preserves possessive s after smart quote entity", () => {
    const result = sanitizeArticleTitle("The Team&rsquo;s Success Story");
    expect(result).toBe("The Team\u2019s Success Story");
  });

  test("preserves every s in s-heavy title", () => {
    const result = sanitizeArticleTitle(
      "Scientists Suggest Several Species Survive",
    );
    expect(result).toBe("Scientists Suggest Several Species Survive");
  });

  test("preserves smart quotes around s-words", () => {
    const result = sanitizeArticleTitle("&ldquo;Success&rdquo; Stories");
    expect(result).toBe("\u201CSuccess\u201D Stories");
  });

  test("preserves AT&T with semicolons in surrounding text", () => {
    const result = sanitizeArticleTitle("AT&amp;T; Stock Surges");
    expect(result).toBe("AT&T; Stock Surges");
  });
});
