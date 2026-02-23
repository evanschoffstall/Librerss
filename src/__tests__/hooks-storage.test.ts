import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useSessionState } from "@/hooks/useSessionState";
import { useWebStorage } from "@/hooks/useWebStorage";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

afterEach(() => {
  globalThis.localStorage = originalLocalStorage;
  globalThis.sessionStorage = originalSessionStorage;
});

function createMockStorage(initialValue: string | null): Storage {
  return {
    getItem: mock(() => initialValue),
    setItem: mock(() => {}),
    removeItem: mock(() => {}),
    clear: mock(() => {}),
    key: mock(() => null),
    length: 0,
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
