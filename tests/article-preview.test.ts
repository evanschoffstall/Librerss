import { describe, expect, test } from "bun:test";

import {
  ARTICLE_CONTENT_PREVIEW_LENGTH,
  ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH,
  truncateArticlePreviewText,
} from "@/lib/core/article-preview";

describe("article preview", () => {
  test("exports the shared preview budget constants", () => {
    expect(ARTICLE_CONTENT_PREVIEW_LENGTH).toBe(170);
    expect(ARTICLE_CONTENT_PREVIEW_SOURCE_LENGTH).toBe(
      ARTICLE_CONTENT_PREVIEW_LENGTH * 8,
    );
  });

  test("returns untouched text when it fits within the preview budget", () => {
    expect(truncateArticlePreviewText("Short preview text.")).toEqual({
      hasOverflow: false,
      preview: "Short preview text.",
    });
  });

  test("truncates at a word boundary when possible", () => {
    const text = `${"word ".repeat(40)}tail`;
    const result = truncateArticlePreviewText(text);

    expect(result.hasOverflow).toBe(true);
    expect(result.preview.length).toBeLessThanOrEqual(
      ARTICLE_CONTENT_PREVIEW_LENGTH,
    );
    expect(result.preview.endsWith(" ")).toBe(false);
    expect(text.startsWith(result.preview)).toBe(true);
  });

  test("falls back to a hard character cut when no word boundary exists", () => {
    const text = "x".repeat(ARTICLE_CONTENT_PREVIEW_LENGTH + 25);
    const result = truncateArticlePreviewText(text);

    expect(result.hasOverflow).toBe(true);
    expect(result.preview).toBe(text.slice(0, ARTICLE_CONTENT_PREVIEW_LENGTH));
  });
});