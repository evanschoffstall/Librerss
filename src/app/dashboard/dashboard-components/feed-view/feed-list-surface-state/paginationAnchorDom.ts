/**
 * Describes the inverted pagination anchor frame ref.
 */
interface InvertedPaginationAnchorFrameRef {
  current: null | number;
}

/**
 * Resolve the best container to use for inverted pagination anchor lookups.
 * @param scrollViewport - The active scroll viewport that owns the feed surface.
 * @returns The container that currently hosts visible article rows for anchor lookup.
 */
export function resolvePaginationAnchorContainer(scrollViewport: HTMLElement) {
  const relatedFeedRoot =
    scrollViewport.closest<HTMLElement>("[data-feed-surface-mode]") ??
    scrollViewport;
  const candidateContainers = Array.from(
    document.querySelectorAll<HTMLElement>(
      "[data-radix-scroll-area-viewport], [data-feed-surface-mode], [data-feed-virtualizer]",
    ),
  );

  return (
    candidateContainers.find((candidate) => {
      const rect = candidate.getBoundingClientRect();

      return (
        (candidate === scrollViewport ||
          candidate.contains(scrollViewport) ||
          relatedFeedRoot.contains(candidate)) &&
        candidate.querySelector("article[data-article-key]") !== null &&
        rect.width > 0 &&
        rect.height > 0 &&
        window.getComputedStyle(candidate).visibility !== "hidden"
      );
    }) ?? scrollViewport
  );
}

/**
 * Resolve the current DOM anchor element used to preserve inverted pagination offset.
 * @param anchorArticleKey - The keyed article or placeholder row that should anchor scroll restoration.
 * @param scrollViewport - The active feed viewport.
 * @param paginationAnchorContainer - The preferred container used for anchor lookups.
 * @returns The resolved DOM anchor element, if one is currently available.
 */
export function resolvePaginationAnchorElement(
  anchorArticleKey: null | string,
  scrollViewport: HTMLElement,
  paginationAnchorContainer: HTMLElement,
) {
  if (!anchorArticleKey) {
    return null;
  }

  const escapedAnchorArticleKey = CSS.escape(anchorArticleKey);
  const selectors = [
    `article[data-article-key="${escapedAnchorArticleKey}"]`,
    `[data-scroll-restore-key="${escapedAnchorArticleKey}"]`,
    `article[data-article-key="${escapedAnchorArticleKey}"] [data-article-swipe-zone='header']`,
  ] as const;

  return findAnchorElementInRoots(
    [paginationAnchorContainer, scrollViewport],
    selectors,
  );
}

/**
 * Queue a pagination-anchor sync for the next animation frame, replacing any pending frame.
 * @param invertedPaginationAnchorFrameRef - Stores the active pagination-anchor animation frame id.
 * @param syncInvertedPaginationAnchor - Synchronizes the current pagination anchor state.
 */
export function scheduleInvertedPaginationAnchorSync(
  invertedPaginationAnchorFrameRef: InvertedPaginationAnchorFrameRef,
  syncInvertedPaginationAnchor: () => number | undefined,
) {
  if (invertedPaginationAnchorFrameRef.current !== null) {
    window.cancelAnimationFrame(invertedPaginationAnchorFrameRef.current);
  }

  invertedPaginationAnchorFrameRef.current = window.requestAnimationFrame(
    () => {
      invertedPaginationAnchorFrameRef.current = null;
      syncInvertedPaginationAnchor();
    },
  );
}

/**
 * Return whether the current pagination anchor release deadline has elapsed.
 * @param releaseAt - The performance timestamp at which the anchor may release.
 * @returns Whether the anchor may release now.
 */
export function shouldReleasePaginationAnchor(releaseAt: number) {
  return performance.now() >= releaseAt;
}

/**
 * Find the first matching anchor element from the provided roots and selector order.
 * @param roots - Candidate root elements to inspect in priority order.
 * @param selectors - Ordered selectors for matching article rows or restore placeholders.
 * @returns The first matching anchor element, or null when none are present.
 */
function findAnchorElementInRoots(
  roots: readonly HTMLElement[],
  selectors: readonly string[],
) {
  for (const root of roots) {
    for (const selector of selectors) {
      const match = root.querySelector<HTMLElement>(selector);

      if (match !== null) {
        return match;
      }
    }
  }

  return null;
}
