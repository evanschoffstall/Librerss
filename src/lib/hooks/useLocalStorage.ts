"use client";

import { type Dispatch, type SetStateAction } from "react";

import { useWebStorage } from "./useWebStorage";

/**
 * Return the local storage.
 * @returns The local storage.
 */
const getLocalStorage = () => globalThis.localStorage;

/**
 * Manage the local storage.
 * @param key - The key.
 * @param defaultValue - The default value.
 * @returns The local storage state and callbacks.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  return useWebStorage(getLocalStorage, key, defaultValue);
}
