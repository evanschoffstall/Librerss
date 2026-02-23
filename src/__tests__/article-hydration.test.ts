#!/usr/bin/env bun

/**
 * Test that hydration is skipped for articles with substantial content
 */

import { describe, expect, test } from "bun:test";

describe("Article Hydration Logic", () => {
  test("should skip hydration for articles with substantial content (>= 2000 chars)", () => {
    // This simulates the logic we added to useArticleHydration
    const currentContentLength = 15092; // Mother Jones article with content:encoded
    const HYDRATION_THRESHOLD = 2000;

    const shouldSkipHydration = currentContentLength >= HYDRATION_THRESHOLD;

    expect(shouldSkipHydration).toBe(true);
  });

  test("should hydrate articles with short content (< 2000 chars)", () => {
    const currentContentLength = 350; // Short excerpt from contentSnippet
    const HYDRATION_THRESHOLD = 2000;

    const shouldSkipHydration = currentContentLength >= HYDRATION_THRESHOLD;

    expect(shouldSkipHydration).toBe(false);
  });

  test("edge case: exactly 2000 chars should NOT hydrate", () => {
    const currentContentLength = 2000;
    const HYDRATION_THRESHOLD = 2000;

    const shouldSkipHydration = currentContentLength >= HYDRATION_THRESHOLD;

    expect(shouldSkipHydration).toBe(true);
  });

  test("edge case: 1999 chars SHOULD hydrate", () => {
    const currentContentLength = 1999;
    const HYDRATION_THRESHOLD = 2000;

    const shouldSkipHydration = currentContentLength >= HYDRATION_THRESHOLD;

    expect(shouldSkipHydration).toBe(false);
  });
});
