"use client";

import { useEffect, useRef, useState } from "react";

const EXIT_DURATION_MS = 300;

interface AnimatedItem<T> {
  item: T;
  key: string;
  exiting: boolean;
}

/**
 * Tracks items leaving a list and keeps them rendered with `exiting: true`
 * for EXIT_DURATION_MS so an exit animation can play before removal.
 * Exiting items are inserted at their last-known position in the list.
 */
export function useAnimatedList<T>(
  items: T[],
  getKey: (item: T) => string,
): AnimatedItem<T>[] {
  const [exitingMap, setExitingMap] = useState<
    Map<string, { item: T; index: number }>
  >(new Map());
  const prevOrderRef = useRef<{ key: string; item: T }[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const currentKeys = new Set(items.map(getKey));

  // Detect newly removed items by diffing against previous order
  // Using items as the dep so this only runs when the list reference changes
  useEffect(() => {
    const prev = prevOrderRef.current;
    const cKeys = new Set(items.map(getKey));
    const newExiting = new Map<string, { item: T; index: number }>();

    for (let i = 0; i < prev.length; i++) {
      const { key, item } = prev[i];
      if (!cKeys.has(key)) {
        newExiting.set(key, { item, index: i });
      }
    }

    // Store current order for next diff
    prevOrderRef.current = items.map((item) => ({ key: getKey(item), item }));

    if (newExiting.size === 0) return;

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
  }, [items, getKey]);

  useEffect(
    () => () => {
      for (const t of timersRef.current.values()) clearTimeout(t);
    },
    [],
  );

  // Build merged list: current items + exiting items at their last positions
  const result: AnimatedItem<T>[] = items.map((item) => ({
    item,
    key: getKey(item),
    exiting: false,
  }));

  // Insert exiting items at clamped positions
  const toInsert = [...exitingMap.entries()]
    .filter(([k]) => !currentKeys.has(k))
    .sort((a, b) => a[1].index - b[1].index);

  for (const [key, { item, index }] of toInsert) {
    const pos = Math.min(index, result.length);
    result.splice(pos, 0, { item, key, exiting: true });
  }

  return result;
}
