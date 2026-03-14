"use client";

import { useSwipeGesture } from "./useSwipeGesture";

export function useSwipeToRead(
  onMarkRead: () => void,
  disabled = false,
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean,
) {
  return useSwipeGesture("right", onMarkRead, disabled, shouldIgnoreTarget);
}
