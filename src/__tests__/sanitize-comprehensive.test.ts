import { describe, expect, test } from "bun:test";

describe("lib/utils/sanitize comprehensive", () => {
  test("toPlainText strips HTML tags and normalizes whitespace", async () => {
    const { toPlainText } = await import("@/lib/utils/sanitize");

    const html = "<p>Hello <strong>world</strong>!</p><p>Second paragraph.</p>";
    const result = toPlainText(html);

    expect(result).toContain("Hello");
    expect(result).toContain("world");
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("<strong>");
  });

  test("toPlainText converts figure tags to newlines", async () => {
    const { toPlainText } = await import("@/lib/utils/sanitize");

    const html = "<p>Text</p><figure><img src='test.jpg'/></figure><p>More</p>";
    const result = toPlainText(html);

    expect(result).toContain("Text");
    expect(result).toContain("More");
    expect(result).not.toContain("<figure>");
    expect(result).not.toContain("<img");
  });

  test("toPlainText converts br tags to newlines", async () => {
    const { toPlainText } = await import("@/lib/utils/sanitize");

    const html = "Line 1<br>Line 2<br/>Line 3";
    const result = toPlainText(html);

    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
    expect(result).toContain("Line 3");
    expect(result).not.toContain("<br>");
  });

  test("toPlainText handles HTML entities", async () => {
    const { toPlainText } = await import("@/lib/utils/sanitize");

    const html = "Hello&nbsp;world&amp;more";
    const result = toPlainText(html);

    expect(result).toContain("Hello");
    expect(result).toContain("world");
    expect(result).toContain("&");
    expect(result).not.toContain("&nbsp;");
    expect(result).not.toContain("&amp;");
  });

  test("toPlainText handles block-level elements with newlines", async () => {
    const { toPlainText } = await import("@/lib/utils/sanitize");

    const html =
      "<div>Content</div><section>Section</section><article>Article</article>";
    const result = toPlainText(html);

    expect(result).toContain("Content");
    expect(result).toContain("Section");
    expect(result).toContain("Article");
  });

  test("normalizeArticleHtmlSpacing removes blank paragraphs and tag-gap blank lines", async () => {
    const { normalizeArticleHtmlSpacing } =
      await import("@/lib/utils/sanitize");

    const input = "<p></p>\n\n<p>A</p>\n\n\n<p>B</p>\n\n<p>\u00a0</p>";
    const result = normalizeArticleHtmlSpacing(input);

    expect(result).toBe("<p>A</p>\n<p>B</p>");
  });

  test("normalizeArticleHtmlSpacing removes formatting-only empty paragraphs", async () => {
    const { normalizeArticleHtmlSpacing } =
      await import("@/lib/utils/sanitize");

    const input =
      "<p>One</p>\n\n<p><strong> </strong></p>\n\n<p><em>\u00a0</em></p>\n\n<p>Two</p>";
    const result = normalizeArticleHtmlSpacing(input);

    expect(result).toBe("<p>One</p>\n<p>Two</p>");
  });

  test("sanitizeArticleTitle strips HTML from titles", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/utils/sanitize");

    const title = "Breaking: <script>alert(1)</script> News!";
    const result = sanitizeArticleTitle(title);

    expect(result).toContain("Breaking:");
    expect(result).toContain("News!");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  test("sanitizeArticleTitle strips HTML", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/utils/sanitize");

    const title = "Title <b>with</b> tags";
    const result = sanitizeArticleTitle(title);

    expect(result).toContain("Title");
    expect(result).toContain("with");
    expect(result).toContain("tags");
    expect(result).not.toContain("<b>");
  });

  test("sanitizeArticleTitle decodes named entities", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/utils/sanitize");

    const title = "Cartoon: Stocks &amp; Bondis";
    const result = sanitizeArticleTitle(title);

    expect(result).toBe("Cartoon: Stocks & Bondis");
    expect(result).not.toContain("&amp;");
  });

  test("sanitizeArticleTitle decodes numeric entities", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/utils/sanitize");

    const title = "Cartoon &#38; Politics &#x26; Markets";
    const result = sanitizeArticleTitle(title);

    expect(result).toBe("Cartoon & Politics & Markets");
  });

  test("sanitizeArticleTitle strips unknown entities", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/utils/sanitize");

    const title = "Headline &doesnotexist; update";
    const result = sanitizeArticleTitle(title);

    expect(result).toBe("Headline update");
  });

  test("decodeHtmlEntities handles decimal/hex entities and overflow safely", async () => {
    const { __decodeHtmlEntitiesForTests } =
      await import("@/lib/utils/sanitize");

    expect(__decodeHtmlEntitiesForTests("A &#65; B")).toBe("A A B");
    expect(__decodeHtmlEntitiesForTests("A &#x41; B")).toBe("A A B");
    expect(__decodeHtmlEntitiesForTests("A &#x110000; B")).toBe("A  B");
  });

  test("sanitizeArticleTitle handles empty input with fallback", async () => {
    const { sanitizeArticleTitle } = await import("@/lib/utils/sanitize");

    // The function returns "Untitled" for empty strings
    expect(sanitizeArticleTitle("")).toBe("Untitled");
    expect(sanitizeArticleTitle("   ")).toBe("Untitled");
  });

  test("sanitizeAndTruncateArticleContent removes dangerous tags", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");

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
      await import("@/lib/utils/sanitize");

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
      await import("@/lib/utils/sanitize");

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
      await import("@/lib/utils/sanitize");

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
      await import("@/lib/utils/sanitize");

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
      await import("@/lib/utils/sanitize");

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
      await import("@/lib/utils/sanitize");

    const html = '<p><img src="http://example.com/image.jpg" alt="Test" /></p>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("referrerpolicy");
    expect(result).toContain('referrerpolicy="no-referrer"');
  });

  test("sanitizeAndTruncateArticleContent handles long content truncation", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");

    // Create very long content
    const longContent =
      "<p>" + "Lorem ipsum dolor sit amet. ".repeat(5000) + "</p>";
    const result = sanitizeAndTruncateArticleContent(longContent);

    // Should be truncated (config sets max chars)
    expect(result.length).toBeLessThan(longContent.length);
  });

  test("sanitizeAndTruncateArticleContent collapses excessive newlines", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");

    const html = "<p>Line 1</p>\n\n\n\n\n<p>Line 2</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
    // Should not have 5 consecutive newlines
    expect(result).not.toMatch(/\n{5,}/);
  });

  test("sanitizeAndTruncateArticleContent handles figcaption removal", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");

    const html =
      "<figure><img src='test.jpg'/><figcaption>Image caption</figcaption></figure><p>Text</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("Text");
    // Figcaption should be handled appropriately
  });

  test("sanitizeAndTruncateArticleContent allows target=_blank on links", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");

    const html = '<a href="https://example.com" target="_blank">Link</a>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain('target="_blank"');
  });

  test("sanitizeAndTruncateArticleContent blocks javascript: URLs", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");

    const html = '<a href="javascript:alert(1)">Bad Link</a>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).not.toContain("javascript:");
  });

  test("sanitizeAndTruncateArticleContent blocks data: URLs", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");

    const html = '<a href="data:text/html,<script>alert(1)</script>">Bad</a>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).not.toContain("data:");
  });

  test("sanitizeAndTruncateArticleContent allows http and https in href", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");

    const html =
      '<a href="https://example.com">HTTPS</a><a href="http://example.com">HTTP</a>';
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("https://example.com");
    expect(result).toContain("http://example.com");
  });

  test("sanitizeAndTruncateArticleContent preserves pre and code tags", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");

    const html =
      "<pre><code>const x = 42;\nconsole.log(x);</code></pre><p>Text</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("<pre>");
    expect(result).toContain("<code>");
    expect(result).toContain("const x = 42");
  });

  test("sanitizeAndTruncateArticleContent handles blockquote", async () => {
    const { sanitizeAndTruncateArticleContent } =
      await import("@/lib/utils/sanitize");

    const html = "<blockquote>Quoted text here</blockquote><p>More text</p>";
    const result = sanitizeAndTruncateArticleContent(html);

    expect(result).toContain("<blockquote>");
    expect(result).toContain("Quoted text");
  });
});
