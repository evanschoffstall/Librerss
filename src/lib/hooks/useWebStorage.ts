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
 * Reads initial value from `getStorage()` inside the `useState` initializer,
 * re-reads on `key` changes (but not on initial mount, preventing a redundant
 * double-read), and writes through on every value change.
 *
 * SSR-safe: `getStorage()` is only called when `window` is defined.
 */
export function useWebStorage<T>(
  getStorage: () => Storage,
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = getStorage().getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  // Re-hydrate when the key changes, but skip the initial mount run to avoid a
  // redundant read immediately after the useState initializer.
  const isFirstEffectRun = useRef(true);
  useEffect(() => {
    if (isFirstEffectRun.current) {
      isFirstEffectRun.current = false;
      return;
    }
    if (typeof window === "undefined") return;
    try {
      const stored = getStorage().getItem(key);
      setValue(stored !== null ? (JSON.parse(stored) as T) : defaultValue);
    } catch {
      setValue(defaultValue);
    }
    // defaultValue intentionally omitted: callers rarely stabilise the
    // reference, and changing only the default should not clobber a persisted
    // value that already exists under the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Write-through: persist every value change. Skip when the key just changed
  // to avoid clobbering the new key's stored value with the stale value from
  // the previous key.
  const prevKeyRef = useRef(key);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key;
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
