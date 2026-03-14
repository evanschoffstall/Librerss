"use client";

import { useSwipeGesture } from "./useSwipeGesture";

/** Maps rightward touch swipes onto article read/unread toggles. */
export function useSwipeToRead(
  onMarkRead: () => void,
  disabled = false,
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean,
  reattachKey?: boolean | number | string,
) {
  return useSwipeGesture(
    "right",
    onMarkRead,
    disabled,
    shouldIgnoreTarget,
    reattachKey,
  );
}
