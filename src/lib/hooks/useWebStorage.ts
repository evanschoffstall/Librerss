"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Shared implementation for localStorage and sessionStorage state hooks.
 *
 * Uses the provided default value for the initial render so server-rendered and
 * hydrated client markup stay aligned. The persisted value is restored in an
 * effect after mount and whenever the storage key changes.
 *
 * SSR-safe: `getStorage()` is only called when `window` is defined, and the
 * first write after rehydration is skipped so stored values are never
 * overwritten by the default before they are restored.
 */
export function useWebStorage<T>(
  getStorage: () => Storage,
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue);
  const shouldSkipNextWriteRef = useRef(true);

  // Rehydrate after mount and when the storage key changes so the first client
  // render always matches the server HTML.
  useEffect(() => {
    if (typeof window === "undefined") return;

    shouldSkipNextWriteRef.current = true;
    setValue(readStoredValue(getStorage, key, defaultValue));
    // defaultValue intentionally omitted: callers rarely stabilise the
    // reference, and changing only the default should not clobber a persisted
    // value that already exists under the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Write-through: persist every user-driven change after the storage snapshot
  // for the active key has been restored.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldSkipNextWriteRef.current) {
      shouldSkipNextWriteRef.current = false;
      return;
    }

    try {
      getStorage().setItem(key, JSON.stringify(value));
    } catch {
      // Storage quota exceeded or security policy — fail silently.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  const setStoredValue: Dispatch<SetStateAction<T>> = useCallback(
    (nextValue) => {
      setValue((current) =>
        typeof nextValue === "function"
          ? (nextValue as (prev: T) => T)(current)
          : nextValue,
      );
    },
    [],
  );

  return [value, setStoredValue];
}

/** Reads and parses the persisted value for a storage key with a safe fallback. */
function readStoredValue<T>(
  getStorage: () => Storage,
  key: string,
  defaultValue: T,
): T {
  try {
    const stored = getStorage().getItem(key);
    return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}
