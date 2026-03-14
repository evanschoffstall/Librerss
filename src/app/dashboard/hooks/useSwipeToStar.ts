"use client";

import { useSwipeGesture } from "./useSwipeGesture";

/** Maps leftward touch swipes onto article star/unstar toggles. */
export function useSwipeToStar(
  onToggleStar: () => void,
  disabled = false,
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean,
  reattachKey?: boolean | number | string,
) {
  return useSwipeGesture(
    "left",
    onToggleStar,
    disabled,
    shouldIgnoreTarget,
    reattachKey,
  );
}
