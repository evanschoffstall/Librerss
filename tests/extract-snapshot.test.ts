import { describe, expect, test } from "bun:test";

import { readPlaceholderSnapshotHtml } from "@/lib/extract/snapshot";

describe("extract snapshot", () => {
  test("returns null when no bundled placeholder snapshot exists for the URL", async () => {
    await expect(
      readPlaceholderSnapshotHtml("https://example.com/no-placeholder"),
    ).resolves.toBeNull();
  });

  test("reads a bundled placeholder snapshot and rewrites relative asset URLs", async () => {
    const result = await readPlaceholderSnapshotHtml(
      "https://www.noaa.gov/news-release/noaa-deploys-new-generation-of-ai-driven-global-weather-models",
    );

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

    expect(result.snapshotPath).toBe(
      "/placeholder-articles/noaa/noaa-deploys-new-generation-of-ai-driven-global-weather-models.html",
    );
    expect(result.html).toContain(
      'href="https://www.noaa.gov/themes/custom/noaa_guswds/favicon.ico"',
    );
    expect(result.html).toContain(
      'href="https://www.noaa.gov/core/assets/vendor/jquery.ui/themes/base/core.css?tcjhx2"',
    );
    expect(result.html).toContain(
      'src="https://www.noaa.gov/core/misc/drupalSettingsLoader.js?v=10.6.3"',
    );
  });
});