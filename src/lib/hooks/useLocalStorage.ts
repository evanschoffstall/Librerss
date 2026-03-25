"use client";

import { type Dispatch, type SetStateAction } from "react";

import { useWebStorage } from "./useWebStorage";

const getLocalStorage = () => localStorage;

/**
 * Syncs state with localStorage while keeping the first client render aligned
 * with server-rendered HTML.
 *
 * @param key - localStorage key
 * @param defaultValue - Default value when key is absent
 * @returns [value, setValue] tuple
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  return useWebStorage(getLocalStorage, key, defaultValue);
}
