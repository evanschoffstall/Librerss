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

  test("returns HTML for a newly bundled NASA placeholder article", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const result = await readPlaceholderSnapshotHtml(
      "https://www.nasa.gov/image-article/virgil-i-gus-grissom/",
    );

    expect(result).not.toBeNull();
    expect(result?.snapshotPath).toBe(
      "/placeholder-articles/nasa-breaking/virgil-i-gus-grissom.html",
    );
    expect(result?.html).toContain("https://www.nasa.gov");
  });

  test("returns HTML for a newly bundled ESA placeholder article", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const result = await readPlaceholderSnapshotHtml(
      "https://www.esa.int/ESA_Multimedia/Images/2026/04/Earth_from_Space_Eyes_on_our_Moon",
    );

    expect(result).not.toBeNull();
    expect(result?.snapshotPath).toBe(
      "/placeholder-articles/esa-earth/Earth_from_Space_Eyes_on_our_Moon.html",
    );
    expect(result?.html).toContain("https://www.esa.int");
  });

  test("returns HTML for a newly bundled NIH placeholder article", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const result = await readPlaceholderSnapshotHtml(
      "https://www.nih.gov/news-events/nih-research-matters/treating-addiction",
    );

    expect(result).not.toBeNull();
    expect(result?.snapshotPath).toBe(
      "/placeholder-articles/nih-research-matters/treating-addiction.html",
    );
    expect(result?.html).toContain("https://www.nih.gov");
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
    expect(result?.html).toContain(
      'href="https://www.nist.gov/news-events/news"',
    );
  });
});
