import { type Article } from "@/lib";

export const MOBILE_INVERTED_SCROLL_STORAGE_KEY = "librerss:mobileInvertedScroll";

const originalMatchMedia = window.matchMedia;
const originalResizeObserver = globalThis.ResizeObserver;
let isFeedListMobileViewport = false;

export class FeedListResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  disconnect() {}

  observe(target: Element) {
    const height =
      target instanceof HTMLElement
        ? target.clientHeight || target.scrollHeight || target.getBoundingClientRect().height || 96
        : 96;
    const width =
      target instanceof HTMLElement
        ? target.clientWidth || target.scrollWidth || target.getBoundingClientRect().width || 320
        : 320;

    queueMicrotask(() => {
      this.callback(
        [
          {
            borderBoxSize: [] as ResizeObserverSize[],
            contentBoxSize: [] as ResizeObserverSize[],
            contentRect: {
              bottom: height,
              height,
              left: 0,
              right: width,
              toJSON: () => ({}),
              top: 0,
              width,
              x: 0,
              y: 0,
            },
            devicePixelContentBoxSize: [] as ResizeObserverSize[],
            target,
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    });
  }

  unobserve() {}
}

/** Builds a stable feed article fixture for dashboard list tests. */
export function buildFeedListArticle(overrides?: Partial<Article>): Article {
  return {
    content: "Short preview content for the article card.",
    feedId: 1,
    feedName: "Example Feed",
    feedUrl: "https://example.com/feed.xml",
    hasFullContent: false,
    id: 1,
    isRead: false,
    isStarred: false,
    lastChecked: new Date("2026-03-13T10:00:00.000Z"),
    link: "https://example.com/articles/perf",
    publicationDate: new Date("2026-03-13T09:00:00.000Z"),
    title: "Performance-sensitive article",
    ...overrides,
  };
}

/** Installs the DOM shims FeedList relies on in Bun's happy-dom environment. */
export function installFeedListDomMocks() {
  isFeedListMobileViewport = false;
  window.localStorage.setItem(
    MOBILE_INVERTED_SCROLL_STORAGE_KEY,
    JSON.stringify(false),
  );

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: isFeedListMobileViewport && query.includes("max-width"),
      media: query,
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {},
    }),
    writable: true,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: FeedListResizeObserverMock,
    writable: true,
  });
}

/** Restores global DOM shims after a feed-list test completes. */
export function restoreFeedListDomMocks() {
  isFeedListMobileViewport = false;
  window.localStorage.removeItem(MOBILE_INVERTED_SCROLL_STORAGE_KEY);

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
    writable: true,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: originalResizeObserver,
    writable: true,
  });
}

/** Sets the viewport mode FeedList should observe from the matchMedia mock. */
export function setFeedListMobileViewport(isMobileViewport: boolean) {
  isFeedListMobileViewport = isMobileViewport;
}