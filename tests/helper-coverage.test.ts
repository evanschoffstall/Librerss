import { describe, expect, test } from "bun:test";

import {
  getFaviconCacheKey,
  getFaviconTintColors,
  getFaviconUrl,
  getMergedFaviconCandidates,
} from "@/app/dashboard/services/favicons";
import { asTrimmedString, getSearchParams } from "@/lib/api/http/request";
import { isBlockedHost, isBlockedResolvedAddress, normalizeHostname } from "@/lib/utils/ssrf";
import {
  getUrlHostnameDisplayLabel,
  isValidUrl,
  tryGetUrlHostname,
} from "@/lib/utils/url";

describe("helper coverage – request helpers", () => {
  test("asTrimmedString trims normal strings", () => {
    expect(asTrimmedString("  hello  ")).toBe("hello");
  });

  test("asTrimmedString returns empty string for non-strings", () => {
    expect(asTrimmedString(42)).toBe("");
    expect(asTrimmedString(null)).toBe("");
    expect(asTrimmedString(undefined)).toBe("");
  });

  test("getSearchParams returns parsed query entries", () => {
    const params = getSearchParams(
      new Request("https://example.com/path?alpha=1&beta=two"),
    );
    expect(params.get("alpha")).toBe("1");
    expect(params.get("beta")).toBe("two");
  });

  test("getSearchParams handles repeated query keys", () => {
    const params = getSearchParams(
      new Request("https://example.com/path?tag=a&tag=b"),
    );
    expect(params.getAll("tag")).toEqual(["a", "b"]);
  });

  test("getSearchParams returns an empty collection when there is no query", () => {
    const params = getSearchParams(new Request("https://example.com/path"));
    expect([...params.entries()]).toEqual([]);
  });

  test("getSearchParams preserves URL encoding semantics", () => {
    const params = getSearchParams(
      new Request("https://example.com/path?q=hello%20world&plus=a+b"),
    );
    expect(params.get("q")).toBe("hello world");
    expect(params.get("plus")).toBe("a b");
  });

  test("getSearchParams handles empty values and bare keys", () => {
    const params = getSearchParams(
      new Request("https://example.com/path?empty=&bare"),
    );
    expect(params.get("empty")).toBe("");
    expect(params.get("bare")).toBe("");
  });
});

describe("helper coverage – SSRF normalization", () => {
  test("normalizeHostname trims, lowercases, and strips a trailing dot", () => {
    expect(normalizeHostname(" Example.COM. ")).toBe("example.com");
  });

  test("normalizeHostname unwraps bracketed IPv6 hostnames", () => {
    expect(normalizeHostname("[::1]")).toBe("::1");
  });

  test("isBlockedHost blocks local-network IPv4 addresses", () => {
    expect(isBlockedHost("192.168.0.10")).toBe(true);
    expect(isBlockedHost("172.20.1.5")).toBe(true);
    expect(isBlockedHost("10.0.0.7")).toBe(true);
  });

  test("isBlockedHost blocks loopback and link-local addresses", () => {
    expect(isBlockedHost("127.0.0.1")).toBe(true);
    expect(isBlockedHost("169.254.169.254")).toBe(true);
    expect(isBlockedHost("::1")).toBe(true);
    expect(isBlockedHost("fe80::1")).toBe(true);
  });

  test("isBlockedHost allows public domains and IPs", () => {
    expect(isBlockedHost("example.com")).toBe(false);
    expect(isBlockedHost("8.8.8.8")).toBe(false);
  });

  test("isBlockedHost blocks localhost-style names and empty input", () => {
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("printer.local")).toBe(true);
    expect(isBlockedHost("")).toBe(true);
  });

  test("isBlockedHost blocks IPv6 ULA ranges", () => {
    expect(isBlockedHost("fc00::1")).toBe(true);
    expect(isBlockedHost("fd12::beef")).toBe(true);
  });

  test("isBlockedHost blocks special IPv4 ranges beyond RFC1918", () => {
    expect(isBlockedHost("0.0.0.0")).toBe(true);
    expect(isBlockedHost("100.64.0.1")).toBe(true);
    expect(isBlockedHost("198.18.0.1")).toBe(true);
  });

  test("isBlockedHost blocks reserved metadata-style addresses", () => {
    expect(isBlockedHost("168.63.129.16")).toBe(true);
    expect(isBlockedHost("192.0.0.5")).toBe(true);
  });

  test("isBlockedResolvedAddress handles mapped IPv4 and invalid IPv6 safely", () => {
    expect(isBlockedResolvedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedResolvedAddress("::ffff:8.8.8.8")).toBe(false);
    expect(isBlockedResolvedAddress("2001::db8::1")).toBe(false);
  });

  test("isBlockedResolvedAddress handles hex-tail mapped IPv4 values", () => {
    expect(isBlockedResolvedAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedResolvedAddress("::ffff:0808:0808")).toBe(false);
  });

  test("isBlockedResolvedAddress rejects malformed mapped IPv4 dotted quads", () => {
    expect(isBlockedResolvedAddress("::ffff:127.0.0.999")).toBe(false);
    expect(isBlockedResolvedAddress("::ffff:127.0.0")).toBe(false);
  });

  test("isBlockedResolvedAddress blocks IPv6 link-local and ULA hosts directly", () => {
    expect(isBlockedResolvedAddress("fe80::1")).toBe(true);
    expect(isBlockedResolvedAddress("fc00::1234")).toBe(true);
  });

  test("isBlockedResolvedAddress allows ordinary public IPv6 addresses", () => {
    expect(isBlockedResolvedAddress("2001:4860:4860::8888")).toBe(false);
  });
});

