import { act, renderHook, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { type PropsWithChildren, StrictMode } from "react";

import { COMPATIBILITY_RESULTS_CACHE_KEY } from "@/app/dashboard/services/settings-proxy";
import { ArticleService } from "@/lib";

type ProxyCompatibilityResponse = Awaited<
  ReturnType<typeof ArticleService.runProxyCompatibilityCheck>
>;
type ProxySettingsResponse = Awaited<ReturnType<typeof ArticleService.getProxySettings>>;

const originalGetProxySettings = ArticleService.getProxySettings;
const originalRunProxyCompatibilityCheck =
  ArticleService.runProxyCompatibilityCheck;
const originalSaveProxyUrl = ArticleService.saveProxyUrl;
const originalConsoleError = console.error;

function createDeferred<Value>() {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: PromiseLike<Value> | Value) => void;

  const promise = new Promise<Value>((nextResolve, nextReject) => {
    reject = nextReject;
    resolve = nextResolve;
  });

  return { promise, reject, resolve };
}

async function loadUseSettingsProxyState() {
  return (
    await import(
      `@/app/dashboard/hooks/useSettingsProxyState?test=${Date.now()}-${Math.random()}`
    )
  ).useSettingsProxyState;
}

function makeCompatibilityResponse(
  overrides: Partial<ProxyCompatibilityResponse["results"][number]> = {},
): ProxyCompatibilityResponse {
  return {
    results: [
      {
        compatibilitySignalDetected: true,
        site: "Example",
        statusCode: 200,
        success: true,
        url: "https://example.com",
        vendor: "Example CDN",
        ...overrides,
      },
    ],
  };
}

function makeProxySettings(
  overrides: Partial<ProxySettingsResponse> = {},
): ProxySettingsResponse {
  const proxyUrl = overrides.proxyUrl ?? null;

  return {
    allowInsecureTls: false,
    configured: proxyUrl !== null,
    error: undefined,
    hasProxyPassword: false,
    proxyUrl,
    proxyUsername: null,
    routingCheck: null,
    status: "unreachable",
    ...overrides,
  };
}

function StrictModeWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

