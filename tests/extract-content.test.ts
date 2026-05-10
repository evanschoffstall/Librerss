import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

async function getBundledPlaceholderSeed(offset = 0) {
  const { PLACEHOLDER_SOURCE_DEFINITIONS } =
    await import("@/lib/core/placeholder-sources");
  const seeds = PLACEHOLDER_SOURCE_DEFINITIONS.flatMap(
    (definition) => definition.seeds,
  );
  const seed = seeds[offset];

  if (!seed) {
    throw new Error(`Expected placeholder seed at offset ${offset}.`);
  }

  return seed;
}

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
      "https://example.com/no-snapshot",
    );
    expect(result).toBeNull();
  });

  test("returns HTML for a URL with a known snapshot", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const seed = await getBundledPlaceholderSeed();
    const result = await readPlaceholderSnapshotHtml(seed.url);
    expect(result).not.toBeNull();
    expect(typeof result?.html).toBe("string");
    expect(result!.html.length).toBeGreaterThan(0);
  });

  test("returns HTML for a second bundled placeholder article", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const seed = await getBundledPlaceholderSeed(1);
    const result = await readPlaceholderSnapshotHtml(seed.url);

    expect(result).not.toBeNull();
    expect(result?.snapshotPath).toContain("/placeholder-articles/");
    expect(result?.html).toContain(`${"https"}://`);
  });

  test("returns HTML for a third bundled placeholder article", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const seed = await getBundledPlaceholderSeed(2);
    const result = await readPlaceholderSnapshotHtml(seed.url);

    expect(result).not.toBeNull();
    expect(result?.snapshotPath).toContain("/placeholder-articles/");
    expect(result?.html).toContain(`${"https"}://`);
  });

  test("returns HTML for a fourth bundled placeholder article", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const seed = await getBundledPlaceholderSeed(3);
    const result = await readPlaceholderSnapshotHtml(seed.url);

    expect(result).not.toBeNull();
    expect(result?.snapshotPath).toContain("/placeholder-articles/");
    expect(result?.html).toContain(`${"https"}://`);
  });

  test("returns html for a known placeholder article URL", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const seed = await getBundledPlaceholderSeed(4);
    const result = await readPlaceholderSnapshotHtml(seed.url);
    expect(result).not.toBeNull();
    if (result !== null) {
      expect(typeof result.html).toBe("string");
      expect(result.snapshotPath).toContain("placeholder-articles");
    }
  });

  test("normalizes relative placeholder asset URLs against the article origin", async () => {
    const { readPlaceholderSnapshotHtml } =
      await import("@/lib/extract/snapshot");
    const seed = await getBundledPlaceholderSeed();
    const result = await readPlaceholderSnapshotHtml(seed.url);

    expect(result).not.toBeNull();
    expect(result?.html).toMatch(/\s(?:href|src)="https?:\/\//);
    expect(result?.html).not.toMatch(/\s(?:href|src)="\/(?!\/)/);
  });
});
