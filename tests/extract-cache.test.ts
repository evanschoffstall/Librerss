import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const mutableProcessEnv = process.env as Record<string, string | undefined>;

async function clearExtractCache(): Promise<void> {
  const { clearArticleExtractCacheForTests } = await import(
    "@/lib/extract/cache"
  );

  clearArticleExtractCacheForTests();
}

beforeEach(async () => {
  await clearExtractCache();
});

afterEach(async () => {
  await clearExtractCache();
});

// ── extract/cache – cache operations ─────────────────────────────────────────

describe("extract/cache – getCachedExtractPayload and setCachedExtractPayload", () => {
  test("returns null for uncached URL", async () => {
    const { getCachedExtractPayload } = await import("@/lib/extract/cache");
    const result = getCachedExtractPayload("https://not-cached.example.com/a");
    expect(result).toBeNull();
  });

  test("stores and retrieves payload", async () => {
    const { getCachedExtractPayload, setCachedExtractPayload } =
      await import("@/lib/extract/cache");

    const url = `https://cache-test-${Date.now()}.example.com/article`;
    const payload = { content: "<p>Hello</p>", srcUrl: url };

    setCachedExtractPayload(url, payload as any);
    const result = getCachedExtractPayload(url);
    expect(result).not.toBeNull();
    expect((result as any)?.content).toBe("<p>Hello</p>");
  });

  test("returns null for expired entry", async () => {
    const originalDateNow = Date.now;
    try {
      let fakeTime = 1_000_000;
      Date.now = () => fakeTime;

      const { getCachedExtractPayload, setCachedExtractPayload } =
        await import("@/lib/extract/cache");

      const url = `https://expired-test-${fakeTime}.example.com/article`;
      const payload = { content: "<p>Stale</p>", srcUrl: url };

      setCachedExtractPayload(url, payload as any);
      // Advance time past TTL
      fakeTime += 1_000 * 60 * 60 * 25; // 25 hours
      const result = getCachedExtractPayload(url);
      expect(result).toBeNull();
    } finally {
      Date.now = originalDateNow;
    }
  });
});

// ── extract/cache – isExtractCacheEnabled disabled branch ─────────────────────

describe("extract/cache – isExtractCacheEnabled", () => {
  test("returns false when ARTICLE_EXTRACT_CACHE_ENABLED=false", async () => {
    const prev = process.env.ARTICLE_EXTRACT_CACHE_ENABLED;
    try {
      process.env.ARTICLE_EXTRACT_CACHE_ENABLED = "false";
      const { isExtractCacheEnabled } = await import("@/lib/extract/cache");
      const result = isExtractCacheEnabled();
      expect(result).toBe(false);
    } finally {
      if (prev !== undefined) process.env.ARTICLE_EXTRACT_CACHE_ENABLED = prev;
      else delete process.env.ARTICLE_EXTRACT_CACHE_ENABLED;
    }
  });

  test("returns true outside development when the cache is enabled", async () => {
    const prevCacheEnabled = process.env.ARTICLE_EXTRACT_CACHE_ENABLED;
    const prevNodeEnv = process.env.NODE_ENV;

    try {
      process.env.ARTICLE_EXTRACT_CACHE_ENABLED = "true";
      mutableProcessEnv.NODE_ENV = "production";
      const { isExtractCacheEnabled } = await import(
        `@/lib/extract/cache?production-cache=${Date.now()}`
      );
      expect(isExtractCacheEnabled()).toBe(true);
    } finally {
      if (prevCacheEnabled !== undefined) {
        process.env.ARTICLE_EXTRACT_CACHE_ENABLED = prevCacheEnabled;
      } else {
        delete process.env.ARTICLE_EXTRACT_CACHE_ENABLED;
      }

      if (prevNodeEnv !== undefined) {
        mutableProcessEnv.NODE_ENV = prevNodeEnv;
      } else {
        delete mutableProcessEnv.NODE_ENV;
      }
    }
  });

  test("returns false in development when the dev cache flag is disabled", async () => {
    const previousCacheEnabled = process.env.ARTICLE_EXTRACT_CACHE_ENABLED;
    const previousDevEnabled = process.env.ARTICLE_EXTRACT_CACHE_DEV_ENABLED;
    const previousNodeEnv = process.env.NODE_ENV;

    try {
      process.env.ARTICLE_EXTRACT_CACHE_ENABLED = "true";
      process.env.ARTICLE_EXTRACT_CACHE_DEV_ENABLED = "false";
      mutableProcessEnv.NODE_ENV = "development";

      const { isExtractCacheEnabled } = await import(
        `@/lib/extract/cache?dev-cache-disabled=${Date.now()}`
      );

      expect(isExtractCacheEnabled()).toBe(false);
    } finally {
      if (previousCacheEnabled !== undefined) {
        process.env.ARTICLE_EXTRACT_CACHE_ENABLED = previousCacheEnabled;
      } else {
        delete process.env.ARTICLE_EXTRACT_CACHE_ENABLED;
      }

      if (previousDevEnabled !== undefined) {
        process.env.ARTICLE_EXTRACT_CACHE_DEV_ENABLED = previousDevEnabled;
      } else {
        delete process.env.ARTICLE_EXTRACT_CACHE_DEV_ENABLED;
      }

      if (previousNodeEnv !== undefined) {
        mutableProcessEnv.NODE_ENV = previousNodeEnv;
      } else {
        delete mutableProcessEnv.NODE_ENV;
      }
    }
  });

  test("defaults to enabled in development when the dev cache flag is unset", async () => {
    const previousCacheEnabled = process.env.ARTICLE_EXTRACT_CACHE_ENABLED;
    const previousDevEnabled = process.env.ARTICLE_EXTRACT_CACHE_DEV_ENABLED;
    const previousNodeEnv = process.env.NODE_ENV;

    try {
      process.env.ARTICLE_EXTRACT_CACHE_ENABLED = "true";
      delete process.env.ARTICLE_EXTRACT_CACHE_DEV_ENABLED;
      mutableProcessEnv.NODE_ENV = "development";

      const { isExtractCacheEnabled } = await import(
        `@/lib/extract/cache?dev-cache-enabled=${Date.now()}`
      );

      expect(isExtractCacheEnabled()).toBe(true);
    } finally {
      if (previousCacheEnabled !== undefined) {
        process.env.ARTICLE_EXTRACT_CACHE_ENABLED = previousCacheEnabled;
      } else {
        delete process.env.ARTICLE_EXTRACT_CACHE_ENABLED;
      }

      if (previousDevEnabled !== undefined) {
        process.env.ARTICLE_EXTRACT_CACHE_DEV_ENABLED = previousDevEnabled;
      } else {
        delete process.env.ARTICLE_EXTRACT_CACHE_DEV_ENABLED;
      }

      if (previousNodeEnv !== undefined) {
        mutableProcessEnv.NODE_ENV = previousNodeEnv;
      } else {
        delete mutableProcessEnv.NODE_ENV;
      }
    }
  });
});

