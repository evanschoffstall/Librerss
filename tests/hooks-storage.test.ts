import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

import { useDebugState } from "@/lib/hooks/useDebugState";
import { useWebStorage } from "@/lib/hooks/useWebStorage";

const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;
const originalGlobalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const originalWindowLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);
const originalGlobalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "sessionStorage",
);
const originalWindowSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "sessionStorage",
);

afterEach(() => {
  mock.restore();

  if (originalGlobalLocalStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      "localStorage",
      originalGlobalLocalStorageDescriptor,
    );
  } else {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
      writable: true,
    });
  }

  if (originalWindowLocalStorageDescriptor) {
    Object.defineProperty(
      window,
      "localStorage",
      originalWindowLocalStorageDescriptor,
    );
  } else {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
      writable: true,
    });
  }

  if (originalGlobalSessionStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      "sessionStorage",
      originalGlobalSessionStorageDescriptor,
    );
  } else {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
      writable: true,
    });
  }

  if (originalWindowSessionStorageDescriptor) {
    Object.defineProperty(
      window,
      "sessionStorage",
      originalWindowSessionStorageDescriptor,
    );
  } else {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
      writable: true,
    });
  }
});

function createMockStorage(
  initialValue: null | string,
  initialKey = "testKey",
): Storage {
  const storageMap = new Map<string, string>();
  if (initialValue !== null) {
    storageMap.set(initialKey, initialValue);
  }

  return {
    clear: mock(() => {
      storageMap.clear();
    }),
    getItem: mock((key: string) => storageMap.get(key) ?? null),
    key: mock(() => null),
    length: storageMap.size,
    removeItem: mock((key: string) => {
      storageMap.delete(key);
    }),
    setItem: mock((key: string, value: string) => {
      storageMap.set(key, value);
    }),
  } as unknown as Storage;
}

describe("hooks/useWebStorage", () => {
  test("useWebStorage restores persisted value after mount", async () => {
    const mockStorage = createMockStorage(JSON.stringify({ test: "value" }));
    const getStorage = () => mockStorage;

    const { result } = renderHook(() =>
      useWebStorage(getStorage, "testKey", { test: "default" }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current[0]).toEqual({ test: "value" });
    expect(mockStorage.getItem).toHaveBeenCalledWith("testKey");
    expect(mockStorage.setItem).not.toHaveBeenCalledWith(
      "testKey",
      JSON.stringify({ test: "default" }),
    );
  });

  test("useWebStorage returns default when storage is empty", () => {
    const mockStorage = createMockStorage(null);
    const getStorage = () => mockStorage;

    const { result } = renderHook(() =>
      useWebStorage(getStorage, "testKey", { default: true }),
    );

    expect(result.current[0]).toEqual({ default: true });
  });

  test("useWebStorage handles JSON parse errors gracefully", () => {
    const mockStorage = createMockStorage("{invalid json");
    const getStorage = () => mockStorage;

    const { result } = renderHook(() =>
      useWebStorage(getStorage, "testKey", { fallback: "used" }),
    );

    expect(result.current[0]).toEqual({ fallback: "used" });
  });

  test("useWebStorage writes updates and supports updater functions", () => {
    const mockStorage = createMockStorage(JSON.stringify(1), "n");
    const getStorage = () => mockStorage;

    const { result } = renderHook(() => useWebStorage(getStorage, "n", 0));

    act(() => {
      const [, setValue] = result.current;
      setValue((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(2);
    expect(mockStorage.setItem).toHaveBeenCalledWith("n", JSON.stringify(2));
  });

  test("useWebStorage rehydrates when key changes", async () => {
    const storageMap = new Map<string, string>([
      ["a", JSON.stringify("A")],
      ["b", JSON.stringify("B")],
    ]);
    const mockStorage = {
      clear: mock(() => {}),
      getItem: mock((key: string) => storageMap.get(key) ?? null),
      key: mock(() => null),
      length: 0,
      removeItem: mock(() => {}),
      setItem: mock(() => {}),
    } as unknown as Storage;

    const getStorage = () => mockStorage;

    const { rerender, result } = renderHook(
      ({ keyName }) => useWebStorage(getStorage, keyName, "default"),
      { initialProps: { keyName: "a" } },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current[0]).toBe("A");

    rerender({ keyName: "b" });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current[0]).toBe("B");
  });

  test("useWebStorage tolerates storage write failures", () => {
    const mockStorage = {
      clear: mock(() => {}),
      getItem: mock(() => JSON.stringify("x")),
      key: mock(() => null),
      length: 0,
      removeItem: mock(() => {}),
      setItem: mock(() => {
        throw new Error("quota");
      }),
    } as unknown as Storage;

    const getStorage = () => mockStorage;
    const { result } = renderHook(() => useWebStorage(getStorage, "k", "d"));

    act(() => {
      const [, setValue] = result.current;
      setValue("next");
    });

    expect(result.current[0]).toBe("next");
  });

  test("useWebStorage falls back to the default value for invalid sync payloads", async () => {
    const mockStorage = createMockStorage(
      JSON.stringify("persisted"),
      "shared-key",
    );
    const getStorage = () => mockStorage;
    const { result } = renderHook(() =>
      useWebStorage(getStorage, "shared-key", "fallback"),
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent("librerss:storage-sync", {
          detail: { key: "shared-key", value: "{invalid" },
        }),
      );
    });

    expect(result.current[0]).toBe("fallback");
  });
});

describe("hooks/useLocalStorage", () => {
  test("useLocalStorage delegates to useWebStorage with localStorage", async () => {
    const mockStorage = createMockStorage(JSON.stringify("test"), "key");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: mockStorage,
      writable: true,
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: mockStorage,
      writable: true,
    });

    const { useLocalStorage: useLocalStorageHook } = await import(
      `@/lib/hooks/useLocalStorage?test=${Date.now()}`
    );
    const { result } = renderHook(() => useLocalStorageHook("key", "default"));

    await waitFor(() => {
      expect(result.current[0]).toBe("test");
    });
  });
});

describe("hooks/useDebugState", () => {
  test("useDebugState initializes and toggles debug flag", () => {
    const { result } = renderHook(() => useDebugState(true));

    expect(result.current.debug).toBe(true);

    act(() => {
      result.current.toggleDebug();
    });

    expect(result.current.debug).toBe(false);
  });

  test("useDebugState sets isClient after effect", async () => {
    const { result } = renderHook(() => useDebugState(false));

    expect(typeof result.current.isClient).toBe("boolean");
    expect(result.current.isClient).toBe(true);
  });
});
