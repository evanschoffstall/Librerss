"use client";

import { useSwipeGesture } from "./useSwipeGesture";

export function useSwipeToRead(onMarkRead: () => void, disabled = false) {
  return useSwipeGesture("right", onMarkRead, disabled);
}
