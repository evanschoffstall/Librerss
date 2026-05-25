/**
 * Observe feed height owners that can change the scroll range after virtual row measurement.
 * @param viewport - Active feed viewport that owns the rendered feed surface.
 * @param onLayoutChange - Callback invoked whenever an observed height owner resizes.
 * @returns Cleanup callback that disconnects the observer.
 */
export function observeFeedViewportHeightOwners(
  viewport: HTMLElement,
  onLayoutChange: () => void,
) {
  if (typeof ResizeObserver === "undefined") {
    return () => undefined;
  }

  const observer = new ResizeObserver(onLayoutChange);
  const observedElements = new Set<HTMLElement>([viewport]);

  for (const feedHeightOwner of viewport.querySelectorAll<HTMLElement>(
    "[data-feed-surface-mode], [data-feed-virtualizer], [data-feed-load-more-skeletons]",
  )) {
    observedElements.add(feedHeightOwner);
  }

  for (const observedElement of observedElements) {
    observer.observe(observedElement);
  }

  return () => {
    observer.disconnect();
  };
}

/**
 * Read the largest scrollTop value currently available for a feed viewport.
 * @param viewport - Scrollable feed viewport whose scroll range should be measured.
 * @returns The non-negative maximum scrollTop, or zero when layout metrics are unavailable.
 */
export function readViewportMaxScrollTop(viewport: HTMLElement) {
  try {
    return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  } catch {
    return 0;
  }
}

/**
 * Move a feed viewport to its current bottom boundary when it is not already there.
 * @param viewport - Scrollable feed viewport that should stay anchored to the bottom.
 * @returns Whether the helper changed the viewport scrollTop.
 */
export function syncViewportToBottomIfNeeded(viewport: HTMLElement) {
  const maxScrollTop = readViewportMaxScrollTop(viewport);

  if (maxScrollTop <= 0 || Math.abs(viewport.scrollTop - maxScrollTop) <= 1) {
    return false;
  }

  viewport.scrollTop = maxScrollTop;
  return true;
}
