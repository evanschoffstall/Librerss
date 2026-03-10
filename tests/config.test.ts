import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { CONFIG, ENV } from "@/lib/config";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

// ── lib/config – envBooleanOptional ──────────────────────────────────────────

describe("lib/config – envBooleanOptional", () => {
  test("returns defaultValue when env var is missing", async () => {
    const { envBooleanOptional } = await import("@/lib/config");
    const prev = process.env.SOME_MISSING_KEY_XYZ;
    delete process.env.SOME_MISSING_KEY_XYZ;
    try {
      expect(envBooleanOptional("SOME_MISSING_KEY_XYZ", true)).toBe(true);
      expect(envBooleanOptional("SOME_MISSING_KEY_XYZ", false)).toBe(false);
    } finally {
      if (prev !== undefined) process.env.SOME_MISSING_KEY_XYZ = prev;
    }
  });

  test("returns false when env var is '0'", async () => {
    const { envBooleanOptional } = await import("@/lib/config");
    process.env.TEST_BOOL_OPT_KEY = "0";
    try {
      expect(envBooleanOptional("TEST_BOOL_OPT_KEY", true)).toBe(false);
    } finally {
      delete process.env.TEST_BOOL_OPT_KEY;
    }
  });

  test("returns true when env var is 'yes'", async () => {
    const { envBooleanOptional } = await import("@/lib/config");
    process.env.TEST_BOOL_OPT_YES = "yes";
    try {
      expect(envBooleanOptional("TEST_BOOL_OPT_YES", false)).toBe(true);
    } finally {
      delete process.env.TEST_BOOL_OPT_YES;
    }
  });
});

// ── lib/config – error paths and NEXT_PUBLIC client accessors ────────────────

describe("lib/config – error throws from missing / invalid env vars", () => {
  test("accessing missing numeric key throws 'Missing required'", async () => {
    const { CONFIG } = await import("@/lib/config");
    const key = "COVERAGE_TEST_MISSING_NUM_KEY_XYZ";
    const prev = process.env[key];
    delete process.env[key];
    try {
      expect(() => (CONFIG as any)[key]).toThrow(
        "Missing required environment variable",
      );
    } finally {
      if (prev !== undefined) process.env[key] = prev;
    }
  });

  test("accessing invalid numeric key throws 'Invalid numeric'", async () => {
    const { CONFIG } = await import("@/lib/config");
    const key = "COVERAGE_TEST_BAD_NUM_KEY_XYZ";
    process.env[key] = "not_a_number";
    try {
      expect(() => (CONFIG as any)[key]).toThrow(
        "Invalid numeric environment variable",
      );
    } finally {
      delete process.env[key];
    }
  });

  test("accessing invalid boolean _ENABLED key throws 'Invalid boolean'", async () => {
    const { CONFIG } = await import("@/lib/config");
    const key = "COVERAGE_TEST_BAD_BOOL_ENABLED";
    process.env[key] = "not_a_bool";
    try {
      expect(() => (CONFIG as any)[key]).toThrow(
        "Invalid boolean environment variable",
      );
    } finally {
      delete process.env[key];
    }
  });

  test("accessing valid boolean _ENABLED key returns boolean", async () => {
    const { CONFIG } = await import("@/lib/config");
    const key = "COVERAGE_TEST_FOOBAR_ENABLED";
    process.env[key] = "true";
    try {
      expect((CONFIG as any)[key]).toBe(true);
    } finally {
      delete process.env[key];
    }
  });
});

describe("lib/config – NEXT_PUBLIC client accessors", () => {
  test("clientFeedCacheTtlMinutes parses numeric env var", async () => {
    const { clientFeedCacheTtlMinutes } = await import("@/lib/config");
    process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES = "42";
    try {
      expect(clientFeedCacheTtlMinutes()).toBe(42);
    } finally {
      delete process.env.NEXT_PUBLIC_FEED_CACHE_TTL_MINUTES;
    }
  });

  test("clientFeedRefreshDiagnosticsEnabled parses boolean env var", async () => {
    const { clientFeedRefreshDiagnosticsEnabled } =
      await import("@/lib/config");
    process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED = "true";
    try {
      expect(clientFeedRefreshDiagnosticsEnabled()).toBe(true);
    } finally {
      delete process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED;
    }
  });

  test("maxArticleConsecutiveBlankLines uses NEXT_PUBLIC when set", async () => {
    const { maxArticleConsecutiveBlankLines } = await import("@/lib/config");
    process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES = "7";
    try {
      expect(maxArticleConsecutiveBlankLines()).toBe(7);
    } finally {
      delete process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;
    }
  });
});

// ── lib/config – missing env-var branches ─────────────────────────────────────

describe("lib/config – env var access patterns", () => {
  test("CONFIG.PASSWORD_MAX_LENGTH is a finite number", async () => {
    const { CONFIG } = await import("@/lib/config");
    expect(Number.isFinite(CONFIG.PASSWORD_MAX_LENGTH)).toBe(true);
    expect(CONFIG.PASSWORD_MAX_LENGTH).toBeGreaterThan(0);
  });

  test("CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES is defined", async () => {
    const { CONFIG } = await import("@/lib/config");
    expect(CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES).toBeGreaterThan(0);
  });
});

// ── lib/config – envEnum throws on invalid value + maxArticleConsecutiveBlankLines ──

describe("lib/config – envEnum and maxArticleConsecutiveBlankLines branches", () => {
  test("maxArticleConsecutiveBlankLines uses server env when NEXT_PUBLIC var is unset", async () => {
    const savedClient =
      process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;
    const savedServer = process.env.MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;
    try {
      delete process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;
      process.env.MAX_ARTICLE_CONSECUTIVE_BLANK_LINES = "3";
      const { maxArticleConsecutiveBlankLines } = await import("@/lib/config");
      const result = maxArticleConsecutiveBlankLines();
      expect(result).toBe(3);
    } finally {
      if (savedClient !== undefined)
        process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES =
          savedClient;
      else delete process.env.NEXT_PUBLIC_MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;
      if (savedServer !== undefined)
        process.env.MAX_ARTICLE_CONSECUTIVE_BLANK_LINES = savedServer;
      else delete process.env.MAX_ARTICLE_CONSECUTIVE_BLANK_LINES;
    }
  });

  test("envEnum throws when LOG_LEVEL env var is invalid", async () => {
    const savedLevel = process.env.LOG_LEVEL;
    try {
      process.env.LOG_LEVEL = "nonsense-invalid-value";
      const { CONFIG } = await import("@/lib/config");
      expect(() => CONFIG.LOG_LEVEL).toThrow(/Invalid environment variable/);
    } finally {
      if (savedLevel !== undefined) process.env.LOG_LEVEL = savedLevel;
      else delete process.env.LOG_LEVEL;
    }
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
