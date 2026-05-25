import { describe, expect, test } from "bun:test";

import { ARTICLES_PER_PAGE_OPTIONS } from "@/app/dashboard/components/settings-dialog/SettingsDisplaySection";

describe("SettingsDisplaySection", () => {
  test("limits the articles-per-page options to 4, 6, 8, and 12", () => {
    expect(ARTICLES_PER_PAGE_OPTIONS).toEqual([4, 6, 8, 12]);
  });
});
