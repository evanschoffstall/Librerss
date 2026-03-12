import { afterEach, describe, expect, mock, test } from "bun:test";

import { act, renderHook } from "@testing-library/react";

import { useDebugState } from "@/lib/hooks/useDebugState";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import { useSessionState } from "@/lib/hooks/useSessionState";
import { useWebStorage } from "@/lib/hooks/useWebStorage";

const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

afterEach(() => {
  globalThis.localStorage = originalLocalStorage;
  globalThis.sessionStorage = originalSessionStorage;
});

function createMockStorage(initialValue: null | string): Storage {
  return {
    clear: mock(() => {}),
    getItem: mock(() => initialValue),
    key: mock(() => null),
    length: 0,
    removeItem: mock(() => {}),
    setItem: mock(() => {}),
  } as unknown as Storage;
}

describe("hooks/useWebStorage", () => {
  test("useWebStorage reads initial value from storage", () => {
    const mockStorage = createMockStorage(JSON.stringify({ test: "value" }));
    const getStorage = () => mockStorage;

    const { result } = renderHook(() =>
      useWebStorage(getStorage, "testKey", { test: "default" }),
    );

    expect(result.current[0]).toEqual({ test: "value" });
    expect(mockStorage.getItem).toHaveBeenCalledWith("testKey");
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
    const mockStorage = createMockStorage(JSON.stringify(1));
    const getStorage = () => mockStorage;

    const { result } = renderHook(() => useWebStorage(getStorage, "n", 0));

    act(() => {
      const [, setValue] = result.current;
      setValue((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(2);
    expect(mockStorage.setItem).toHaveBeenCalledWith("n", JSON.stringify(2));
  });

  test("useWebStorage rehydrates when key changes", () => {
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

    expect(result.current[0]).toBe("A");

    rerender({ keyName: "b" });
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
});

describe("hooks/useLocalStorage", () => {
  test("useLocalStorage delegates to useWebStorage with localStorage", () => {
    globalThis.localStorage = createMockStorage(JSON.stringify("test"));

    const { result } = renderHook(() => useLocalStorage("key", "default"));
    expect(result.current[0]).toBe("test");
  });
});

describe("hooks/useSessionState", () => {
  test("useSessionState delegates to useWebStorage with sessionStorage", () => {
    globalThis.sessionStorage = createMockStorage(JSON.stringify(42));

    const { result } = renderHook(() => useSessionState("sessionKey", 0));
    expect(result.current[0]).toBe(42);
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
