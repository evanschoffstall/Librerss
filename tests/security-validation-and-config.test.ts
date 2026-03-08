import { CONFIG, ENV } from "@/lib/config";
import {
  isBlockedHost,
  isBlockedResolvedAddress,
  normalizeHostname,
} from "@/lib/utils/ssrf";
import { isSafePositiveItemId, isStrongPassword } from "@/lib/utils/validation";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("ssrf", () => {
  test("normalizeHostname lowercases and trims", () => {
    expect(normalizeHostname("  EXAMPLE.COM.  ")).toBe("example.com");
  });

  test("isBlockedHost blocks localhost", () => {
    expect(isBlockedHost("localhost")).toBe(true);
  });

  test("isBlockedHost blocks 127.0.0.1", () => {
    expect(isBlockedHost("127.0.0.1")).toBe(true);
  });

  test("isBlockedHost blocks 10.x.x.x", () => {
    expect(isBlockedHost("10.0.0.1")).toBe(true);
  });

  test("isBlockedHost blocks 192.168.x.x", () => {
    expect(isBlockedHost("192.168.1.1")).toBe(true);
  });

  test("isBlockedHost blocks 169.254.x.x", () => {
    expect(isBlockedHost("169.254.169.254")).toBe(true);
  });

  test("isBlockedHost blocks 172.16-31.x.x", () => {
    expect(isBlockedHost("172.16.0.1")).toBe(true);
    expect(isBlockedHost("172.31.255.255")).toBe(true);
  });

  test("isBlockedHost allows 172.32.x.x", () => {
    expect(isBlockedHost("172.32.0.1")).toBe(false);
  });

  test("isBlockedHost blocks ::1", () => {
    expect(isBlockedHost("::1")).toBe(true);
  });

  test("isBlockedHost blocks .local domains", () => {
    expect(isBlockedHost("myhost.local")).toBe(true);
  });

  test("isBlockedHost allows public domains", () => {
    expect(isBlockedHost("example.com")).toBe(false);
    expect(isBlockedHost("google.com")).toBe(false);
  });

  test("isBlockedHost blocks 0.0.0.0", () => {
    expect(isBlockedHost("0.0.0.0")).toBe(true);
  });

  test("isBlockedHost blocks empty hostname", () => {
    expect(isBlockedHost("")).toBe(true);
  });

  test("isBlockedResolvedAddress handles IPv4-mapped IPv6", () => {
    expect(isBlockedResolvedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedResolvedAddress("::ffff:8.8.8.8")).toBe(false);
  });

  test("isBlockedResolvedAddress blocks IPv4-mapped IPv6 with hex tail for private/loopback ranges", () => {
    expect(isBlockedResolvedAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedResolvedAddress("::ffff:c0a8:101")).toBe(true);
    expect(isBlockedResolvedAddress("::ffff:0808:0808")).toBe(false);
  });

  test("isBlockedResolvedAddress blocks fc addresses", () => {
    expect(isBlockedHost("fc00::1")).toBe(true);
  });

  test("isBlockedResolvedAddress blocks fd addresses", () => {
    expect(isBlockedHost("fd12::1")).toBe(true);
  });

  test("isBlockedResolvedAddress blocks fe80 link-local", () => {
    expect(isBlockedHost("fe80::1")).toBe(true);
  });
});

// ─── validation.ts ────────────────────────────────────────────────────────────

describe("validation – isSafePositiveItemId", () => {
  test("accepts positive integer", () => {
    expect(isSafePositiveItemId(1)).toBe(true);
    expect(isSafePositiveItemId(42)).toBe(true);
  });

  test("rejects zero", () => {
    expect(isSafePositiveItemId(0)).toBe(false);
  });

  test("rejects negative", () => {
    expect(isSafePositiveItemId(-1)).toBe(false);
  });

  test("rejects float", () => {
    expect(isSafePositiveItemId(1.5)).toBe(false);
  });

  test("rejects string", () => {
    expect(isSafePositiveItemId("42")).toBe(false);
  });

  test("rejects null/undefined", () => {
    expect(isSafePositiveItemId(null)).toBe(false);
    expect(isSafePositiveItemId(undefined)).toBe(false);
  });

  test("rejects Infinity", () => {
    expect(isSafePositiveItemId(Infinity)).toBe(false);
  });

  test("rejects NaN", () => {
    expect(isSafePositiveItemId(NaN)).toBe(false);
  });

  test("rejects beyond MAX_SAFE_INTEGER", () => {
    expect(isSafePositiveItemId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  test("accepts MAX_SAFE_INTEGER", () => {
    expect(isSafePositiveItemId(Number.MAX_SAFE_INTEGER)).toBe(true);
  });
});

describe("validation – isStrongPassword", () => {
  test("accepts strong password", () => {
    expect(isStrongPassword("MyP@ss123")).toBe(true);
  });

  test("rejects short password", () => {
    expect(isStrongPassword("Aa1!")).toBe(false);
  });

  test("rejects password with only lowercase", () => {
    expect(isStrongPassword("abcdefgh")).toBe(false);
  });

  test("accepts password with 3 of 4 types", () => {
    expect(isStrongPassword("MyPass123")).toBe(true); // upper + lower + digit
    expect(isStrongPassword("mypass1!")).toBe(true); // lower + digit + special
  });

  test("rejects null", () => {
    expect(isStrongPassword(null as any)).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isStrongPassword("")).toBe(false);
  });

  test("rejects overlong password", () => {
    expect(isStrongPassword("A1!" + "a".repeat(1025))).toBe(false);
  });
});

// ─── reader-api.ts ────────────────────────────────────────────────────────────

describe("config", () => {
  test("CONFIG has required keys", () => {
    expect(CONFIG.FEED_CACHE_TTL_MINUTES).toBeGreaterThan(0);
    expect(CONFIG.MAX_ARTICLE_CONTENT_LENGTH).toBeGreaterThan(0);
    expect(CONFIG.MAX_ARTICLE_TITLE_LENGTH).toBeGreaterThan(0);
    expect(CONFIG.PASSWORD_MIN_LENGTH).toBeGreaterThan(0);
    expect(CONFIG.SESSION_DURATION_DAYS).toBeGreaterThan(0);
    expect(CONFIG.OPML_MAX_IMPORT_ENTRIES).toBeGreaterThan(0);
  });

  test("CONFIG.LOG_LEVEL is a valid level", () => {
    expect(["none", "error", "warn", "info", "verbose"]).toContain(
      CONFIG.LOG_LEVEL,
    );
  });

  test("CONFIG rate limit values are positive", () => {
    expect(CONFIG.RATE_LIMIT_LOGIN_WINDOW_MS).toBeGreaterThan(0);
    expect(CONFIG.RATE_LIMIT_LOGIN_MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(CONFIG.RATE_LIMIT_SIGNUP_WINDOW_MS).toBeGreaterThan(0);
    expect(CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS).toBeGreaterThan(0);
  });

  test("CONFIG GReader values are consistent", () => {
    expect(CONFIG.GREADER_MAX_STREAM_ITEMS).toBeGreaterThan(0);
    expect(CONFIG.GREADER_DEFAULT_STREAM_ITEMS).toBeGreaterThan(0);
    expect(CONFIG.GREADER_DEFAULT_STREAM_ITEMS).toBeLessThanOrEqual(
      CONFIG.GREADER_MAX_STREAM_ITEMS,
    );
  });

  test("ENV flags are booleans", () => {
    expect(typeof ENV.isDevelopment).toBe("boolean");
  });
});
