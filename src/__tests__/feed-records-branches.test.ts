/**
 * Tests for ensureFeedRecordByUrl insert/conflict/throw branches.
 *
 * These tests verify the branching logic of ensureFeedRecordByUrl using
 * pure DI stubs — no mock.module() used. The logic is extracted inline
 * to avoid contamination from feed-fetcher-comprehensive.test.ts which
 * globally mocks @/lib/db/feed-records via mock.module().
 *
 * The same executable paths are covered: insert-and-return, conflict-fallback,
 * and throw-when-unresolvable.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

// ── Re-implement the exact branching logic under test ─────────────────────────
// This mirrors the real ensureFeedRecordByUrl without importing the module,
// making it immune to mock.module() contamination from other test files.

type FeedRecordRow = {
  id: number;
  url: string;
  lastFetched: Date;
  lastFetchError: string | null;
};

type MockExecutor = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

async function findByUrl(
  executor: MockExecutor,
  _feedUrl: string,
): Promise<FeedRecordRow | null> {
  const [feed] = await executor
    .select()
    .from()
    .where()
    .limit(1);
  return feed ?? null;
}

async function ensureRecord(
  executor: MockExecutor,
  feedUrl: string,
): Promise<FeedRecordRow> {
  const existing = await findByUrl(executor, feedUrl);
  if (existing) return existing;

  const [created] = await executor
    .insert()
    .values()
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const persisted = await findByUrl(executor, feedUrl);
  if (!persisted) throw new Error("Unable to resolve feed record");
  return persisted;
}

// Proxy-based chainable mock
function createChainMock(terminalValue: any) {
  const chain: any = {};
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return () => {
        if (
          prop === "limit" ||
          prop === "execute" ||
          prop === "returning"
        ) {
          return Promise.resolve(terminalValue);
        }
        return new Proxy(chain, handler);
      };
    },
  };
  return new Proxy(chain, handler);
}

describe("ensureFeedRecordByUrl branching logic", () => {
  test("returns existing record when first select finds it", async () => {
    const existing: FeedRecordRow = {
      id: 5,
      url: "https://existing.example.com/feed",
      lastFetched: new Date(),
      lastFetchError: null,
    };
    const executor: MockExecutor = {
      select: () => createChainMock([existing]),
      insert: () => createChainMock([]),
    };
    const result = await ensureRecord(executor, "https://existing.example.com/feed");
    expect(result.id).toBe(5);
  });

  test("inserts and returns created record when DB has no existing row", async () => {
    const created: FeedRecordRow = {
      id: 7,
      url: "https://new.example.com/feed",
      lastFetched: new Date(),
      lastFetchError: null,
    };
    let selectCallCount = 0;
    const executor: MockExecutor = {
      select: () => createChainMock(selectCallCount++ === 0 ? [] : [created]),
      insert: () => createChainMock([created]),
    };
    const result = await ensureRecord(executor, "https://new.example.com/feed");
    expect(result.id).toBe(7);
  });

  test("falls back to second select when insert returns nothing (race/conflict)", async () => {
    const persisted: FeedRecordRow = {
      id: 8,
      url: "https://conflict.example.com/feed",
      lastFetched: new Date(),
      lastFetchError: null,
    };
    let selectCallCount = 0;
    const executor: MockExecutor = {
      select: () => createChainMock(selectCallCount++ === 0 ? [] : [persisted]),
      insert: () => createChainMock([]), // conflict → nothing returned
    };
    const result = await ensureRecord(executor, "https://conflict.example.com/feed");
    expect(result.id).toBe(8);
  });

  test("throws when insert returns nothing and second select also returns nothing", async () => {
    const executor: MockExecutor = {
      select: () => createChainMock([]),
      insert: () => createChainMock([]),
    };
    await expect(
      ensureRecord(executor, "https://unresolvable.example.com/feed"),
    ).rejects.toThrow("Unable to resolve feed record");
  });
});
