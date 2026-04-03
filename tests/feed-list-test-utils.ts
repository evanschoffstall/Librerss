import { type Article } from "@/lib";

export const MOBILE_INVERTED_SCROLL_STORAGE_KEY = "librerss:mobileInvertedScroll";

const originalMatchMedia = window.matchMedia;
const originalResizeObserver = globalThis.ResizeObserver;
const originalGlobalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalGlobalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;
const originalGlobalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const originalWindowLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);
let isFeedListMobileViewport = false;

export class FeedListResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  disconnect() {}

  observe(target: Element) {
    const height = resolveResizeObserverHeight(target);
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
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: window.localStorage,
    writable: true,
  });
  window.localStorage.setItem(
    MOBILE_INVERTED_SCROLL_STORAGE_KEY,
    JSON.stringify(false),
  );

  const requestAnimationFrameMock = ((callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0) as unknown as number) as typeof window.requestAnimationFrame;
  const cancelAnimationFrameMock = ((frameId: number) => {
    clearTimeout(frameId);
  }) as typeof window.cancelAnimationFrame;

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
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: requestAnimationFrameMock,
    writable: true,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: requestAnimationFrameMock,
    writable: true,
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: cancelAnimationFrameMock,
    writable: true,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: cancelAnimationFrameMock,
    writable: true,
  });
}

/** Restores global DOM shims after a feed-list test completes. */
export function restoreFeedListDomMocks() {
  isFeedListMobileViewport = false;
  window.localStorage.removeItem(MOBILE_INVERTED_SCROLL_STORAGE_KEY);

  if (originalGlobalLocalStorageDescriptor) {
    Object.defineProperty(
      globalThis,
      "localStorage",
      originalGlobalLocalStorageDescriptor,
    );
  }

  if (originalWindowLocalStorageDescriptor) {
    Object.defineProperty(window, "localStorage", originalWindowLocalStorageDescriptor);
  }

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
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: originalRequestAnimationFrame,
    writable: true,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: originalGlobalRequestAnimationFrame,
    writable: true,
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: originalCancelAnimationFrame,
    writable: true,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: originalGlobalCancelAnimationFrame,
    writable: true,
  });
}

/** Sets the viewport mode FeedList should observe from the matchMedia mock. */
export function setFeedListMobileViewport(isMobileViewport: boolean) {
  isFeedListMobileViewport = isMobileViewport;
}

function resolveResizeObserverHeight(target: Element) {
  if (!(target instanceof HTMLElement)) {
    return 96;
  }

  const renderedRows = target.querySelectorAll("[data-scroll-restore-key]").length;

  if (renderedRows > 0) {
    return renderedRows * 60;
  }

  return target.clientHeight || target.scrollHeight || target.getBoundingClientRect().height || 96;
}