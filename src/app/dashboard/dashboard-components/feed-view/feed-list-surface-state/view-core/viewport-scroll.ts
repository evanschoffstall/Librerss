/** Calculates the current maximum scrollTop for a viewport. */
export function readViewportMaxScrollTop(viewport: HTMLElement) {
  try {
    return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  } catch {
    return 0;
  }
}

/** Pins the viewport to its current bottom edge when it is not already there. */
export function syncViewportToBottomIfNeeded(viewport: HTMLElement) {
  const maxScrollTop = readViewportMaxScrollTop(viewport);

  if (maxScrollTop <= 0 || Math.abs(viewport.scrollTop - maxScrollTop) <= 1) {
    return false;
  }

  viewport.scrollTop = maxScrollTop;
  return true;
}
