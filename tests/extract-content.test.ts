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

  test("returns html for a known placeholder article URL", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const result = await readPlaceholderSnapshotHtml(
      "https://www.livescience.com/archaeology/neanderthals/humans-and-neanderthals-interbred-but-it-was-mostly-male-neanderthals-and-female-humans-who-coupled-up-study-finds",
    );
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(typeof result.html).toBe("string");
      expect(result.snapshotPath).toContain("placeholder-articles");
    }
  });
});