describe("useSettingsProxyState", () => {
  beforeEach(() => {
    mock.restore();
    window.localStorage.clear();
    ArticleService.getProxySettings = mock(async () =>
      makeProxySettings(),
    ) as typeof ArticleService.getProxySettings;
    ArticleService.saveProxyUrl = mock(async (proxyUrl: null | string, options) =>
      makeProxySettings({
        allowInsecureTls: options?.allowInsecureTls ?? false,
        configured: proxyUrl !== null,
        hasProxyPassword:
          options?.proxyPassword === undefined
            ? proxyUrl !== null
            : options.proxyPassword !== null,
        proxyUrl,
        proxyUsername: options?.proxyUsername ?? null,
        status: proxyUrl ? "reachable" : "unreachable",
      }),
    ) as typeof ArticleService.saveProxyUrl;
    ArticleService.runProxyCompatibilityCheck = mock(async () =>
      makeCompatibilityResponse(),
    ) as typeof ArticleService.runProxyCompatibilityCheck;
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
    const useSettingsProxyState = await loadUseSettingsProxyState();
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
    ArticleService.getProxySettings = mock(async () =>
      makeProxySettings({
        allowInsecureTls: true,
        configured: true,
        error: "Proxy responded slowly",
        hasProxyPassword: true,
        proxyUrl: "https://proxy.example.test",
        proxyUsername: "alice",
        status: "reachable",
      }),
    ) as typeof ArticleService.getProxySettings;

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
    expect(result.current.proxyRoutingCheck).toEqual(null);
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

  test("loads proxy settings when Strict Mode remounts the effect in development", async () => {
    const useSettingsProxyState = await loadUseSettingsProxyState();

    ArticleService.getProxySettings = mock(async () =>
      makeProxySettings({
        allowInsecureTls: true,
        configured: true,
        hasProxyPassword: true,
        proxyUrl: "socks5://proxy.example.test:1080",
        proxyUsername: "strict-user",
        status: "reachable",
      }),
    ) as typeof ArticleService.getProxySettings;

    const { result } = renderHook(() => useSettingsProxyState(), {
      wrapper: StrictModeWrapper,
    });

    await waitFor(() => {
      expect(result.current.proxyStatus).toBe("reachable");
    });

    expect(result.current.proxyUrl).toBe("socks5://proxy.example.test:1080");
    expect(result.current.proxyUsername).toBe("strict-user");
    expect(result.current.allowInsecureTls).toBe(true);
    expect(result.current.hasProxyPassword).toBe(true);
  });

  test("keeps the server-provided routing proof alongside a reachable proxy", async () => {
    const useSettingsProxyState = await loadUseSettingsProxyState();

    ArticleService.getProxySettings = mock(async () =>
      makeProxySettings({
        configured: true,
        proxyUrl: "socks5://proxy.example.test:1080",
        routingCheck: {
          directIp: "198.51.100.7",
          error: null,
          proxyExitIp: "203.0.113.21",
          status: "verified",
        },
        status: "reachable",
      }),
    ) as typeof ArticleService.getProxySettings;

    const { result } = renderHook(() => useSettingsProxyState());

    await waitFor(() => {
      expect(result.current.proxyStatus).toBe("reachable");
    });

    expect(result.current.proxyRoutingCheck).toEqual({
      directIp: "198.51.100.7",
      error: null,
      proxyExitIp: "203.0.113.21",
      status: "verified",
    });
  });

  test("falls back to no proxy when the initial settings request fails", async () => {
    const useSettingsProxyState = await loadUseSettingsProxyState();
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

  test("ignores a stale initial settings load after a newer save succeeds", async () => {
    const useSettingsProxyState = await loadUseSettingsProxyState();
    const initialLoad = createDeferred<ProxySettingsResponse>();

    ArticleService.getProxySettings = mock(
      async () => initialLoad.promise,
    ) as typeof ArticleService.getProxySettings;

    const { result } = renderHook(() => useSettingsProxyState());

    await act(async () => {
      result.current.setProxyUrl("https://fresh-proxy.example.test");
      result.current.setProxyUsername("new-user");
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(result.current.proxyUrl).toBe("https://fresh-proxy.example.test");
    expect(result.current.proxyUsername).toBe("new-user");
    expect(result.current.proxyStatus).toBe("reachable");

    await act(async () => {
      initialLoad.resolve(
        makeProxySettings({
          configured: true,
          proxyUrl: "https://stale-proxy.example.test",
          proxyUsername: "stale-user",
          status: "reachable",
        }),
      );
      await initialLoad.promise;
    });

    expect(result.current.proxyUrl).toBe("https://fresh-proxy.example.test");
    expect(result.current.proxyUsername).toBe("new-user");
    expect(result.current.proxyStatus).toBe("reachable");
  });

  test("saves a trimmed proxy URL, clears cached compatibility results, and resets the password field", async () => {
    const useSettingsProxyState = await loadUseSettingsProxyState();
    window.localStorage.setItem(
      COMPATIBILITY_RESULTS_CACHE_KEY,
      JSON.stringify({ checkedAt: 1, results: [{ compatibilitySignalDetected: false, success: true, vendor: "Old" }] }),
    );
    ArticleService.saveProxyUrl = mock(async (proxyUrl, options) =>
      makeProxySettings({
        allowInsecureTls: options?.allowInsecureTls ?? false,
        configured: proxyUrl !== null,
        hasProxyPassword: true,
        proxyUrl,
        proxyUsername: options?.proxyUsername ?? null,
        status: "reachable",
      }),
    ) as typeof ArticleService.saveProxyUrl;

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
    expect(result.current.proxyRoutingCheck).toBeNull();
    expect(result.current.proxyStatus).toBe("reachable");
    expect(result.current.compatibilityResults).toBeNull();
    expect(result.current.compatibilityCheckedAt).toBeNull();
    expect(window.localStorage.getItem(COMPATIBILITY_RESULTS_CACHE_KEY)).toBe(
      null,
    );
  });

  test("clears saved proxy settings and exposes clear errors without losing the current value", async () => {
    const useSettingsProxyState = await loadUseSettingsProxyState();
    ArticleService.getProxySettings = mock(async () =>
      makeProxySettings({
        configured: true,
        hasProxyPassword: true,
        proxyUrl: "https://proxy.example.test",
        proxyUsername: "carol",
        status: "reachable",
      }),
    ) as typeof ArticleService.getProxySettings;

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
    expect(result.current.proxyRoutingCheck).toBeNull();
    expect(result.current.proxyStatus).toBe("none");

    ArticleService.getProxySettings = mock(async () =>
      makeProxySettings({
        configured: true,
        hasProxyPassword: false,
        proxyUrl: "https://proxy.example.test",
        proxyUsername: "carol",
        status: "reachable",
      }),
    ) as typeof ArticleService.getProxySettings;
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
    const useSettingsProxyState = await loadUseSettingsProxyState();
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

  test("keeps the newest compatibility results when checks finish out of order", async () => {
    const useSettingsProxyState = await loadUseSettingsProxyState();
    const firstCheck = createDeferred<ProxyCompatibilityResponse>();
    const secondCheck = createDeferred<ProxyCompatibilityResponse>();
    let invocationCount = 0;

    ArticleService.runProxyCompatibilityCheck = mock(async () => {
      invocationCount += 1;
      return invocationCount === 1 ? firstCheck.promise : secondCheck.promise;
    }) as typeof ArticleService.runProxyCompatibilityCheck;

    const { result } = renderHook(() => useSettingsProxyState());

    await waitFor(() => {
      expect(result.current.proxyStatus).toBe("none");
    });

    let firstRequest!: Promise<void>;
    let secondRequest!: Promise<void>;

    act(() => {
      firstRequest = result.current.handleRunCompatibilityCheck();
      secondRequest = result.current.handleRunCompatibilityCheck();
    });

    await act(async () => {
      secondCheck.resolve(
        makeCompatibilityResponse({
          statusCode: 202,
          vendor: "Second CDN",
        }),
      );
      await secondRequest;
    });

    expect(result.current.compatibilityResults).toEqual([
      {
        compatibilitySignalDetected: true,
        statusCode: 202,
        success: true,
        vendor: "Second CDN",
      },
    ]);

    await act(async () => {
      firstCheck.resolve(
        makeCompatibilityResponse({
          statusCode: 409,
          vendor: "First CDN",
        }),
      );
      await firstRequest;
    });

    expect(result.current.compatibilityResults).toEqual([
      {
        compatibilitySignalDetected: true,
        statusCode: 202,
        success: true,
        vendor: "Second CDN",
      },
    ]);
    expect(result.current.isRunningCompatibilityCheck).toBe(false);
  });

  test("persists insecure TLS updates for saved proxies and rolls back failed saves", async () => {
    const useSettingsProxyState = await loadUseSettingsProxyState();
    ArticleService.getProxySettings = mock(async () =>
      makeProxySettings({
        configured: true,
        hasProxyPassword: false,
        proxyUrl: "https://proxy.example.test",
        proxyUsername: null,
        status: "reachable",
      }),
    ) as typeof ArticleService.getProxySettings;

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