describe("helper coverage – URL utilities", () => {
  test("isValidUrl accepts http and https URLs", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://example.com/path")).toBe(true);
  });

  test("isValidUrl rejects malformed inputs", () => {
    expect(isValidUrl("not-a-url")).toBe(false);
    expect(isValidUrl("javascript:alert(1)")).toBe(false);
  });

  test("isValidUrl accepts localhost and intranet HTTP URLs syntactically", () => {
    expect(isValidUrl("http://localhost:3000/test")).toBe(true);
    expect(isValidUrl("http://intranet/path")).toBe(true);
  });

  test("isValidUrl rejects empty strings", () => {
    expect(isValidUrl("")).toBe(false);
  });

  test("tryGetUrlHostname returns the hostname when parsing succeeds", () => {
    expect(tryGetUrlHostname("https://blog.example.com/feed")).toBe(
      "blog.example.com",
    );
  });

  test("tryGetUrlHostname returns null for invalid URLs", () => {
    expect(tryGetUrlHostname("invalid")).toBeNull();
  });

  test("tryGetUrlHostname keeps ports out of the hostname", () => {
    expect(tryGetUrlHostname("https://example.com:8443/feed")).toBe(
      "example.com",
    );
  });

  test("tryGetUrlHostname lowercases hostnames consistently", () => {
    expect(tryGetUrlHostname("https://WWW.Example.COM/feed")).toBe(
      "www.example.com",
    );
  });

  test("tryGetUrlHostname supports IP-address hosts", () => {
    expect(tryGetUrlHostname("http://127.0.0.1:8080/app")).toBe("127.0.0.1");
  });

  test("getUrlHostnameDisplayLabel strips the www prefix", () => {
    expect(getUrlHostnameDisplayLabel("https://www.example.com/feed")).toBe(
      "example.com",
    );
  });

  test("getUrlHostnameDisplayLabel preserves subdomains", () => {
    expect(getUrlHostnameDisplayLabel("https://blog.example.com/feed")).toBe(
      "blog.example.com",
    );
  });

  test("getUrlHostnameDisplayLabel returns the raw value when parsing fails", () => {
    expect(getUrlHostnameDisplayLabel("not-a-url")).toBe("not-a-url");
  });

  test("getUrlHostnameDisplayLabel strips the www prefix even with ports", () => {
    expect(getUrlHostnameDisplayLabel("https://www.example.com:8443/feed")).toBe(
      "example.com",
    );
  });

  test("getUrlHostnameDisplayLabel preserves IP-address hosts", () => {
    expect(getUrlHostnameDisplayLabel("http://127.0.0.1:8080/app")).toBe(
      "127.0.0.1",
    );
  });
});

