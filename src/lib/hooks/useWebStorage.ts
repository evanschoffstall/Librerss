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
 *
 * Same-window sync: when one hook instance writes a value, all other instances
 * sharing the same storage key update immediately via a custom DOM event.
 */

const STORAGE_SYNC_EVENT = "librerss:storage-sync";

interface StorageSyncDetail {
  key: string;
  value: string;
}

/**
 * @param getStorage
 * @param key
 * @param defaultValue
 */
export function useWebStorage<T>(
  getStorage: () => Storage,
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(defaultValue);
  const shouldSkipNextWriteRef = useRef(true);
  const isEmittingRef = useRef(false);
  const didWriteSynchronouslyRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  // Rehydrate after mount and when the storage key changes so the first client
  // render always matches the server HTML.
  useEffect(() => {
    if (typeof window === "undefined") return;

    restoreStoredSnapshot(
      defaultValue,
      getStorage,
      key,
      setValue,
      shouldSkipNextWriteRef,
    );
    // defaultValue intentionally omitted: callers rarely stabilise the
    // reference, and changing only the default should not clobber a persisted
    // value that already exists under the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Write-through: persist every user-driven change after the storage snapshot
  // for the active key has been restored.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (didWriteSynchronouslyRef.current) {
      didWriteSynchronouslyRef.current = false;
      return;
    }
    if (shouldSkipNextWriteRef.current) {
      shouldSkipNextWriteRef.current = false;
      return;
    }
    persistStorageValue(getStorage, isEmittingRef, key, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);
  // Same-window sync: when another hook instance writes to the same key,
  // update this instance so all consumers stay consistent.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSync = createStorageSyncHandler(
      defaultValue,
      key,
      setValue,
      shouldSkipNextWriteRef,
      isEmittingRef,
    );
    window.addEventListener(STORAGE_SYNC_EVENT, handleSync);
    return () => {
      window.removeEventListener(STORAGE_SYNC_EVENT, handleSync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const setStoredValue: Dispatch<SetStateAction<T>> = useCallback(
    (nextValue) => {
      const resolvedValue =
        typeof nextValue === "function"
          ? (nextValue as (prev: T) => T)(valueRef.current)
          : nextValue;
      shouldSkipNextWriteRef.current = false;
      didWriteSynchronouslyRef.current = true;
      valueRef.current = resolvedValue;
      setValue(resolvedValue);
      persistStorageValue(getStorage, isEmittingRef, key, resolvedValue);
    },
    [getStorage, key],
  );

  return [value, setStoredValue];
}

/**
 * @param defaultValue
 * @param key
 * @param setValue
 * @param shouldSkipNextWriteRef
 * @param isEmittingRef
 */
function createStorageSyncHandler<T>(
  defaultValue: T,
  key: string,
  setValue: Dispatch<SetStateAction<T>>,
  shouldSkipNextWriteRef: React.RefObject<boolean>,
  isEmittingRef: React.RefObject<boolean>,
) {
  return (event: Event) => {
    if (isEmittingRef.current) return;
    const { key: syncKey, value: syncValue } = (
      event as CustomEvent<StorageSyncDetail>
    ).detail;
    if (syncKey !== key) return;

    shouldSkipNextWriteRef.current = true;
    try {
      setValue(JSON.parse(syncValue) as T);
    } catch {
      setValue(defaultValue);
    }
  };
}

/**
 * @param key
 * @param value
 */
function emitStorageSync(key: string, value: string): void {
  window.dispatchEvent(
    new CustomEvent<StorageSyncDetail>(STORAGE_SYNC_EVENT, {
      detail: { key, value },
    }),
  );
}

/**
 * @param getStorage
 * @param isEmittingRef
 * @param key
 * @param value
 */
function persistStorageValue(
  getStorage: () => Storage,
  isEmittingRef: React.RefObject<boolean>,
  key: string,
  value: unknown,
) {
  try {
    const serialized = JSON.stringify(value);
    getStorage().setItem(key, serialized);
    isEmittingRef.current = true;
    emitStorageSync(key, serialized);
    isEmittingRef.current = false;
  } catch {
    // Storage quota exceeded or security policy — fail silently.
  }
}

/**
 * Reads and parses the persisted value for a storage key with a safe fallback.
 * @param getStorage
 * @param key
 * @param defaultValue
 */
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

/**
 * @param defaultValue
 * @param getStorage
 * @param key
 * @param setValue
 * @param shouldSkipNextWriteRef
 */
function restoreStoredSnapshot<T>(
  defaultValue: T,
  getStorage: () => Storage,
  key: string,
  setValue: Dispatch<SetStateAction<T>>,
  shouldSkipNextWriteRef: React.RefObject<boolean>,
): void {
  shouldSkipNextWriteRef.current = true;
  setValue(readStoredValue(getStorage, key, defaultValue));
}
