import { describe, expect, test } from "bun:test";

import {
  clearCompatibilityResultsCache,
  COMPATIBILITY_RESULTS_CACHE_KEY,
  formatElapsed,
  hasConfiguredProxyStatus,
  isCompatibilityResultsCache,
  normalizeCompatibilityResults,
  previewText,
  readCompatibilityResultsCache,
  toProxySettingsSnapshot,
  writeCompatibilityResultsCache,
} from "@/app/dashboard/services/settings-proxy";

function createMemoryStorage(initial = new Map<string, string>()) {
  return {
    getItem(key: string) {
      return initial.get(key) ?? null;
    },
    removeItem(key: string) {
      initial.delete(key);
    },
    setItem(key: string, value: string) {
      initial.set(key, value);
    },
  };
}

describe("settings-proxy services", () => {
  test("formats elapsed times across seconds, minutes, hours, and days", () => {
    expect(formatElapsed(90_000, 95_000)).toBe("5s ago");
    expect(formatElapsed(0, 120_000)).toBe("2m ago");
    expect(formatElapsed(0, 7_200_000)).toBe("2h ago");
    expect(formatElapsed(0, 172_800_000)).toBe("2d ago");
  });

  test("identifies statuses that imply a configured proxy", () => {
    expect(hasConfiguredProxyStatus("none")).toBeFalse();
    expect(hasConfiguredProxyStatus("loading")).toBeFalse();
    expect(hasConfiguredProxyStatus("checking")).toBeTrue();
    expect(hasConfiguredProxyStatus("reachable")).toBeTrue();
    expect(hasConfiguredProxyStatus("unreachable")).toBeTrue();
  });

  test("validates cached compatibility result shapes", () => {
    expect(
      isCompatibilityResultsCache({
        checkedAt: 123,
        results: [
          {
            compatibilitySignalDetected: true,
            error: "warning",
            statusCode: 204,
            success: true,
            vendor: "Example CDN",
          },
        ],
      }),
    ).toBeTrue();
    expect(isCompatibilityResultsCache(null)).toBeFalse();
    expect(
      isCompatibilityResultsCache({ checkedAt: "nope", results: [] }),
    ).toBeFalse();
    expect(
      isCompatibilityResultsCache({
        checkedAt: 123,
        results: [{ compatibilitySignalDetected: true, success: true }],
      }),
    ).toBeFalse();
    expect(
      isCompatibilityResultsCache({
        checkedAt: 123,
        results: [
          {
            compatibilitySignalDetected: true,
            statusCode: "204",
            success: true,
            vendor: "Example CDN",
          },
        ],
      }),
    ).toBeFalse();
  });

  test("normalizes compatibility results while preserving optional fields", () => {
    expect(
      normalizeCompatibilityResults([
        {
          compatibilitySignalDetected: false,
          success: true,
          vendor: "Passed Vendor",
        },
        {
          compatibilitySignalDetected: true,
          error: "blocked",
          statusCode: 403,
          success: false,
          vendor: "Blocked Vendor",
        },
      ]),
    ).toEqual([
      {
        compatibilitySignalDetected: false,
        success: true,
        vendor: "Passed Vendor",
      },
      {
        compatibilitySignalDetected: true,
        error: "blocked",
        statusCode: 403,
        success: false,
        vendor: "Blocked Vendor",
      },
    ]);
  });

  test("truncates long preview text and leaves short text untouched", () => {
    expect(previewText("short text", 20)).toBe("short text");
    expect(previewText("x".repeat(12), 8)).toBe("xxxxxxxx...");
  });

  test("reads, writes, and clears the compatibility cache", () => {
    const backingStore = new Map<string, string>();
    const storage = createMemoryStorage(backingStore);
    const cache = {
      checkedAt: 456,
      results: [
        {
          compatibilitySignalDetected: false,
          success: true,
          vendor: "Cache Vendor",
        },
      ],
    };

    writeCompatibilityResultsCache(storage, cache);

    expect(backingStore.get(COMPATIBILITY_RESULTS_CACHE_KEY)).toContain(
      '"Cache Vendor"',
    );
    expect(readCompatibilityResultsCache(storage)).toEqual(cache);

    backingStore.set(COMPATIBILITY_RESULTS_CACHE_KEY, "{invalid json");
    expect(readCompatibilityResultsCache(storage)).toBeNull();

    writeCompatibilityResultsCache(storage, cache);
    clearCompatibilityResultsCache(storage);
    expect(readCompatibilityResultsCache(storage)).toBeNull();
  });

  test("normalizes persisted proxy settings into UI state", () => {
    expect(
      toProxySettingsSnapshot({
        error: "Proxy slow",
        hasProxyPassword: true,
        proxyUrl: "https://proxy.example.test",
        proxyUsername: "alice",
        routingCheck: null,
        status: "reachable",
      }),
    ).toEqual({
      error: "Proxy slow",
      hasProxyPassword: true,
      proxyStatus: "reachable",
      proxyUrl: "https://proxy.example.test",
      proxyUsername: "alice",
      routingCheck: null,
    });

    expect(
      toProxySettingsSnapshot({
        hasProxyPassword: false,
        proxyUrl: null,
        proxyUsername: null,
        routingCheck: null,
        status: "unreachable",
      }),
    ).toEqual({
      error: null,
      hasProxyPassword: false,
      proxyStatus: "none",
      proxyUrl: "",
      proxyUsername: "",
      routingCheck: null,
    });
  });
});
