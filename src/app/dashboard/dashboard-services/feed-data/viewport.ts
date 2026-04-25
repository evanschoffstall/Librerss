interface ObserveFeedViewportLayoutOptions {
  findAnchor: () => Element | null;
  onLayoutChange: () => void;
  viewport: HTMLElement;
}

interface ResolveFeedViewportOptions {
  candidateViewports: (HTMLElement | null)[];
  fallbackViewport: HTMLElement;
}

/**
 * Process the find dashboard feed viewport.
 * @returns The find dashboard feed viewport.
 */
export function findDashboardFeedViewport() {
  const viewports = document.querySelectorAll<HTMLElement>(
    "[data-radix-scroll-area-viewport]",
  );

  return Array.from(viewports).find(isDashboardFeedViewport) ?? null;
}

/**
 * Return the viewport offset top.
 * @param element - The element.
 * @param viewport - The viewport.
 * @returns The viewport offset top.
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
 * Return whether is dashboard feed viewport.
 * @param viewport - The viewport.
 * @returns Whether is dashboard feed viewport.
 */
export function isDashboardFeedViewport(viewport: HTMLElement) {
  return Boolean(
    viewport.querySelector(
      "[data-feed-virtualizer='true'], [data-scroll-restore-key]",
    ),
  );
}

/**
 * Process the observe feed viewport layout.
 * @param options - The options used to process the observe feed viewport layout.
 * @returns The observe feed viewport layout.
 */
export function observeFeedViewportLayout(
  options: ObserveFeedViewportLayoutOptions,
) {
  const { findAnchor, onLayoutChange, viewport } = options;
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
   * Process the observe resize target.
   * @param target - The target.
   */
  const observeResizeTarget = (target: Element | null) => {
    if (!resizeObserver || !target) {
      return;
    }

    resizeObserver.observe(target);
  };

  /**
   * Process the observe resize targets.
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
 * Resolve the feed viewport.
 * @param options - The options used to resolve the feed viewport.
 * @returns The feed viewport.
 */
export function resolveFeedViewport(options: ResolveFeedViewportOptions) {
  const { candidateViewports, fallbackViewport } = options;
  for (const viewport of candidateViewports) {
    if (viewport) {
      return viewport;
    }
  }

  return fallbackViewport.isConnected ? fallbackViewport : null;
}
