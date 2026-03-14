"use client";

import { useSwipeGesture } from "./useSwipeGesture";

export function useSwipeToStar(
  onToggleStar: () => void,
  disabled = false,
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean,
) {
  return useSwipeGesture("left", onToggleStar, disabled, shouldIgnoreTarget);
}
