import { describe, expect, test } from "bun:test";
import { sanitizeArticleHtml } from "../lib/sanitize/sanitize";

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

  test("should enforce loading=lazy by default", () => {
    const input =
      '<img src="https://example.com/photo.jpg" width="800" height="600">';
    const result = sanitizeArticleHtml(input);

    expect(result).toContain('loading="lazy"');
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

  test("should remove images with no size signal (no width, height, or srcset)", () => {
    // No dimensions and no srcset = unverifiable — likely an avatar or icon.
    const input = '<img src="https://example.com/no-dims.jpg" alt="No dims">';
    const result = sanitizeArticleHtml(input);

    expect(result).not.toContain("<img");
    expect(result).not.toContain("no-dims.jpg");
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
