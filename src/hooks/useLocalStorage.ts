"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(key);
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