// ── extract/cache – setCachedExtractPayload capacity eviction ─────────────────

describe("extract/cache – capacity eviction in setCachedExtractPayload", () => {
  test("evicts expired entries when cache is at capacity", async () => {
    const { getCachedExtractPayload, setCachedExtractPayload } =
      await import("@/lib/extract/cache");
    const { ARTICLE_EXTRACT_CACHE_MAX_ENTRIES } =
      await import("@/lib/extract/constants");

    const originalDateNow = Date.now;
    try {
      let fakeTime = 2_000_000_000;
      Date.now = () => fakeTime;

      // Fill cache to capacity with already-expired entries (expire in 1ms)
      for (let i = 0; i < ARTICLE_EXTRACT_CACHE_MAX_ENTRIES; i++) {
        const entryUrl = `https://evict-test-expired-${i}.example.com/`;
        setCachedExtractPayload(entryUrl, { content: `<p>${i}</p>` } as any);
      }

      // Advance time so all entries are expired
      fakeTime += 1_000 * 60 * 60 * 25; // 25 hours past TTL

      // Adding one more should evict an expired entry (not the oldest)
      const newUrl = `https://evict-test-new-${Date.now()}.example.com/`;
      setCachedExtractPayload(newUrl, {
        content: "<p>new</p>",
      } as any);

      // The new entry should be retrievable
      const cached = getCachedExtractPayload(newUrl);
      expect(cached).not.toBeNull();
    } finally {
      Date.now = originalDateNow;
    }
  });

  test("evicts oldest entry when no expired entries exist", async () => {
    const {
      clearArticleExtractCacheForTests,
      getCachedExtractPayload,
      setCachedExtractPayload,
    } = await import("@/lib/extract/cache");
    const { ARTICLE_EXTRACT_CACHE_MAX_ENTRIES } =
      await import("@/lib/extract/constants");

    clearArticleExtractCacheForTests();

    const tag = `cap-${Date.now()}-`;

    // Fill to capacity with fresh (non-expired) entries
    for (let i = 0; i < ARTICLE_EXTRACT_CACHE_MAX_ENTRIES; i++) {
      setCachedExtractPayload(`https://${tag}${i}.example.com/`, {
        content: `<p>${i}</p>`,
      } as any);
    }

    // Add one more – should evict the oldest (first inserted)
    const extraUrl = `https://${tag}extra.example.com/`;
    setCachedExtractPayload(extraUrl, { content: "<p>extra</p>" } as any);

    // New entry is present
    expect(getCachedExtractPayload(extraUrl)).not.toBeNull();
    // First inserted entry was evicted
    expect(getCachedExtractPayload(`https://${tag}0.example.com/`)).toBeNull();
  });
});
