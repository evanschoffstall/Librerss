"use client";

import { useEffect, useState } from "react";

// =============================================================================
// CLIENT-ONLY CUSTOM HOOKS
// =============================================================================

export const useIsClient = (): boolean => {
  const [isClientState, setIsClientState] = useState(false);
  useEffect(() => setIsClientState(true), []);
  return isClientState;
};

export const useDebugState = (initialValue: boolean = false) => {
  const [debugState, setDebugState] = useState(initialValue);
  const isClientState = useIsClient();

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
): [T, (value: T) => void] {
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
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage quota exceeded or security policy — fail silently.
      }
    }
  }, [key, value]);

  return [value, setValue];
}
