/**
 * Component Tests: Dashboard Services
 * Tests for src/app/dashboard/services/
 */

import { describe, expect, test } from "bun:test";

// ─── Article Content Services ─────────────────────────────────────────────────

describe("article-content services", () => {
  test("getUrlHostnameDisplayLabel extracts hostname", async () => {
    const { getUrlHostnameDisplayLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameDisplayLabel("https://www.example.com/path")).toBe(
      "example.com",
    );
    expect(getUrlHostnameDisplayLabel("http://subdomain.example.com")).toBe(
      "subdomain.example.com",
    );
  });

  test("getUrlHostnameDisplayLabel removes www prefix", async () => {
    const { getUrlHostnameDisplayLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameDisplayLabel("https://www.example.com")).toBe(
      "example.com",
    );
  });

  test("getUrlHostnameDisplayLabel handles invalid URLs", async () => {
    const { getUrlHostnameDisplayLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameDisplayLabel("not-a-url")).toBe("not-a-url");
  });
});

// ─── Favicons ─────────────────────────────────────────────────────────────────

describe("favicons", () => {
  test("getFaviconUrl generates favicon URL", async () => {
    const { getFaviconUrl } = await import("@/app/dashboard/services/favicons");
    const url = getFaviconUrl("https://example.com");
    expect(url).toContain("example.com");
  });

  test("getFaviconUrl handles URLs without protocol", async () => {
    const { getFaviconUrl } = await import("@/app/dashboard/services/favicons");
    const url = getFaviconUrl("example.com");
    expect(typeof url).toBe("string");
    expect(url).toBe("");
  });

  test("getUrlHostnameDisplayLabel extracts clean hostname", async () => {
    const { getUrlHostnameDisplayLabel } = await import("@/lib/utils/url");
    expect(getUrlHostnameDisplayLabel("https://www.example.com")).toBe(
      "example.com",
    );
    expect(getUrlHostnameDisplayLabel("http://blog.example.com")).toBe(
      "blog.example.com",
    );
  });
});
