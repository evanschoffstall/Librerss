"use client";

import { useSwipeGesture } from "./useSwipeGesture";

export function useSwipeToStar(onToggleStar: () => void, disabled = false) {
  return useSwipeGesture("left", onToggleStar, disabled);
}
