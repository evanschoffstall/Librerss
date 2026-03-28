import { describe, expect, test } from "bun:test";

import {
  MOBILE_INVERTED_SCROLL_STORAGE_KEY,
  MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY,
  MOBILE_TOOLBAR_MIRROR_STORAGE_KEY,
} from "@/app/dashboard/constants";

describe("mobile inverted scroll preference", () => {
  test("storage key follows the established librerss namespace convention", () => {
    expect(MOBILE_INVERTED_SCROLL_STORAGE_KEY).toBe(
      "librerss:mobileInvertedScroll",
    );
  });

  test("mobile display preference keys are distinct", () => {
    const keys = new Set([
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY,
      MOBILE_TOOLBAR_MIRROR_STORAGE_KEY,
    ]);

    expect(keys.size).toBe(3);
  });
});
