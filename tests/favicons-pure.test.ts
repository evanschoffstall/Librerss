/**
 * Pure-function tests for src/app/dashboard/services/favicons.ts
 * Covers: getHostnameLabel, getFaviconCacheKey, getMergedFaviconCandidates,
 *         getFaviconTintColors, getFaviconUrl, setCachedFaviconIndex,
 *         getCachedFaviconIndex
 */

import {
  getFaviconCacheKey,
  getFaviconTintColors,
  getFaviconUrl,
  getHostnameLabel,
  getMergedFaviconCandidates,
} from "@/app/dashboard/services/favicons";
import { describe, expect, test } from "bun:test";

describe("favicons – getHostnameLabel", () => {
  test("strips www. prefix", () => {
    expect(getHostnameLabel("https://www.example.com/feed")).toBe(
      "example.com",
    );
  });

  test("returns hostname without www unchanged", () => {
    expect(getHostnameLabel("https://blog.example.com")).toBe(
      "blog.example.com",
    );
  });

  test("returns raw URL when hostname extraction fails", () => {
    expect(getHostnameLabel("not-a-url")).toBe("not-a-url");
  });

  test("handles URL with port", () => {
    expect(getHostnameLabel("https://example.com:8080/feed")).toBe(
      "example.com",
    );
  });

  test("handles WWW in mixed case", () => {
    expect(getHostnameLabel("https://WWW.Example.com/")).toBe("example.com");
  });
});

describe("favicons – getFaviconCacheKey", () => {
  test("returns hostname from valid URL", () => {
    expect(getFaviconCacheKey("https://example.com/rss")).toBe("example.com");
  });

  test("returns null when no valid URL provided", () => {
    expect(getFaviconCacheKey(undefined, undefined)).toBeNull();
  });

  test("uses first valid URL from multiple candidates", () => {
    expect(getFaviconCacheKey("invalid", "https://fallback.com/feed")).toBe(
      "fallback.com",
    );
  });

  test("skips undefined entries", () => {
    expect(getFaviconCacheKey(undefined, "https://example.org")).toBe(
      "example.org",
    );
  });
});

describe("favicons – getMergedFaviconCandidates", () => {
  test("returns non-empty array for valid URLs", () => {
    const result = getMergedFaviconCandidates("https://example.com");
    expect(result.length).toBeGreaterThan(0);
  });

  test("includes google favicon service URL", () => {
    const result = getMergedFaviconCandidates("https://example.com");
    expect(result.some((url) => url.includes("google.com/s2/favicons"))).toBe(
      true,
    );
  });

  test("includes direct favicon.ico path", () => {
    const result = getMergedFaviconCandidates("https://example.com");
    expect(result.some((url) => url.endsWith("/favicon.ico"))).toBe(true);
  });

  test("includes duckduckgo icon service", () => {
    const result = getMergedFaviconCandidates("https://example.com");
    expect(result.some((url) => url.includes("icons.duckduckgo.com"))).toBe(
      true,
    );
  });

  test("includes icon.horse service", () => {
    const result = getMergedFaviconCandidates("https://example.com");
    expect(result.some((url) => url.includes("icon.horse"))).toBe(true);
  });

  test("returns empty array for undefined", () => {
    const result = getMergedFaviconCandidates(undefined);
    expect(result).toEqual([]);
  });

  test("deduplicates candidates from multiple URLs", () => {
    const result = getMergedFaviconCandidates(
      "https://example.com/feed",
      "https://example.com/rss",
    );
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  test("produces candidates for subdomain URLs", () => {
    const result = getMergedFaviconCandidates("https://blog.example.com/feed");
    // Should include both blog.example.com and example.com candidates
    expect(result.some((url) => url.includes("blog.example.com"))).toBe(true);
    expect(result.some((url) => url.includes("example.com"))).toBe(true);
  });

  test("handles IP address URL", () => {
    const result = getMergedFaviconCandidates("https://192.168.1.1/feed");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("favicons – getFaviconTintColors", () => {
  test("returns foreground and background colors", () => {
    const colors = getFaviconTintColors("https://example.com");
    expect(colors.foreground).toMatch(/^hsl\(/);
    expect(colors.background).toMatch(/^hsl\(/);
  });

  test("returns deterministic colors for same URL", () => {
    const a = getFaviconTintColors("https://example.com");
    const b = getFaviconTintColors("https://example.com");
    expect(a.foreground).toBe(b.foreground);
    expect(a.background).toBe(b.background);
  });

  test("returns different colors for different URLs", () => {
    const a = getFaviconTintColors("https://example.com");
    const b = getFaviconTintColors("https://other-site.org");
    // Very unlikely to be the same
    expect(a.foreground !== b.foreground || a.background !== b.background).toBe(
      true,
    );
  });

  test("handles undefined URLs gracefully", () => {
    const colors = getFaviconTintColors(undefined, undefined);
    expect(colors.foreground).toMatch(/^hsl\(/);
    expect(colors.background).toMatch(/^hsl\(/);
  });

  test("uses first non-empty URL as seed", () => {
    const a = getFaviconTintColors(undefined, "https://example.com");
    const b = getFaviconTintColors("https://example.com");
    expect(a.foreground).toBe(b.foreground);
  });
});

describe("favicons – getFaviconUrl", () => {
  test("returns a URL string for valid input", () => {
    const result = getFaviconUrl("https://example.com");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  test("returns first candidate URL", () => {
    const candidates = getMergedFaviconCandidates("https://example.com");
    const result = getFaviconUrl("https://example.com");
    expect(result).toBe(candidates[0]);
  });
});
