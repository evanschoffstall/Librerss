"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export const EXIT_CLEANUP_MS = 340;
export const ENTER_CLEANUP_MS = 280;
const EXIT_DURATION_MS = EXIT_CLEANUP_MS;
const ENTER_DURATION_MS = ENTER_CLEANUP_MS;
const DEFAULT_MAX_ANIMATED_EXITS = 12;

interface AnimatedItem<T> {
  entering: boolean;
  exiting: boolean;
  item: T;
  key: string;
}

/**
 * Tracks list deltas so items can animate in and out without breaking layout.
 *
 * Removed items stay rendered with `exiting: true` for EXIT_DURATION_MS so an
 * exit animation can complete before removal. Newly inserted items are tagged
 * with `entering: true` for ENTER_DURATION_MS so callers can reveal them
 * without replacing the surrounding list.
 */
export function useAnimatedList<T>(
  items: T[],
  getKey: (item: T) => string,
  maxAnimatedExits = DEFAULT_MAX_ANIMATED_EXITS,
): AnimatedItem<T>[] {
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set());
  const [exitingMap, setExitingMap] = useState<
    Map<string, { index: number; item: T }>
  >(new Map());
  const prevOrderRef = useRef<{ item: T; key: string }[]>([]);
  const enterTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Detect list insertions and removals by diffing against previous order.
  useEffect(() => {
    const clearExitTimers = () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };

    const clearEnterTimers = () => {
      for (const timer of enterTimersRef.current.values()) {
        clearTimeout(timer);
      }
      enterTimersRef.current.clear();
    };

    const prev = prevOrderRef.current;
    const nextOrder = items.map((item) => ({ item, key: getKey(item) }));
    const currentKeys = new Set(nextOrder.map(({ key }) => key));
    const previousKeys = new Set(prev.map(({ key }) => key));
    const newExiting = new Map<string, { index: number; item: T }>();
    const newEntering: string[] = [];

    for (const { key } of nextOrder) {
      if (!previousKeys.has(key)) {
        newEntering.push(key);
      }
    }

    for (let i = 0; i < prev.length; i++) {
      const { item, key } = prev[i];
      if (!currentKeys.has(key)) {
        newExiting.set(key, { index: i, item });
      }
    }

    prevOrderRef.current = nextOrder;

    if (prev.length === 0) {
      return;
    }

    if (newEntering.length > 0) {
      if (newEntering.length > maxAnimatedExits) {
        clearEnterTimers();
        setEnteringKeys((currentKeys) =>
          currentKeys.size === 0 ? currentKeys : new Set(),
        );
      } else {
        setEnteringKeys((currentKeys) => {
          const nextKeys = new Set(currentKeys);
          let changed = false;
          for (const key of newEntering) {
            if (!nextKeys.has(key)) {
              nextKeys.add(key);
              changed = true;
            }
          }
          return changed ? nextKeys : currentKeys;
        });

        for (const key of newEntering) {
          if (enterTimersRef.current.has(key)) continue;
          enterTimersRef.current.set(
            key,
            setTimeout(() => {
              enterTimersRef.current.delete(key);
              setEnteringKeys((currentKeys) => {
                if (!currentKeys.has(key)) {
                  return currentKeys;
                }

                const nextKeys = new Set(currentKeys);
                nextKeys.delete(key);
                return nextKeys;
              });
            }, ENTER_DURATION_MS),
          );
        }
      }
    }

    if (newExiting.size === 0) return;

    if (newExiting.size > maxAnimatedExits) {
      clearExitTimers();
      setExitingMap((currentMap) =>
        currentMap.size === 0 ? currentMap : new Map(),
      );
      return;
    }

    setExitingMap((m) => {
      const next = new Map(m);
      let changed = false;
      for (const [k, v] of newExiting) {
        if (!next.has(k)) {
          next.set(k, v);
          changed = true;
        }
      }
      return changed ? next : m;
    });

    for (const key of newExiting.keys()) {
      if (timersRef.current.has(key)) continue;
      timersRef.current.set(
        key,
        setTimeout(() => {
          timersRef.current.delete(key);
          setExitingMap((m) => {
            const next = new Map(m);
            next.delete(key);
            return next;
          });
        }, EXIT_DURATION_MS),
      );
    }
  }, [items, getKey, maxAnimatedExits]);

  useEffect(
    () => () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
      for (const t of enterTimersRef.current.values()) clearTimeout(t);
    },
    [],
  );

  // Build merged list: current items + exiting items at their last positions
  return useMemo(() => {
    const currentKeys = new Set(items.map(getKey));
    const result: AnimatedItem<T>[] = items.map((item) => ({
      entering: enteringKeys.has(getKey(item)),
      exiting: false,
      item,
      key: getKey(item),
    }));
    const toInsert = [...exitingMap.entries()]
      .filter(([k]) => !currentKeys.has(k))
      .sort((a, b) => a[1].index - b[1].index);
    for (const [key, { index, item }] of toInsert) {
      const pos = Math.min(index, result.length);
      result.splice(pos, 0, { entering: false, exiting: true, item, key });
    }
    return result;
  }, [items, enteringKeys, exitingMap, getKey]);
}
