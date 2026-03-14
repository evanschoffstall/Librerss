import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { clearClientOriginState } from "@/lib";

describe("clearClientOriginState", () => {
  const originalCaches = globalThis.caches;
  const originalIndexedDb = globalThis.indexedDB;
  const originalLocalStorageClear = window.localStorage.clear;
  const originalSessionStorageClear = window.sessionStorage.clear;

  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: originalCaches,
      writable: true,
    });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: originalIndexedDb,
      writable: true,
    });
    Object.defineProperty(window.localStorage, "clear", {
      configurable: true,
      value: originalLocalStorageClear,
      writable: true,
    });
    Object.defineProperty(window.sessionStorage, "clear", {
      configurable: true,
      value: originalSessionStorageClear,
      writable: true,
    });
  });

  test("clears origin-scoped browser storage surfaces", async () => {
    const localStorageClear = mock(() => {});
    const sessionStorageClear = mock(() => {});
    const cacheDelete = mock(async (_cacheName: string) => true);
    const cacheKeys = mock(async () => ["alpha", "beta"]);
    const indexedDbDatabases = mock(async () => [
      { name: "feed-cache" },
      { name: "ui-state" },
      {},
    ]);
    const deleteDatabase = mock((databaseName: string) => {
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => {
        request.onsuccess?.(new Event("success") as Event);
      });
      expect(["feed-cache", "ui-state"]).toContain(databaseName);
      return request;
    });

    Object.defineProperty(window.localStorage, "clear", {
      configurable: true,
      value: localStorageClear,
      writable: true,
    });
    Object.defineProperty(window.sessionStorage, "clear", {
      configurable: true,
      value: sessionStorageClear,
      writable: true,
    });
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: { delete: cacheDelete, keys: cacheKeys },
      writable: true,
    });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: { databases: indexedDbDatabases, deleteDatabase },
      writable: true,
    });

    await clearClientOriginState();

    expect(localStorageClear).toHaveBeenCalledTimes(1);
    expect(sessionStorageClear).toHaveBeenCalledTimes(1);
    expect(cacheKeys).toHaveBeenCalledTimes(1);
    expect(cacheDelete).toHaveBeenCalledTimes(2);
    expect(indexedDbDatabases).toHaveBeenCalledTimes(1);
    expect(deleteDatabase).toHaveBeenCalledTimes(2);
  });

  test("returns without failing when cache and indexeddb enumeration are unavailable", async () => {
    const localStorageClear = mock(() => {});
    const sessionStorageClear = mock(() => {});

    Object.defineProperty(window.localStorage, "clear", {
      configurable: true,
      value: localStorageClear,
      writable: true,
    });
    Object.defineProperty(window.sessionStorage, "clear", {
      configurable: true,
      value: sessionStorageClear,
      writable: true,
    });
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: {},
      writable: true,
    });

    await clearClientOriginState();

    expect(localStorageClear).toHaveBeenCalledTimes(1);
    expect(sessionStorageClear).toHaveBeenCalledTimes(1);
  });
});
