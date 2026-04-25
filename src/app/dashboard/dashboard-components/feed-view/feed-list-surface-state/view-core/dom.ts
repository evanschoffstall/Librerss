import {
  type ArticleExpandPreparedDetail,
  type InvertedExpansionScrollLockObserverOptions,
  type ShouldAutoAnchorInvertedScrollViewportOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core/types";
import {
  findDashboardFeedViewport,
  isDashboardFeedViewport,
  observeFeedViewportLayout,
  resolveFeedViewport,
} from "@/app/dashboard/dashboard-services/feed-data";

interface VisibleAnchorCandidate {
  element: HTMLElement;
  intersectsViewport: boolean;
  visibleScore: number;
}

interface VisibleArticleHeaderEntry {
  articleKey: string;
  fullyVisible: boolean;
  headerTop: number;
}

const INVERTED_PAGINATION_STABLE_ANCHOR_OFFSET_PX = 144;

/**
 * Process the collect fully visible article keys.
 * @param viewport - The viewport.
 * @returns The collect fully visible article keys.
 */
export function collectFullyVisibleArticleKeys(viewport: HTMLElement) {
  const viewportRect = viewport.getBoundingClientRect();

  return Array.from(
    viewport.querySelectorAll<HTMLElement>("article[data-article-key]"),
  )
    .filter((articleElement) => {
      const articleRect = articleElement.getBoundingClientRect();

      return (
        articleRect.top >= viewportRect.top &&
        articleRect.bottom <= viewportRect.bottom
      );
    })
    .map((articleElement) => articleElement.dataset.articleKey)
    .filter((articleKey): articleKey is string => Boolean(articleKey));
}

/**
 * Process the find inverted expansion header anchor.
 * @param articleKey - The article key.
 * @param viewport - The preferred viewport that should own the anchor lookup.
 * @returns The find inverted expansion header anchor.
 */
export function findInvertedExpansionHeaderAnchor(
  articleKey: null | string,
  viewport?: HTMLElement,
) {
  if (!articleKey) {
    return null;
  }

  return findBestVisibleAnchorCandidate(
    `article[data-article-key="${CSS.escape(articleKey)}"] [data-article-swipe-zone='header']`,
    viewport,
  );
}

/**
 * Process the find inverted expansion lock anchor.
 * @param articleKey - The article key.
 * @param viewport - The preferred viewport that should own the anchor lookup.
 * @returns The find inverted expansion lock anchor.
 */
export function findInvertedExpansionLockAnchor(
  articleKey: null | string,
  viewport?: HTMLElement,
) {
  if (!articleKey) {
    return null;
  }

  return findBestVisibleAnchorCandidate(
    `[data-scroll-restore-key="${CSS.escape(articleKey)}"], article[data-article-key="${CSS.escape(articleKey)}"]`,
    viewport,
  );
}

/**
 * Process the find inverted expansion lock viewport.
 * @returns The find inverted expansion lock viewport.
 */
export function findInvertedExpansionLockViewport() {
  return findDashboardFeedViewport();
}

/**
 * Process the find top visible inverted pagination anchor article key.
 * @param viewport - The viewport to inspect for currently visible articles.
 * @returns The find top visible inverted pagination anchor article key.
 */
export function findTopVisibleInvertedPaginationAnchorArticleKey(
  viewport?: HTMLElement,
) {
  const resolvedViewport = viewport ?? findInvertedExpansionLockViewport();

  if (!resolvedViewport) {
    return null;
  }

  const viewportRect = resolvedViewport.getBoundingClientRect();
  const visibleArticles = Array.from(
    resolvedViewport.querySelectorAll<HTMLElement>("article[data-article-key]"),
  )
    .map((articleElement) => {
      const articleKey = articleElement.dataset.articleKey ?? null;

      if (!articleKey) {
        return null;
      }

      const articleRect = articleElement.getBoundingClientRect();

      if (
        articleRect.bottom <= viewportRect.top ||
        articleRect.top >= viewportRect.bottom
      ) {
        return null;
      }

      return {
        articleKey,
        fullyVisible:
          articleRect.top >= viewportRect.top &&
          articleRect.bottom <= viewportRect.bottom,
        offsetTop: articleRect.top - viewportRect.top,
      };
    })
    .filter(
      (
        article,
      ): article is {
        articleKey: string;
        fullyVisible: boolean;
        offsetTop: number;
      } => article !== null,
    )
    .sort((left, right) => left.offsetTop - right.offsetTop);

  const stableVisibleArticle = visibleArticles.find((entry) => {
    return entry.offsetTop >= INVERTED_PAGINATION_STABLE_ANCHOR_OFFSET_PX;
  });

  if (stableVisibleArticle) {
    return stableVisibleArticle.articleKey;
  }

  return visibleArticles.length > 0 ? visibleArticles[0].articleKey : null;
}

/**
 * Process the find visible inverted removal anchor article key.
 * @param excludedArticleKeys - The excluded article keys.
 * @returns The find visible inverted removal anchor article key.
 */
export function findVisibleInvertedRemovalAnchorArticleKey(
  excludedArticleKeys: ReadonlySet<string>,
) {
  const viewport = findInvertedExpansionLockViewport();

  if (!viewport) {
    return null;
  }

  const visibleArticles = collectVisibleArticleHeaderEntries(
    viewport,
    excludedArticleKeys,
  ).sort((left, right) => {
    if (left.fullyVisible !== right.fullyVisible) {
      return left.fullyVisible ? -1 : 1;
    }

    return left.headerTop - right.headerTop;
  });

  return visibleArticles[0]?.articleKey ?? null;
}

/**
 * Return the viewport offset top.
 * @param element - The element.
 * @param viewport - The viewport.
 * @returns The viewport offset top.
 */
export function getViewportOffsetTop(
  element: HTMLElement | null,
  viewport: HTMLElement,
) {
  if (!element) {
    return 0;
  }

  return (
    element.getBoundingClientRect().top - viewport.getBoundingClientRect().top
  );
}

/**
 * Return whether is inverted expansion lock viewport.
 * @param viewport - The viewport.
 * @returns Whether is inverted expansion lock viewport.
 */
export function isInvertedExpansionLockViewport(viewport: HTMLElement) {
  return isDashboardFeedViewport(viewport);
}

/**
 * Process the observe inverted expansion scroll lock layout.
 * @param options - The options used to process the observe inverted expansion scroll lock layout.
 * @returns The observe inverted expansion scroll lock layout.
 */
export function observeInvertedExpansionScrollLockLayout(
  options: InvertedExpansionScrollLockObserverOptions,
) {
  const { articleKey, onLayoutChange, viewport } = options;
  return observeFeedViewportLayout({
    /**
     * Resolves the current anchor element for inverted expansion scroll locking.
     * @returns The best available anchor element for the active article.
     */
    findAnchor: () =>
      findInvertedExpansionHeaderAnchor(articleKey, viewport) ??
      findInvertedExpansionLockAnchor(articleKey, viewport),
    onLayoutChange,
    viewport,
  });
}

/**
 * Process the read prepared article key.
 * @param event - The incoming event.
 * @returns The read prepared article key.
 */
export function readPreparedArticleKey(event: Event) {
  if (!(event instanceof CustomEvent)) {
    return null;
  }

  const detail = event.detail as ArticleExpandPreparedDetail | null;

  return typeof detail?.articleKey === "string" ? detail.articleKey : null;
}

/**
 * Resolve the inverted expansion lock viewport.
 * @param articleKey - The article key.
 * @param viewport - The viewport.
 * @returns The inverted expansion lock viewport.
 */
export function resolveInvertedExpansionLockViewport(
  articleKey: null | string,
  viewport: HTMLElement,
) {
  return resolveFeedViewport({
    candidateViewports: [
      findInvertedExpansionLockAnchor(
        articleKey,
        viewport,
      )?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null,
      isInvertedExpansionLockViewport(viewport) ? viewport : null,
      findInvertedExpansionLockViewport(),
    ],
    fallbackViewport: viewport,
  });
}

/**
 * Select the best currently visible element from a set of candidates.
 * @param candidates - Candidate elements that may anchor a viewport restore.
 * @param viewport - The viewport used to score candidate visibility.
 * @returns The highest-ranked visible candidate, or the first available element.
 */
export function selectBestVisibleElement(
  candidates: HTMLElement[],
  viewport: HTMLElement,
) {
  const viewportRect = viewport.getBoundingClientRect();
  const sortedCandidates = candidates
    .map<null | VisibleAnchorCandidate>((element) => {
      if (!element.isConnected) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      const headerTop = rect.top - viewportRect.top;
      const headerBottom = rect.bottom - viewportRect.top;

      return {
        element,
        intersectsViewport:
          headerBottom > 0 && headerTop < viewport.clientHeight,
        visibleScore:
          Math.abs(Math.max(0, headerTop)) +
          Math.abs(Math.min(0, viewport.clientHeight - headerBottom)),
      };
    })
    .filter(
      (candidate): candidate is VisibleAnchorCandidate => candidate !== null,
    )
    .sort((left, right) => {
      if (left.intersectsViewport !== right.intersectsViewport) {
        return left.intersectsViewport ? -1 : 1;
      }

      return left.visibleScore - right.visibleScore;
    });

  if (sortedCandidates.length > 0) {
    return sortedCandidates[0].element;
  }

  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Return whether should auto anchor inverted scroll viewport.
 * @param options - The options used to return whether should auto anchor inverted scroll viewport.
 * @returns Whether should auto anchor inverted scroll viewport.
 */
export function shouldAutoAnchorInvertedScrollViewport(
  options: ShouldAutoAnchorInvertedScrollViewportOptions,
) {
  const {
    expandedArticleKey,
    hasClaimedInvertedScrollOwnership,
    isInvertedScroll,
    isUnderfilledInvertedViewport,
  } = options;
  return (
    isInvertedScroll &&
    expandedArticleKey === null &&
    (!hasClaimedInvertedScrollOwnership || isUnderfilledInvertedViewport)
  );
}

/**
 * Process the collect visible article header entries.
 * @param viewport - The viewport.
 * @param excludedArticleKeys - The excluded article keys.
 * @returns The collect visible article header entries.
 */
function collectVisibleArticleHeaderEntries(
  viewport: HTMLElement,
  excludedArticleKeys: ReadonlySet<string> = new Set<string>(),
) {
  const viewportRect = viewport.getBoundingClientRect();

  return Array.from(
    viewport.querySelectorAll<HTMLElement>(
      "article[data-article-key] [data-article-swipe-zone='header']",
    ),
  )
    .map((headerElement) => {
      const articleElement = headerElement.closest<HTMLElement>(
        "article[data-article-key]",
      );
      const articleKey = articleElement?.dataset.articleKey ?? null;

      if (!articleKey || excludedArticleKeys.has(articleKey)) {
        return null;
      }

      const headerRect = headerElement.getBoundingClientRect();

      if (
        headerRect.bottom <= viewportRect.top ||
        headerRect.top >= viewportRect.bottom
      ) {
        return null;
      }

      return {
        articleKey,
        fullyVisible:
          headerRect.top >= viewportRect.top &&
          headerRect.bottom <= viewportRect.bottom,
        headerTop: headerRect.top,
      } satisfies VisibleArticleHeaderEntry;
    })
    .filter((entry): entry is VisibleArticleHeaderEntry => entry !== null);
}

/**
 * Find the best visible anchor candidate for a selector within the preferred viewport.
 * @param selector - The selector used to collect candidate elements.
 * @param viewport - The preferred viewport that should own the anchor lookup.
 * @returns The most relevant visible anchor element for the selector.
 */
function findBestVisibleAnchorCandidate(
  selector: string,
  viewport?: HTMLElement,
) {
  const resolvedViewport = viewport ?? findDashboardFeedViewport();

  if (resolvedViewport) {
    return selectBestVisibleElement(
      Array.from(resolvedViewport.querySelectorAll<HTMLElement>(selector)),
      resolvedViewport,
    );
  }

  return document.querySelector<HTMLElement>(selector);
}
