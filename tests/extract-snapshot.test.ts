import { describe, expect, test } from "bun:test";

import { PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources";
import { readPlaceholderSnapshotHtml } from "@/lib/extract/snapshot";

const getBundledPlaceholderSeed = () => {
  const seed = PLACEHOLDER_SOURCE_DEFINITIONS.flatMap(
    (definition) => definition.seeds,
  )[0];

  if (!seed) {
    throw new Error("Expected at least one bundled placeholder article.");
  }

  return seed;
};

describe("extract snapshot", () => {
  test("returns null when no bundled placeholder snapshot exists for the URL", async () => {
    await expect(
      readPlaceholderSnapshotHtml("https://example.com/no-placeholder"),
    ).resolves.toBeNull();
  });

  test("reads a bundled placeholder snapshot and rewrites relative asset URLs", async () => {
    const result = await readPlaceholderSnapshotHtml(
      getBundledPlaceholderSeed().url,
    );

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

    expect(result.snapshotPath).toMatch(/^\/placeholder-articles\//);
    expect(result.html).toMatch(/\s(?:href|src)="https?:\/\//);
    expect(result.html).not.toMatch(/\s(?:href|src)="\/(?!\/)/);
  });
});
