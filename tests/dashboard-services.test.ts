/**
 * Component Tests: Dashboard Services
 * Tests for src/app/dashboard/services/
 */

import { describe, expect, test } from "bun:test";

// ─── Article Content Services ─────────────────────────────────────────────────

describe("article-content services", () => {
  test("getUrlHostnameLabel extracts hostname", async () => {
    const { getUrlHostnameLabel } =
      await import("@/app/dashboard/services/article-content");
    expect(getUrlHostnameLabel("https://www.example.com/path")).toBe(
      "example.com",
    );
    expect(getUrlHostnameLabel("http://subdomain.example.com")).toBe(
      "subdomain.example.com",
    );
  });

  test("getUrlHostnameLabel removes www prefix", async () => {
    const { getUrlHostnameLabel } =
      await import("@/app/dashboard/services/article-content");
    expect(getUrlHostnameLabel("https://www.example.com")).toBe("example.com");
  });

  test("getUrlHostnameLabel handles invalid URLs", async () => {
    const { getUrlHostnameLabel } =
      await import("@/app/dashboard/services/article-content");
    expect(getUrlHostnameLabel("not-a-url")).toBe("not-a-url");
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

  test("getHostnameLabel extracts clean hostname", async () => {
    const { getHostnameLabel } =
      await import("@/app/dashboard/services/favicons");
    expect(getHostnameLabel("https://www.example.com")).toBe("example.com");
    expect(getHostnameLabel("http://blog.example.com")).toBe(
      "blog.example.com",
    );
  });
});
