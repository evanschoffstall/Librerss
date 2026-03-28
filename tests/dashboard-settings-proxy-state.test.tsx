import { act, renderHook, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { useSettingsProxyState } from "@/app/dashboard/hooks/useSettingsProxyState";
import { COMPATIBILITY_RESULTS_CACHE_KEY } from "@/app/dashboard/services/settings-proxy";
import { ArticleService } from "@/lib";

const originalGetProxySettings = ArticleService.getProxySettings;
const originalRunProxyCompatibilityCheck =
  ArticleService.runProxyCompatibilityCheck;
const originalSaveProxyUrl = ArticleService.saveProxyUrl;
const originalConsoleError = console.error;

describe("useSettingsProxyState", () => {
  beforeEach(() => {
    mock.restore();
    window.localStorage.clear();
    ArticleService.getProxySettings = mock(async () => ({
      allowInsecureTls: false,
      error: null,
      hasProxyPassword: false,
      proxyUrl: null,
      proxyUsername: null,
      status: "none",
    })) as typeof ArticleService.getProxySettings;
    ArticleService.saveProxyUrl = mock(async (proxyUrl: null | string) => ({
      allowInsecureTls: false,
      error: null,
      hasProxyPassword: proxyUrl !== null,
      proxyUrl,
      proxyUsername: null,
      status: proxyUrl ? "reachable" : "none",
    })) as typeof ArticleService.saveProxyUrl;
    ArticleService.runProxyCompatibilityCheck = mock(async () => ({
      results: [
        {
          compatibilitySignalDetected: true,
          statusCode: 200,
          success: true,
          vendor: "Example CDN",
        },
      ],
    })) as typeof ArticleService.runProxyCompatibilityCheck;
    console.error = (() => {}) as typeof console.error;
  });

  afterAll(() => {
    ArticleService.getProxySettings =
      originalGetProxySettings as typeof ArticleService.getProxySettings;
    ArticleService.saveProxyUrl =
      originalSaveProxyUrl as typeof ArticleService.saveProxyUrl;
    ArticleService.runProxyCompatibilityCheck =
      originalRunProxyCompatibilityCheck as typeof ArticleService.runProxyCompatibilityCheck;
    console.error = originalConsoleError;
    mock.restore();
  });

  test("loads proxy settings and restores a cached compatibility result set", async () => {
    const checkedAt = Date.now() - 15_000;
    window.localStorage.setItem(
      COMPATIBILITY_RESULTS_CACHE_KEY,
      JSON.stringify({
        checkedAt,
        results: [
          {
            compatibilitySignalDetected: true,
            statusCode: 204,
            success: true,
            vendor: "Cache Vendor",
          },
        ],
      }),
    );
    ArticleService.getProxySettings = mock(async () => ({
      allowInsecureTls: true,
      error: "Proxy responded slowly",
      hasProxyPassword: true,
      proxyUrl: "https://proxy.example.test",
      proxyUsername: "alice",
      status: "reachable",
    })) as typeof ArticleService.getProxySettings;

    const { result } = renderHook(() => useSettingsProxyState());

    await waitFor(() => {
      expect(result.current.proxyStatus).toBe("reachable");
    });

    expect(result.current.proxyUrl).toBe("https://proxy.example.test");
    expect(result.current.proxyUsername).toBe("alice");
    expect(result.current.allowInsecureTls).toBe(true);
    expect(result.current.hasProxyPassword).toBe(true);
    expect(result.current.error).toBe("Proxy responded slowly");
    expect(result.current.hasProxy).toBe(true);
    expect(result.current.compatibilityCheckedAt).toBe(checkedAt);
    expect(result.current.compatibilityResults).toEqual([
      {
        compatibilitySignalDetected: true,
        statusCode: 204,
        success: true,
        vendor: "Cache Vendor",
      },
    ]);
  });

  test("falls back to no proxy when the initial settings request fails", async () => {
    ArticleService.getProxySettings = mock(async () => {
      throw new Error("boom");
    }) as typeof ArticleService.getProxySettings;
    window.localStorage.setItem(
      COMPATIBILITY_RESULTS_CACHE_KEY,
      JSON.stringify({ invalid: true }),
    );

    const { result } = renderHook(() => useSettingsProxyState());

    await waitFor(() => {
      expect(result.current.proxyStatus).toBe("none");
    });

    expect(result.current.compatibilityResults).toBeNull();
    expect(result.current.compatibilityCheckedAt).toBeNull();
  });

  test("saves a trimmed proxy URL, clears cached compatibility results, and resets the password field", async () => {
    window.localStorage.setItem(
      COMPATIBILITY_RESULTS_CACHE_KEY,
      JSON.stringify({ checkedAt: 1, results: [{ compatibilitySignalDetected: false, success: true, vendor: "Old" }] }),
    );
    ArticleService.saveProxyUrl = mock(async (proxyUrl, options) => ({
      allowInsecureTls: options?.allowInsecureTls ?? false,
      error: null,
      hasProxyPassword: true,
      proxyUrl,
      proxyUsername: options?.proxyUsername ?? null,
      status: "reachable",
    })) as typeof ArticleService.saveProxyUrl;

    const { result } = renderHook(() => useSettingsProxyState());

    await waitFor(() => {
      expect(result.current.proxyStatus).toBe("none");
    });

    await act(async () => {
      result.current.setAllowInsecureTls(true);
      result.current.setProxyUrl("  https://proxy.example.test/path  ");
      result.current.setProxyUsername("  bob  ");
      result.current.setProxyPassword("secret");
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(ArticleService.saveProxyUrl).toHaveBeenCalledWith(
      "https://proxy.example.test/path",
      {
        allowInsecureTls: true,
        proxyPassword: "secret",
        proxyUsername: "bob",
      },
    );
    expect(result.current.proxyUrl).toBe("https://proxy.example.test/path");
    expect(result.current.proxyUsername).toBe("bob");
    expect(result.current.proxyPassword).toBe("");
    expect(result.current.proxyStatus).toBe("reachable");
    expect(result.current.compatibilityResults).toBeNull();
    expect(result.current.compatibilityCheckedAt).toBeNull();
    expect(window.localStorage.getItem(COMPATIBILITY_RESULTS_CACHE_KEY)).toBe(
      null,
    );
  });

  test("clears saved proxy settings and exposes clear errors without losing the current value", async () => {
    ArticleService.getProxySettings = mock(async () => ({
      allowInsecureTls: false,
      error: null,
      hasProxyPassword: true,
      proxyUrl: "https://proxy.example.test",
      proxyUsername: "carol",
      status: "reachable",
    })) as typeof ArticleService.getProxySettings;

    const { rerender, result } = renderHook(() => useSettingsProxyState());

    await waitFor(() => {
      expect(result.current.proxyStatus).toBe("reachable");
    });

    await act(async () => {
      await result.current.handleClear();
    });

    expect(ArticleService.saveProxyUrl).toHaveBeenCalledWith(null, {
      proxyPassword: null,
      proxyUsername: null,
    });
    expect(result.current.proxyUrl).toBe("");
    expect(result.current.proxyUsername).toBe("");
    expect(result.current.hasProxyPassword).toBe(false);
    expect(result.current.proxyStatus).toBe("none");

    ArticleService.getProxySettings = mock(async () => ({
      allowInsecureTls: false,
      error: null,
      hasProxyPassword: false,
      proxyUrl: "https://proxy.example.test",
      proxyUsername: "carol",
      status: "reachable",
    })) as typeof ArticleService.getProxySettings;
    ArticleService.saveProxyUrl = mock(async () => {
      throw new Error("Failed to clear proxy URL");
    }) as typeof ArticleService.saveProxyUrl;

    rerender();

    await act(async () => {
      result.current.setProxyUrl("https://proxy.example.test");
      result.current.setProxyUsername("carol");
      await result.current.handleClear();
    });

    expect(result.current.error).toBe("Failed to clear proxy URL");
    expect(result.current.proxyUrl).toBe("https://proxy.example.test");
  });

  test("runs compatibility checks, caches results, and reports errors", async () => {
    const { result } = renderHook(() => useSettingsProxyState());

    await waitFor(() => {
      expect(result.current.proxyStatus).toBe("none");
    });

    await act(async () => {
      await result.current.handleRunCompatibilityCheck();
    });

    expect(ArticleService.runProxyCompatibilityCheck).toHaveBeenCalledWith({
      useProxy: false,
    });
    expect(result.current.compatibilityResults).toEqual([
      {
        compatibilitySignalDetected: true,
        statusCode: 200,
        success: true,
        vendor: "Example CDN",
      },
    ]);
    expect(result.current.compatibilityCheckedAt).not.toBeNull();
    expect(
      JSON.parse(
        window.localStorage.getItem(COMPATIBILITY_RESULTS_CACHE_KEY) ?? "{}",
      ),
    ).toMatchObject({
      results: [
        {
          compatibilitySignalDetected: true,
          statusCode: 200,
          success: true,
          vendor: "Example CDN",
        },
      ],
    });

    ArticleService.runProxyCompatibilityCheck = mock(async () => {
      throw new Error("Check failed");
    }) as typeof ArticleService.runProxyCompatibilityCheck;

    await act(async () => {
      await result.current.handleRunCompatibilityCheck();
    });

    expect(result.current.compatibilityError).toBe("Check failed");
    expect(result.current.isRunningCompatibilityCheck).toBe(false);
  });

  test("persists insecure TLS updates for saved proxies and rolls back failed saves", async () => {
    ArticleService.getProxySettings = mock(async () => ({
      allowInsecureTls: false,
      error: null,
      hasProxyPassword: false,
      proxyUrl: "https://proxy.example.test",
      proxyUsername: null,
      status: "reachable",
    })) as typeof ArticleService.getProxySettings;

    const { result } = renderHook(() => useSettingsProxyState());

    await waitFor(() => {
      expect(result.current.proxyStatus).toBe("reachable");
    });

    await act(async () => {
      await result.current.syncAllowInsecureTls(true);
    });

    expect(ArticleService.saveProxyUrl).toHaveBeenCalledWith(
      "https://proxy.example.test",
      { allowInsecureTls: true },
    );
    expect(result.current.allowInsecureTls).toBe(true);

    ArticleService.saveProxyUrl = mock(async () => {
      throw new Error("save failed");
    }) as typeof ArticleService.saveProxyUrl;

    await act(async () => {
      await result.current.syncAllowInsecureTls(false);
    });

    expect(result.current.allowInsecureTls).toBe(true);
  });
});