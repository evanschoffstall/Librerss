"use client";

import { type Dispatch, type SetStateAction } from "react";

import { useWebStorage } from "./useWebStorage";

/**
 * Return the global localStorage object.
 * @returns The browser's localStorage instance.
 */
const getLocalStorage = () => globalThis.localStorage;

/**
 * Persist and synchronize a state value in localStorage.
 * @param key - The localStorage key under which the value is stored.
 * @param defaultValue - The initial value used when no stored value exists.
 * @returns A stateful value and setter, backed by localStorage.
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  return useWebStorage(getLocalStorage, key, defaultValue);
}
