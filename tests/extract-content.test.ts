import { extractArticleFromHtml } from "@/lib/extract";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("lib/extract/content-extraction", () => {
  describe("extractArticleFromHtml", () => {
    test("returns null when no article body is found", async () => {
      const html = "<html><body><p>Too short.</p></body></html>";
      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).toBeNull();
    });

    test("extracts article from semantic itemprop articleBody", async () => {
      const html = `
        <html>
          <head>
            <title>Test Article Title</title>
            <meta property="og:description" content="Test description from meta tag" />
          </head>
          <body>
            <div itemprop="articleBody">
              <p>This is the main article content with sufficient length to pass the threshold check.</p>
              <p>Additional paragraph to ensure we meet minimum length requirements.</p>
            </div>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("main article content");
      expect(result?.title).toBe("Test Article Title");
      expect(result?.description).toBe("Test description from meta tag");
      expect(result?.source).toBe("https://example.com/article");
    });

    test("extracts article from common CMS class patterns", async () => {
      const html = `
        <html>
          <body>
            <div class="article-content">
              <p>Article body content from common CMS pattern with sufficient length.</p>
              <p>More content to meet the minimum threshold requirement.</p>
            </div>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/post",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Article body content");
    });

    test("extracts article from article tag", async () => {
      const html = `
        <html>
          <body>
            <article>
              <h1>Article Title in H1</h1>
              <p>Main article content inside semantic article tag with enough text.</p>
              <p>Additional paragraph for minimum length requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/story",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Main article content");
      expect(result?.title).toBe("Article Title in H1");
    });

    test("selects largest article when multiple article tags exist", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Short article content.</p>
            </article>
            <article>
              <p>This is the longer article content with much more text to ensure it is selected.</p>
              <p>Additional paragraphs to make this article clearly the largest one available.</p>
              <p>Even more content to definitively make this the winner in size comparison.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/news",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("longer article content");
      expect(result?.content).not.toContain("Short article");
    });

    test("extracts article from role=main attribute", async () => {
      const html = `
        <html>
          <body>
            <div role="main">
              <p>Content inside role main element with adequate length for extraction.</p>
              <p>More content to pass threshold validation checks.</p>
            </div>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/page",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("role main element");
    });

    test("extracts article from main tag", async () => {
      const html = `
        <html>
          <body>
            <main>
              <p>Content inside semantic main tag with sufficient length for extraction.</p>
              <p>Additional content to meet minimum length threshold.</p>
            </main>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("semantic main tag");
    });

    test("respects custom content length threshold", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Short content.</p>
            </article>
          </body>
        </html>
      `;

      // With high threshold, should return null
      const resultHigh = await extractArticleFromHtml(
        html,
        "https://example.com/article",
        { contentLengthThreshold: 500 },
      );
      expect(resultHigh).toBeNull();

      // With low threshold, should extract
      const resultLow = await extractArticleFromHtml(
        html,
        "https://example.com/article",
        { contentLengthThreshold: 10 },
      );
      expect(resultLow).not.toBeNull();
      expect(resultLow?.content).toContain("Short content");
    });

    test("uses default threshold of 100 when not specified", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>This content has exactly one hundred characters to test the default minimum body length threshold value.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      // This should succeed with default threshold
      expect(result).not.toBeNull();
    });

    test("extracts og:title from meta tags", async () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Open Graph Title" />
          </head>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Open Graph Title");
    });

    test("falls back to h1 for title when no og:title", async () => {
      const html = `
        <html>
          <body>
            <h1>Headline from H1 Tag</h1>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Headline from H1 Tag");
    });

    test("falls back to title tag when no og:title or h1", async () => {
      const html = `
        <html>
          <head>
            <title>Page Title from Title Tag</title>
          </head>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).not.toBeNull();
      expect(result?.title).toBe("Page Title from Title Tag");
    });

    test("returns undefined title when no title sources available", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).not.toBeNull();
      expect(result?.title).toBeUndefined();
    });

    test("extracts og:description from meta tags", async () => {
      const html = `
        <html>
          <head>
            <meta property="og:description" content="Open Graph description text" />
          </head>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).not.toBeNull();
      expect(result?.description).toBe("Open Graph description text");
    });

    test("falls back to twitter:description when no og:description", async () => {
      const html = `
        <html>
          <head>
            <meta name="twitter:description" content="Twitter description text" />
          </head>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).not.toBeNull();
      expect(result?.description).toBe("Twitter description text");
    });

    test("falls back to standard description meta tag", async () => {
      const html = `
        <html>
          <head>
            <meta name="description" content="Standard meta description" />
          </head>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).not.toBeNull();
      expect(result?.description).toBe("Standard meta description");
    });

    test("returns undefined description when no description sources available", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Article content with sufficient length for extraction to succeed properly.</p>
              <p>Additional paragraph to meet minimum requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      expect(result).not.toBeNull();
      expect(result?.description).toBeUndefined();
    });

    test("handles empty HTML gracefully", async () => {
      const result = await extractArticleFromHtml("", "https://example.com");

      expect(result).toBeNull();
    });

    test("handles HTML with only whitespace", async () => {
      const result = await extractArticleFromHtml(
        "   \n\n   ",
        "https://example.com",
      );

      expect(result).toBeNull();
    });

    test("handles HTML without body tag", async () => {
      const html = `
        <article>
          <p>Content without html or body wrapper with sufficient length.</p>
          <p>Additional content to meet threshold.</p>
        </article>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
      );

      // Should still work if the article tag is present
      expect(result).not.toBeNull();
      expect(result?.content).toContain("Content without html");
    });

    test("extracts all metadata fields together", async () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Complete Article Title" />
            <meta property="og:description" content="Complete article description" />
          </head>
          <body>
            <article>
              <p>Complete article body with all metadata present and sufficient length.</p>
              <p>Additional paragraph to ensure proper extraction with full metadata.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/complete",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Complete article body");
      expect(result?.title).toBe("Complete Article Title");
      expect(result?.description).toBe("Complete article description");
      expect(result?.source).toBe("https://example.com/complete");
    });

    test("prioritizes itemprop articleBody over other selectors", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Longer content in article tag that would normally be selected based on size alone.</p>
              <p>Multiple paragraphs making this the longest content block available in the document.</p>
              <p>Even more content to ensure this is definitely the longest option available.</p>
            </article>
            <div itemprop="articleBody">
              <p>Shorter content but with semantic articleBody marker should win due to priority.</p>
              <p>Additional content to meet the minimum length threshold requirements for extraction.</p>
            </div>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/priority",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("semantic articleBody marker");
      expect(result?.content).not.toContain("Longer content in article");
    });

    test("prioritizes CMS class patterns over article tag", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Content in article tag that is available for extraction.</p>
            </article>
            <div class="article-content">
              <p>Content in CMS pattern class should be prioritized over article tag.</p>
              <p>Additional content to meet minimum length requirements.</p>
            </div>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/cms",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("CMS pattern class");
    });

    test("handles WordPress entry-content class pattern", async () => {
      const html = `
        <html>
          <body>
            <div class="entry-content">
              <p>WordPress-style content with entry-content class pattern.</p>
              <p>Additional content to meet minimum length requirements.</p>
            </div>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/wordpress",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("WordPress-style content");
    });

    test("handles Drupal field-name-body pattern", async () => {
      const html = `
        <html>
          <body>
            <div class="field-name-body">
              <p>Drupal CMS content with standard field-name-body class pattern.</p>
              <p>Additional content to meet minimum length requirements.</p>
            </div>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/drupal",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Drupal CMS content");
    });

    test("selects largest main tag when multiple exist", async () => {
      const html = `
        <html>
          <body>
            <main>
              <p>First main tag with minimal content.</p>
            </main>
            <main>
              <p>Second main tag with more comprehensive content that exceeds the first.</p>
              <p>Multiple paragraphs making this clearly the larger of the two main elements.</p>
              <p>Additional content to ensure this is selected as the winner.</p>
            </main>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/multiple-main",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("more comprehensive content");
      expect(result?.content).not.toContain("minimal content");
    });

    test("returns null for content below threshold even with metadata", async () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Article has title" />
            <meta property="og:description" content="Article has description" />
          </head>
          <body>
            <article>
              <p>Too short.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/short",
        { contentLengthThreshold: 200 },
      );

      expect(result).toBeNull();
    });

    test("handles zero threshold option", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>X</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
        { contentLengthThreshold: 0 },
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("X");
    });

    test("handles very large threshold", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Even with substantial content this should not pass.</p>
              <p>Multiple paragraphs of decent length.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/article",
        { contentLengthThreshold: 1000000 },
      );

      expect(result).toBeNull();
    });

    test("preserves source URL exactly as provided", async () => {
      const html = `
        <html>
          <body>
            <article>
              <p>Article content with sufficient length for extraction.</p>
              <p>Additional paragraph to meet requirements.</p>
            </article>
          </body>
        </html>
      `;

      const testUrl = "https://example.com/article?param=value#fragment";
      const result = await extractArticleFromHtml(html, testUrl);

      expect(result).not.toBeNull();
      expect(result?.source).toBe(testUrl);
    });

    test("handles complex nested HTML structures", async () => {
      const html = `
        <html>
          <body>
            <div class="container">
              <div class="wrapper">
                <article>
                  <div class="content">
                    <div class="inner">
                      <p>Deeply nested article content that should still be extracted properly.</p>
                      <p>Additional nested content to meet minimum length requirements.</p>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/nested",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Deeply nested article content");
    });

    test("extracts content with mixed HTML tags", async () => {
      const html = `
        <html>
          <body>
            <article>
              <h2>Section Header</h2>
              <p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
              <ul>
                <li>List item one</li>
                <li>List item two</li>
              </ul>
              <blockquote>A quoted section of text</blockquote>
              <p>Final paragraph to ensure sufficient length.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/mixed",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("Section Header");
      expect(result?.content).toContain("bold");
      expect(result?.content).toContain("italic");
    });

    test("handles role=article attribute", async () => {
      const html = `
        <html>
          <body>
            <div role="article">
              <p>Content marked with role article attribute for accessibility.</p>
              <p>Additional content to meet minimum length requirements.</p>
            </div>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/role",
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("role article attribute");
    });

    test("ExtractedArticle interface matches expected structure", async () => {
      const html = `
        <html>
          <head>
            <meta property="og:title" content="Test Title" />
            <meta property="og:description" content="Test Description" />
          </head>
          <body>
            <article>
              <p>Article content with all fields populated to validate interface structure.</p>
              <p>Additional content to meet minimum length requirements.</p>
            </article>
          </body>
        </html>
      `;

      const result = await extractArticleFromHtml(
        html,
        "https://example.com/validate",
      );

      expect(result).not.toBeNull();
      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("source");
      expect(typeof result?.content).toBe("string");
      expect(typeof result?.title).toBe("string");
      expect(typeof result?.description).toBe("string");
      expect(typeof result?.source).toBe("string");
    });
  });
});
