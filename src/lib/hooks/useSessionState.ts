"use client";

import { type Dispatch, type SetStateAction } from "react";

import { useWebStorage } from "./useWebStorage";

const getSessionStorage = () => sessionStorage;

/**
 * Like useState, but persists value to sessionStorage so it survives HMR
 * hot-reloads and full-page refreshes within the same tab.
 *
 * - SSR-safe: reads lazily in the initializer, skips writes on the server.
 * - Clears automatically when the tab is closed (sessionStorage behaviour).
 *
 * @param key - sessionStorage key
 * @param defaultValue - Fallback when key is absent or unparseable
 */
export function useSessionState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  return useWebStorage(getSessionStorage, key, defaultValue);
}
