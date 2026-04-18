interface ObserveFeedViewportLayoutOptions {
  findAnchor: () => Element | null;
  onLayoutChange: () => void;
  viewport: HTMLElement;
}

interface ResolveFeedViewportOptions {
  candidateViewports: (HTMLElement | null)[];
  fallbackViewport: HTMLElement;
}

/** Finds the active dashboard feed viewport that owns feed restore anchors. */
export function findDashboardFeedViewport() {
  const viewports = document.querySelectorAll<HTMLElement>(
    "[data-radix-scroll-area-viewport]",
  );

  return Array.from(viewports).find(isDashboardFeedViewport) ?? null;
}

/**
 * @param element
 * @param viewport
 */
export function getViewportOffsetTop(
  element: HTMLElement,
  viewport: HTMLElement,
) {
  return (
    element.getBoundingClientRect().top - viewport.getBoundingClientRect().top
  );
}

/**
 * Detects whether a Radix viewport belongs to the dashboard feed surface.
 * @param viewport
 */
export function isDashboardFeedViewport(viewport: HTMLElement) {
  return Boolean(
    viewport.querySelector(
      "[data-feed-virtualizer='true'], [data-scroll-restore-key]",
    ),
  );
}

/**
 * Observes feed viewport layout changes and rebinds resize targets when the
 * anchor subtree changes.
 * @param root0
 * @param root0.findAnchor
 * @param root0.onLayoutChange
 * @param root0.viewport
 */
export function observeFeedViewportLayout({
  findAnchor,
  onLayoutChange,
  viewport,
}: ObserveFeedViewportLayoutOptions) {
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          onLayoutChange();
        });
  const mutationObserver =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          observeResizeTargets();
          onLayoutChange();
        });

  /**
   * @param target
   */
  const observeResizeTarget = (target: Element | null) => {
    if (!resizeObserver || !target) {
      return;
    }

    resizeObserver.observe(target);
  };

  /**
   *
   */
  const observeResizeTargets = () => {
    resizeObserver?.disconnect();
    observeResizeTarget(viewport);
    observeResizeTarget(viewport.firstElementChild);
    observeResizeTarget(findAnchor());
  };

  observeResizeTargets();
  mutationObserver?.observe(viewport, {
    childList: true,
    subtree: true,
  });

  return () => {
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
  };
}

/**
 * Resolves the first live viewport candidate and otherwise falls back to the current viewport.
 * @param root0
 * @param root0.candidateViewports
 * @param root0.fallbackViewport
 */
export function resolveFeedViewport({
  candidateViewports,
  fallbackViewport,
}: ResolveFeedViewportOptions) {
  for (const viewport of candidateViewports) {
    if (viewport) {
      return viewport;
    }
  }

  return fallbackViewport.isConnected ? fallbackViewport : null;
}
