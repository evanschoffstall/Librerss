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
      "https://www.nist.gov/news-events/news/2026/03/nist-helps-fingerprint-examiners-new-data-and-software-release",
    );
    expect(result).not.toBeNull();
    expect(typeof result?.html).toBe("string");
    expect(result!.html.length).toBeGreaterThan(0);
  });

  test("returns html for a known placeholder article URL", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const result = await readPlaceholderSnapshotHtml(
      "https://water.ca.gov/News/News-Releases/2026/Jan-2026/Dry-January-Cuts-into-Early-Season-Snowpack-Gains",
    );
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(typeof result.html).toBe("string");
      expect(result.snapshotPath).toContain("placeholder-articles");
    }
  });

  test("normalizes relative placeholder asset URLs against the article origin", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const result = await readPlaceholderSnapshotHtml(
      "https://www.nist.gov/news-events/news/2026/03/nist-helps-fingerprint-examiners-new-data-and-software-release",
    );

    expect(result).not.toBeNull();
    expect(result?.html).toContain(
      'src="https://www.nist.gov/sites/default/files/styles/960_x_960_limit/public/images/2026/03/09/fingerprint_960x300.png?itok=8HmG8WDz"',
    );
    expect(result?.html).not.toContain(
      'src="/sites/default/files/styles/960_x_960_limit/public/images/2026/03/09/fingerprint_960x300.png?itok=8HmG8WDz"',
    );
    expect(result?.html).toContain('href="https://www.nist.gov/news-events/news"');
  });
});
