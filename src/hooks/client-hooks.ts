"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

// =============================================================================
// CLIENT-ONLY CUSTOM HOOKS
// =============================================================================

export const useDebugState = (initialValue: boolean = false) => {
  const [debugState, setDebugState] = useState(initialValue);
  const [isClientState, setIsClientState] = useState(false);

  useEffect(() => setIsClientState(true), []);

  const toggleDebug = () => setDebugState((prev) => !prev);

  return { debug: debugState, toggleDebug, isClient: isClientState };
};

/**
 * Syncs state with localStorage. Safe for SSR — reads initial value lazily.
 *
 * @param key - localStorage key
 * @param defaultValue - Default value when key is absent
 * @returns [value, setValue] tuple
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return defaultValue;
    }
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  // When the key changes (dynamic key usage) re-read the value stored under
  // the new key rather than keeping the value from the previous key.
  // The initializer only runs on mount, so without this effect a dynamic key
  // would silently keep stale state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(key);
      // Intentionally use the functional updater to avoid a stale closure
      // on defaultValue — we rely on the effect dep array for key changes.
      setValue(stored ? (JSON.parse(stored) as T) : defaultValue);
    } catch {
      setValue(defaultValue);
    }
    // defaultValue is intentionally omitted: callers rarely stabilise the
    // reference and changing only the default should not clobber a persisted
    // value that already exists under the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage quota exceeded or security policy — fail silently.
      }
    }
  }, [key, value]);

  const setStoredValue: Dispatch<SetStateAction<T>> = (nextValue) => {
    setValue((currentValue) =>
      typeof nextValue === "function"
        ? (nextValue as (prevState: T) => T)(currentValue)
        : nextValue,
    );
  };

  return [value, setStoredValue];
}
