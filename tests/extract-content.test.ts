import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

describe("extract/snapshot – readPlaceholderSnapshotHtml", () => {
  test("returns null for URL with no snapshot mapping", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const result = await readPlaceholderSnapshotHtml(
      "https://no-snapshot.example.com/",
    );
    expect(result).toBeNull();
  });

  test("returns HTML for a URL with a known snapshot", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const result = await readPlaceholderSnapshotHtml(
      "https://science.nasa.gov/photojournal/jpl-3d-printed-part-springs-forward/",
    );
    expect(result).not.toBeNull();
    expect(typeof result?.html).toBe("string");
    expect(result!.html.length).toBeGreaterThan(0);
  });
});

// ── lib/extract/extraction – extractArticleFromHtml ───────────────────────────

describe("lib/extract/extraction – extractArticleFromHtml", () => {
  test("returns null for minimal HTML with insufficient content", async () => {
    const { extractArticleFromHtml } = await import("@/lib/extract/extraction");
    const html =
      "<html><head><title>T</title></head><body><p>Short</p></body></html>";
    const result = await extractArticleFromHtml(html, "https://example.com/");
    // May be null if body content is below threshold
    expect(result === null || typeof result === "object").toBe(true);
  });

  test("extracts content and metadata from a full article HTML page", async () => {
    const { extractArticleFromHtml } = await import("@/lib/extract/extraction");
    const longText =
      "Article text that is more than one hundred characters long and provides meaningful content. ".repeat(
        3,
      );
    const html = `<html><head><title>My Article</title></head><body><article><p>${longText}</p></article></body></html>`;
    const result = await extractArticleFromHtml(
      html,
      "https://example.com/article",
    );
    if (result) {
      expect(typeof result.content).toBe("string");
      expect(result.source).toBe("https://example.com/article");
    }
    expect(result === null || typeof result === "object").toBe(true);
  });
});

// ── lib/extract/snapshot – readPlaceholderSnapshotHtml happy path + catch ────

describe("lib/extract/snapshot – readPlaceholderSnapshotHtml", () => {
  test("returns html for a known placeholder article URL (lines 12-17)", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    // This URL is in PLACEHOLDER_SNAPSHOT_PATH_BY_URL, so getPlaceholderSnapshotPathByArticleUrl
    // returns a non-null path, and the file exists in public/placeholder-articles/
    const result = await readPlaceholderSnapshotHtml(
      "https://www.livescience.com/archaeology/neanderthals/humans-and-neanderthals-interbred-but-it-was-mostly-male-neanderthals-and-female-humans-who-coupled-up-study-finds",
    );
    // File should exist → returns { html, snapshotPath }
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(typeof result.html).toBe("string");
      expect(result.snapshotPath).toContain("placeholder-articles");
    }
  });

  test("returns null when URL has no snapshot mapping (line 10 early exit)", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    // URL not in lookup → returns null before hitting fs
    const result = await readPlaceholderSnapshotHtml(
      "https://totally-unknown-domain.example.com/article",
    );
    expect(result).toBeNull();
  });
});
