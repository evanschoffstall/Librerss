/**
 * Dashboard page-size tests.
 *
 * Covers the supported settings options and the normalization path that
 * migrates legacy persisted values such as 25 back to the default.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { useDashboardState } from "@/app/dashboard/hooks/useDashboardState";
import {
  ARTICLE_PAGE_SIZE_OPTIONS,
  DEFAULT_ARTICLE_PAGE_SIZE,
  normalizeArticlePageSize,
} from "@/app/dashboard/services/page-size";

function createMemoryStorage(): Storage {
  const storageMap = new Map<string, string>();

  return {
    clear() {
      storageMap.clear();
    },
    getItem(key) {
      return storageMap.get(key) ?? null;
    },
    key(index) {
      return [...storageMap.keys()][index] ?? null;
    },
    get length() {
      return storageMap.size;
    },
    removeItem(key) {
      storageMap.delete(key);
    },
    setItem(key, value) {
      storageMap.set(key, value);
    },
  };
}

const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: createMemoryStorage(),
    writable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: createMemoryStorage(),
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
    writable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: originalSessionStorage,
    writable: true,
  });
});

describe("dashboard page size", () => {
  test("exposes only the supported settings options", () => {
    expect(ARTICLE_PAGE_SIZE_OPTIONS).toEqual([10, 20]);
    expect(DEFAULT_ARTICLE_PAGE_SIZE).toBe(10);
  });

  test("normalizes unsupported page sizes to the default", () => {
    expect(normalizeArticlePageSize(10)).toBe(10);
    expect(normalizeArticlePageSize(20)).toBe(20);
    expect(normalizeArticlePageSize(25)).toBe(DEFAULT_ARTICLE_PAGE_SIZE);
    expect(normalizeArticlePageSize(50)).toBe(DEFAULT_ARTICLE_PAGE_SIZE);
  });

  test("migrates legacy persisted page sizes back to the default", async () => {
    localStorage.setItem("librerss:pageSize", JSON.stringify(25));

    const { result } = renderHook(() => useDashboardState());

    expect(result.current.pageSize).toBe(DEFAULT_ARTICLE_PAGE_SIZE);

    await waitFor(() => {
      expect(localStorage.getItem("librerss:pageSize")).toBe(
        JSON.stringify(DEFAULT_ARTICLE_PAGE_SIZE),
      );
    });
  });
});
