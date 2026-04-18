/**
 * Process the read viewport max scroll top.
 * @param viewport - The viewport.
 * @returns The read viewport max scroll top.
 */
export function readViewportMaxScrollTop(viewport: HTMLElement) {
  try {
    return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  } catch {
    return 0;
  }
}

/**
 * Process the sync viewport to bottom if needed.
 * @param viewport - The viewport.
 * @returns Whether sync viewport to bottom if needed.
 */
export function syncViewportToBottomIfNeeded(viewport: HTMLElement) {
  const maxScrollTop = readViewportMaxScrollTop(viewport);

  if (maxScrollTop <= 0 || Math.abs(viewport.scrollTop - maxScrollTop) <= 1) {
    return false;
  }

  viewport.scrollTop = maxScrollTop;
  return true;
}