describe("helper coverage – favicon helpers", () => {
  test("getFaviconCacheKey returns the first valid hostname", () => {
    expect(getFaviconCacheKey("invalid", "https://example.com/feed")).toBe(
      "example.com",
    );
  });

  test("getFaviconCacheKey returns null when no URL is valid", () => {
    expect(getFaviconCacheKey(undefined, "invalid")).toBeNull();
  });

  test("getFaviconCacheKey skips empty candidates until it finds a hostname", () => {
    expect(
      getFaviconCacheKey(undefined, "", "https://sub.example.com/feed"),
    ).toBe("sub.example.com");
  });

  test("getMergedFaviconCandidates returns direct and provider candidates", () => {
    const candidates = getMergedFaviconCandidates("https://example.com/feed");
    expect(candidates.some((candidate) => candidate.includes("google.com/s2/favicons"))).toBe(true);
    expect(candidates.some((candidate) => candidate.endsWith("/favicon.ico"))).toBe(true);
  });

  test("getMergedFaviconCandidates returns an empty list for missing URLs", () => {
    expect(getMergedFaviconCandidates(undefined)).toEqual([]);
  });

  test("getMergedFaviconCandidates keeps protocol-specific direct origins", () => {
    const candidates = getMergedFaviconCandidates("http://example.com/feed");
    expect(candidates.some((candidate) => candidate.startsWith("http://example.com/"))).toBe(true);
  });

  test("getMergedFaviconCandidates includes apple-touch static icons", () => {
    const candidates = getMergedFaviconCandidates("https://example.com/feed");
    expect(candidates.some((candidate) => candidate.endsWith("/apple-touch-icon.png"))).toBe(true);
    expect(
      candidates.some((candidate) =>
        candidate.endsWith("/apple-touch-icon-precomposed.png"),
      ),
    ).toBe(true);
  });

  test("getMergedFaviconCandidates deduplicates repeated hosts", () => {
    const candidates = getMergedFaviconCandidates(
      "https://example.com/feed",
      "https://example.com/rss",
    );
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  test("getMergedFaviconCandidates includes registrable-host fallbacks for subdomains", () => {
    const candidates = getMergedFaviconCandidates("https://news.blog.example.com/feed");
    expect(candidates.some((candidate) => candidate.includes("news.blog.example.com"))).toBe(true);
    expect(candidates.some((candidate) => candidate.includes("blog.example.com"))).toBe(true);
    expect(candidates.some((candidate) => candidate.includes("example.com"))).toBe(true);
  });

  test("getMergedFaviconCandidates includes www host candidates when needed", () => {
    const candidates = getMergedFaviconCandidates("https://example.com/feed");
    expect(candidates.some((candidate) => candidate.includes("www.example.com"))).toBe(true);
  });

  test("getMergedFaviconCandidates does not duplicate identical static paths", () => {
    const candidates = getMergedFaviconCandidates(
      "https://example.com/feed",
      "https://www.example.com/feed",
    );
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  test("getMergedFaviconCandidates includes icon.horse provider URLs", () => {
    const candidates = getMergedFaviconCandidates("https://example.com/feed");
    expect(candidates.some((candidate) => candidate.includes("icon.horse/icon/example.com"))).toBe(true);
  });

  test("getMergedFaviconCandidates handles IPv4 and single-label hosts", () => {
    const ipCandidates = getMergedFaviconCandidates("http://127.0.0.1/app");
    const intranetCandidates = getMergedFaviconCandidates("http://intranet");
    expect(ipCandidates.length).toBeGreaterThan(0);
    expect(intranetCandidates.length).toBeGreaterThan(0);
  });

  test("getFaviconUrl returns the first merged candidate", () => {
    const candidates = getMergedFaviconCandidates("https://example.com/feed");
    expect(getFaviconUrl("https://example.com/feed")).toBe(candidates[0]);
  });

  test("getFaviconUrl returns an empty string when there are no candidates", () => {
    expect(getFaviconUrl("")).toBe("");
  });

  test("getFaviconTintColors is deterministic for the same seed", () => {
    const first = getFaviconTintColors("https://example.com/feed");
    const second = getFaviconTintColors("https://example.com/feed");
    expect(first).toEqual(second);
  });

  test("getFaviconTintColors varies across different hosts", () => {
    const first = getFaviconTintColors("https://example.com/feed");
    const second = getFaviconTintColors("https://other.example/feed");
    expect(
      first.foreground !== second.foreground ||
        first.background !== second.background,
    ).toBe(true);
  });

  test("getFaviconTintColors still returns colors for missing URLs", () => {
    const colors = getFaviconTintColors(undefined, undefined);
    expect(colors.foreground.startsWith("hsl(")).toBe(true);
    expect(colors.background.startsWith("hsl(")).toBe(true);
  });

  test("getFaviconTintColors uses the first defined URL as the seed", () => {
    expect(
      getFaviconTintColors(undefined, "https://example.com/feed"),
    ).toEqual(getFaviconTintColors("https://example.com/feed"));
  });

  test("getFaviconTintColors returns HSL strings for different seeds", () => {
    const one = getFaviconTintColors("https://one.example/feed");
    const two = getFaviconTintColors("https://two.example/feed");
    expect(one.foreground.startsWith("hsl(")).toBe(true);
    expect(two.background.startsWith("hsl(")).toBe(true);
  });

  test("getFaviconTintColors returns different values for unrelated hosts", () => {
    const one = getFaviconTintColors("https://alpha.example/feed");
    const two = getFaviconTintColors("https://beta.example/feed");
    expect(one).not.toEqual(two);
  });
});