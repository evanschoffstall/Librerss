"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

/**
 * Like useState, but persists value to sessionStorage so it survives HMR
 * hot-reloads and full-page refreshes within the same tab.
 *
 * - SSR-safe: reads lazily in the initialiser, skips writes on the server.
 * - Clears automatically when the tab is closed (sessionStorage behaviour).
 *
 * @param key - sessionStorage key
 * @param defaultValue - Fallback when key is absent or unparseable
 */
export function useSessionState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  // Re-hydrate when the key changes (e.g. conditional keys).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (typeof window === "undefined") return;
    try {
      const stored = sessionStorage.getItem(key);
      setValue(stored !== null ? (JSON.parse(stored) as T) : defaultValue);
    } catch {
      setValue(defaultValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Write-through: persist every value change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage quota exceeded or security policy — fail silently.
    }
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
