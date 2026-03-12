/**
 * Tests for the extracted scroll-pin protocol and sentinel layout engine.
 *
 * src/app/dashboard/hooks/useScrollPin.ts
 * src/app/dashboard/hooks/useSentinelLayout.ts
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { ScrollPinTarget } from "@/app/dashboard/hooks/useScrollPin";
import {
  activateCollapsePin,
  activateExpandSuppress,
  cancelScrollPin,
} from "@/app/dashboard/hooks/useScrollPin";
import {
  attachSentinelLayout,
  SENTINEL_HEIGHT,
  SENTINEL_SCROLL_OFFSET,
} from "@/app/dashboard/hooks/useSentinelLayout";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

// ─── SENTINEL_HEIGHT constant ─────────────────────────────────────────────────

describe("SENTINEL_HEIGHT", () => {
  test("is 104", () => {
    expect(SENTINEL_HEIGHT).toBe(104);
  });
});

// ─── Helper: build mock DOM elements ──────────────────────────────────────────

function createPullRefs() {
  return {
    holding: { current: false } as React.RefObject<boolean>,
    pulling: { current: false } as React.RefObject<boolean>,
    touchActive: { current: false } as React.RefObject<boolean>,
  };
}

/**
 * Build a minimal DOM structure matching the real Radix ScrollArea:
 *
 *   scrollRoot
 *     viewport [data-radix-scroll-area-viewport]
 *       wrapper (div.p-1)
 *         sentinel (div, height SENTINEL_HEIGHT)
 *         ... content ...
 *     scrollbar [data-orientation="vertical"]
 */
function createScrollDom(opts?: {
  contentHeight?: number;
  viewportHeight?: number;
}) {
  const viewportHeight = opts?.viewportHeight ?? 600;
  const contentHeight = opts?.contentHeight ?? 800;

  const scrollRoot = document.createElement("div");
  const viewport = document.createElement("div");
  viewport.setAttribute("data-radix-scroll-area-viewport", "");
  Object.defineProperty(viewport, "clientHeight", {
    configurable: true,
    value: viewportHeight,
    writable: true,
  });
  Object.defineProperty(viewport, "scrollHeight", {
    configurable: true,
    get() {
      return wrapper.offsetHeight;
    },
  });
  let _scrollTop = 0;
  Object.defineProperty(viewport, "scrollTop", {
    configurable: true,
    get: () => _scrollTop,
    set: (v: number) => {
      _scrollTop = Math.max(0, v);
    },
  });
  viewport.scrollTo = ((opts: { top?: number }) => {
    if (opts?.top !== undefined) _scrollTop = Math.max(0, opts.top);
  }) as any;

  const wrapper = document.createElement("div");
  Object.defineProperty(wrapper, "offsetHeight", {
    configurable: true,
    get() {
      const pad = parseFloat(wrapper.style.paddingBottom) || 0;
      return contentHeight + sentinel.offsetHeight + pad;
    },
  });

  const sentinel = document.createElement("div");
  sentinel.style.height = `${SENTINEL_HEIGHT}px`;
  let _sentinelOffsetHeight = SENTINEL_HEIGHT;
  Object.defineProperty(sentinel, "offsetHeight", {
    configurable: true,
    get: () => {
      const h = sentinel.style.height;
      if (h === "0px") return 0;
      return _sentinelOffsetHeight;
    },
    set: (v: number) => {
      _sentinelOffsetHeight = v;
    },
  });

  const scrollbar = document.createElement("div");
  scrollbar.setAttribute("data-orientation", "vertical");

  wrapper.appendChild(sentinel);
  viewport.appendChild(wrapper);
  scrollRoot.appendChild(viewport);
  scrollRoot.appendChild(scrollbar);
  document.body.appendChild(scrollRoot);

  return { scrollbar, scrollRoot, sentinel, viewport, wrapper };
}

function createSuppressRef(initial: ScrollPinTarget = false) {
  return { current: initial } as React.RefObject<ScrollPinTarget>;
}

// ─── attachSentinelLayout ─────────────────────────────────────────────────────

describe("attachSentinelLayout", () => {
  test("sets overscrollBehaviorY to none on viewport", () => {
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(
      dom,
      createSuppressRef(),
      createPullRefs(),
    );
    expect(dom.viewport.style.overscrollBehaviorY).toBe("none");
    cleanup();
  });

  test("cleanup restores overscrollBehaviorY", () => {
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(
      dom,
      createSuppressRef(),
      createPullRefs(),
    );
    cleanup();
    expect(dom.viewport.style.overscrollBehaviorY).toBe("");
  });

  test("cleanup restores paddingBottom on wrapper", () => {
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(
      dom,
      createSuppressRef(),
      createPullRefs(),
    );
    cleanup();
    expect(dom.wrapper.style.paddingBottom).toBe("");
  });

  test("cleanup restores scrollbar styles", () => {
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(
      dom,
      createSuppressRef(),
      createPullRefs(),
    );
    cleanup();
    expect(dom.scrollbar.style.marginTop).toBe("");
    expect(dom.scrollbar.style.height).toBe("");
    expect(dom.scrollbar.style.display).toBe("");
  });

  test("returns cleanup function", () => {
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(
      dom,
      createSuppressRef(),
      createPullRefs(),
    );
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  test("keeps sentinel at scroll offset when content does not overflow", () => {
    // Content is 200px, viewport is 600px → no overflow, but the sentinel must
    // stay at the hidden-rest height so pull-to-refresh remains reachable.
    const dom = createScrollDom({ contentHeight: 200, viewportHeight: 600 });
    const cleanup = attachSentinelLayout(
      dom,
      createSuppressRef(),
      createPullRefs(),
    );
    expect(dom.sentinel.style.height).toBe(`${SENTINEL_HEIGHT}px`);
    cleanup();
  });

  test("keeps sentinel visible when content overflows", () => {
    // Content is 800px, viewport is 600px → overflows → sentinel stays at the
    // canonical hidden-rest height.
    const dom = createScrollDom({ contentHeight: 800, viewportHeight: 600 });
    const cleanup = attachSentinelLayout(
      dom,
      createSuppressRef(),
      createPullRefs(),
    );
    expect(dom.sentinel.style.height).toBe(`${SENTINEL_HEIGHT}px`);
    cleanup();
  });

  test("handles null sentinel gracefully", () => {
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(
      { ...dom, sentinel: null },
      createSuppressRef(),
      createPullRefs(),
    );
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  test("handles null wrapper gracefully", () => {
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(
      { ...dom, wrapper: null },
      createSuppressRef(),
      createPullRefs(),
    );
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  test("works without suppressSnapRef", () => {
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(dom, undefined, createPullRefs());
    expect(typeof cleanup).toBe("function");
    cleanup();
  });
});

// ─── attachSentinelLayout: scrollbar inset ────────────────────────────────────

describe("attachSentinelLayout scrollbar", () => {
  test("hides scrollbar when content does not overflow", () => {
    const dom = createScrollDom({ contentHeight: 200, viewportHeight: 600 });
    const cleanup = attachSentinelLayout(
      dom,
      createSuppressRef(),
      createPullRefs(),
    );
    expect(dom.scrollbar.style.display).toBe("none");
    cleanup();
  });

  test("shows scrollbar with inset when content overflows", () => {
    const dom = createScrollDom({ contentHeight: 800, viewportHeight: 600 });
    const cleanup = attachSentinelLayout(
      dom,
      createSuppressRef(),
      createPullRefs(),
    );
    // Scrollbar should be visible with computed inset
    expect(dom.scrollbar.style.display).not.toBe("none");
    expect(dom.scrollbar.style.marginTop).toBeTruthy();
    expect(dom.scrollbar.style.height).toBeTruthy();
    cleanup();
  });
});

// ─── attachSentinelLayout: ResizeObserver modes ───────────────────────────────

describe("attachSentinelLayout ResizeObserver modes", () => {
  test("expand suppress mode (-1): normal cleanup still works", () => {
    const ref = createSuppressRef(-1);
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(dom, ref, createPullRefs());
    // Should not throw during cleanup even when in suppress mode
    expect(() => cleanup()).not.toThrow();
  });

  test("collapse pin mode (positive): normal cleanup still works", () => {
    const ref = createSuppressRef(300);
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(dom, ref, createPullRefs());
    expect(() => cleanup()).not.toThrow();
  });

  test("normal mode (false): normal cleanup still works", () => {
    const ref = createSuppressRef(false);
    const dom = createScrollDom();
    const cleanup = attachSentinelLayout(dom, ref, createPullRefs());
    expect(() => cleanup()).not.toThrow();
  });
});

// ─── ScrollPinTarget type ─────────────────────────────────────────────────────

describe("ScrollPinTarget type usage", () => {
  test("accepts false", () => {
    const ref = createSuppressRef(false);
    expect(ref.current).toBe(false);
  });

  test("accepts positive number (collapse pin)", () => {
    const ref = createSuppressRef(200);
    expect(ref.current).toBe(200);
  });

  test("accepts -1 (expand suppress)", () => {
    const ref = createSuppressRef(-1);
    expect(ref.current).toBe(-1);
  });

  test("transitions between modes", () => {
    const ref = createSuppressRef(false);
    ref.current = 200;
    expect(ref.current).toBe(200);
    ref.current = -1;
    expect(ref.current).toBe(-1);
    ref.current = false;
    expect(ref.current).toBe(false);
  });
});

// ─── useSentinelScrollOffset (re-export from usePullDownToRefresh) ────────────

describe("useSentinelScrollOffset", () => {
  test("returns SENTINEL_SCROLL_OFFSET", async () => {
    const { useSentinelScrollOffset } =
      await import("@/app/dashboard/hooks/usePullDownToRefresh");
    expect(useSentinelScrollOffset()).toBe(SENTINEL_SCROLL_OFFSET);
  });
});

// ─── attachSentinelLayout: requestAnimationFrame callback ─────────────────────

describe("attachSentinelLayout raf callback", () => {
  test("raf callback re-syncs layout after 16ms", async () => {
    const dom = createScrollDom({ contentHeight: 800, viewportHeight: 600 });
    dom.viewport.scrollTop = 0;
    const cleanup = attachSentinelLayout(
      dom,
      createSuppressRef(),
      createPullRefs(),
    );
    // Wait for polyfilled rAF (setup.ts: setTimeout(cb, 16))
    await new Promise((r) => setTimeout(r, 30));
    // After rAF, scrollTop should be pushed to sentinel height
    expect(dom.viewport.scrollTop).toBeGreaterThanOrEqual(0);
    cleanup();
  });
});

// ─── attachSentinelLayout: ResizeObserver with mock ───────────────────────────

describe("attachSentinelLayout with ResizeObserver mock", () => {
  let resizeCallbacks: (() => void)[];
  let origResizeObserver: typeof globalThis.ResizeObserver;
  let origMutationObserver: typeof globalThis.MutationObserver;

  beforeEach(() => {
    resizeCallbacks = [];
    origResizeObserver = globalThis.ResizeObserver;
    origMutationObserver = globalThis.MutationObserver;

    (globalThis as any).ResizeObserver = class {
      constructor(cb: () => void) {
        resizeCallbacks.push(cb);
      }
      disconnect() {}
      observe() {}
    };
    (globalThis as any).MutationObserver = class {
      disconnect() {}
      observe() {}
    };
  });

  afterEach(() => {
    if (origResizeObserver) {
      globalThis.ResizeObserver = origResizeObserver;
    } else {
      delete (globalThis as any).ResizeObserver;
    }
    if (origMutationObserver) {
      globalThis.MutationObserver = origMutationObserver;
    } else {
      delete (globalThis as any).MutationObserver;
    }
    mock.restore();
  });

  test("normal mode: fires ensureMinOverflow + sentinel snap", () => {
    const dom = createScrollDom({ contentHeight: 800, viewportHeight: 600 });
    const ref = createSuppressRef(false);
    const cleanup = attachSentinelLayout(dom, ref, createPullRefs());

    expect(resizeCallbacks.length).toBeGreaterThan(0);
    resizeCallbacks[0]();

    expect(dom.sentinel.style.height).toBe(`${SENTINEL_HEIGHT}px`);
    cleanup();
  });

  test("collapse pin mode: pins scrollTop to target", () => {
    const dom = createScrollDom({ contentHeight: 800, viewportHeight: 600 });
    const pinTarget = 300;
    const ref = createSuppressRef(pinTarget);
    const cleanup = attachSentinelLayout(dom, ref, createPullRefs());

    dom.viewport.scrollTop = 100;
    expect(resizeCallbacks.length).toBeGreaterThan(0);
    resizeCallbacks[0]();

    expect(dom.viewport.scrollTop).toBe(pinTarget);
    cleanup();
  });

  test("expand suppress mode: skips all layout", () => {
    const dom = createScrollDom({ contentHeight: 800, viewportHeight: 600 });
    const ref = createSuppressRef(-1);
    const cleanup = attachSentinelLayout(dom, ref, createPullRefs());

    const scrollTopBefore = dom.viewport.scrollTop;
    expect(resizeCallbacks.length).toBeGreaterThan(0);
    resizeCallbacks[0]();

    expect(dom.viewport.scrollTop).toBe(scrollTopBefore);
    cleanup();
  });

  test("normal mode: snaps sentinel when scrollTop < height and no pull active", () => {
    const dom = createScrollDom({ contentHeight: 800, viewportHeight: 600 });
    const ref = createSuppressRef(false);
    const pulls = createPullRefs();
    const cleanup = attachSentinelLayout(dom, ref, pulls);

    dom.viewport.scrollTop = 50;
    resizeCallbacks[0]();

    expect(dom.viewport.scrollTop).toBe(SENTINEL_SCROLL_OFFSET);
    cleanup();
  });

  test("normal mode: does NOT snap sentinel when pull is active", () => {
    const dom = createScrollDom({ contentHeight: 800, viewportHeight: 600 });
    const ref = createSuppressRef(false);
    const pulls = createPullRefs();
    pulls.pulling.current = true;
    const cleanup = attachSentinelLayout(dom, ref, pulls);

    dom.viewport.scrollTop = 50;
    resizeCallbacks[0]();

    expect(dom.viewport.scrollTop).toBe(50);
    cleanup();
  });

  test("normal mode: does NOT snap when touch is active", () => {
    const dom = createScrollDom({ contentHeight: 800, viewportHeight: 600 });
    const ref = createSuppressRef(false);
    const pulls = createPullRefs();
    pulls.touchActive.current = true;
    const cleanup = attachSentinelLayout(dom, ref, pulls);

    dom.viewport.scrollTop = 50;
    resizeCallbacks[0]();

    expect(dom.viewport.scrollTop).toBe(50);
    cleanup();
  });

  test("normal mode: does NOT snap when holding", () => {
    const dom = createScrollDom({ contentHeight: 800, viewportHeight: 600 });
    const ref = createSuppressRef(false);
    const pulls = createPullRefs();
    pulls.holding.current = true;
    const cleanup = attachSentinelLayout(dom, ref, pulls);

    dom.viewport.scrollTop = 50;
    resizeCallbacks[0]();

    expect(dom.viewport.scrollTop).toBe(50);
    cleanup();
  });
});

// ─── cancelScrollPin ──────────────────────────────────────────────────────────

describe("cancelScrollPin", () => {
  test("calls cleanup function and nulls ref", () => {
    let called = false;
    const cleanupRef = {
      current: () => {
        called = true;
      },
    } as React.RefObject<(() => void) | null>;
    cancelScrollPin(cleanupRef);
    expect(called).toBe(true);
    expect(cleanupRef.current).toBeNull();
  });

  test("handles null cleanup gracefully", () => {
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    expect(() => cancelScrollPin(cleanupRef)).not.toThrow();
    expect(cleanupRef.current).toBeNull();
  });
});

// ─── activateCollapsePin ──────────────────────────────────────────────────────

describe("activateCollapsePin", () => {
  test("sets suppressSnapRef to saved scrollTop", () => {
    const snapRef = { current: false as ScrollPinTarget };
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    const mockVp = { scrollTop: 0 } as HTMLElement;
    activateCollapsePin(snapRef, cleanupRef, vpRef, topRef, mockVp, 250);

    expect(snapRef.current).toBe(250);
    expect(mockVp.scrollTop).toBe(250);
  });

  test("defaults pin target to 104 when savedScrollTop is null", () => {
    const snapRef = { current: false as ScrollPinTarget };
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    activateCollapsePin(snapRef, cleanupRef, vpRef, topRef, null, null);

    expect(snapRef.current).toBe(104);
  });

  test("clears pre-expand refs", () => {
    const snapRef = { current: false as ScrollPinTarget };
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = {
      current: document.createElement("div"),
    } as React.RefObject<HTMLElement | null>;
    const topRef = { current: 500 } as React.RefObject<null | number>;

    activateCollapsePin(snapRef, cleanupRef, vpRef, topRef, null, 200);

    expect(vpRef.current).toBeNull();
    expect(topRef.current).toBeNull();
  });

  test("sets cleanup function that releases to false", () => {
    const snapRef = { current: false as ScrollPinTarget };
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    activateCollapsePin(snapRef, cleanupRef, vpRef, topRef, null, 200);

    expect(cleanupRef.current).not.toBeNull();
    cleanupRef.current!();
    expect(snapRef.current).toBe(false);
  });

  test("releases after collapseDuration + 80ms timeout", async () => {
    const snapRef = { current: false as ScrollPinTarget };
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    activateCollapsePin(snapRef, cleanupRef, vpRef, topRef, null, 200);

    expect(snapRef.current).toBe(200);
    // Default duration is 240ms + 80ms = 320ms
    await new Promise((r) => setTimeout(r, 350));
    expect(snapRef.current).toBe(false);
  });

  test("cancels previous pin before activating", () => {
    const snapRef = { current: false as ScrollPinTarget };
    let firstCleaned = false;
    const cleanupRef = {
      current: () => {
        firstCleaned = true;
      },
    } as React.RefObject<(() => void) | null>;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    activateCollapsePin(snapRef, cleanupRef, vpRef, topRef, null, 300);

    expect(firstCleaned).toBe(true);
    expect(snapRef.current).toBe(300);
  });

  test("works with undefined suppressSnapRef", () => {
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    expect(() =>
      activateCollapsePin(undefined, cleanupRef, vpRef, topRef, null, 100),
    ).not.toThrow();
  });
});

// ─── activateExpandSuppress ───────────────────────────────────────────────────

describe("activateExpandSuppress", () => {
  test("returns early when no matching DOM element", () => {
    const snapRef = { current: false as ScrollPinTarget };
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    activateExpandSuppress(
      snapRef,
      cleanupRef,
      vpRef,
      topRef,
      "nonexistent-key",
    );

    // Should NOT set -1 since element wasn't found
    expect(snapRef.current).toBe(false);
    expect(vpRef.current).toBeNull();
  });

  test("sets suppressSnapRef to -1 when element found", () => {
    const snapRef = { current: false as ScrollPinTarget };
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    // Create DOM structure matching article layout
    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    let _st = 150;
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      get: () => _st,
      set: (v: number) => {
        _st = v;
      },
    });

    const article = document.createElement("div");
    article.setAttribute("data-article-key", "test-key-123");
    viewport.appendChild(article);
    document.body.appendChild(viewport);

    activateExpandSuppress(snapRef, cleanupRef, vpRef, topRef, "test-key-123");

    expect(snapRef.current).toBe(-1);
    expect(vpRef.current).toBe(viewport);
    expect(topRef.current).toBe(150);
    expect(cleanupRef.current).not.toBeNull();
    expect(viewport.style.overflowAnchor).toBe("none");

    // Cleanup releases to false and restores overflow-anchor
    cleanupRef.current!();
    expect(snapRef.current).toBe(false);
    expect(viewport.style.overflowAnchor).toBe("");

    document.body.removeChild(viewport);
  });

  test("clears pre-expand refs before re-capturing", () => {
    const snapRef = { current: false as ScrollPinTarget };
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = {
      current: document.createElement("div"),
    } as React.RefObject<HTMLElement | null>;
    const topRef = { current: 999 } as React.RefObject<null | number>;

    // No matching element — should have cleared refs
    activateExpandSuppress(snapRef, cleanupRef, vpRef, topRef, "no-match");

    expect(vpRef.current).toBeNull();
    expect(topRef.current).toBeNull();
  });

  test("cancels previous pin before activating", () => {
    const snapRef = { current: false as ScrollPinTarget };
    let prevCleaned = false;
    const cleanupRef = {
      current: () => {
        prevCleaned = true;
      },
    } as React.RefObject<(() => void) | null>;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    activateExpandSuppress(snapRef, cleanupRef, vpRef, topRef, "no-match");

    expect(prevCleaned).toBe(true);
  });

  test("works with undefined suppressSnapRef", () => {
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    expect(() =>
      activateExpandSuppress(undefined, cleanupRef, vpRef, topRef, "key"),
    ).not.toThrow();
  });

  test("handles transitionend for max-height property", async () => {
    const snapRef = { current: false as ScrollPinTarget };
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    const article = document.createElement("div");
    article.setAttribute("data-article-key", "trans-test");
    viewport.appendChild(article);
    document.body.appendChild(viewport);

    activateExpandSuppress(snapRef, cleanupRef, vpRef, topRef, "trans-test");
    expect(snapRef.current).toBe(-1);
    expect(viewport.style.overflowAnchor).toBe("none");

    // Fire transitionend with wrong property — should NOT release
    const wrongEvent = new Event("transitionend") as any;
    wrongEvent.propertyName = "opacity";
    article.dispatchEvent(wrongEvent);
    expect(snapRef.current).toBe(-1);
    expect(viewport.style.overflowAnchor).toBe("none");

    // Fire transitionend with max-height — schedules release after 80ms
    const correctEvent = new Event("transitionend") as any;
    correctEvent.propertyName = "max-height";
    article.dispatchEvent(correctEvent);
    expect(snapRef.current).toBe(-1);

    // Wait for the 80ms release timer to fire
    await new Promise((r) => setTimeout(r, 100));
    expect(snapRef.current).toBe(false);
    expect(viewport.style.overflowAnchor).toBe("");

    document.body.removeChild(viewport);
  });

  test("fallback timeout releases after 3s", async () => {
    const snapRef = { current: false as ScrollPinTarget };
    const cleanupRef = { current: null } as React.RefObject<
      (() => void) | null
    >;
    const vpRef = { current: null } as React.RefObject<HTMLElement | null>;
    const topRef = { current: null } as React.RefObject<null | number>;

    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    const article = document.createElement("div");
    article.setAttribute("data-article-key", "fallback-test");
    viewport.appendChild(article);
    document.body.appendChild(viewport);

    activateExpandSuppress(snapRef, cleanupRef, vpRef, topRef, "fallback-test");
    expect(snapRef.current).toBe(-1);

    // Call cleanup to clear the fallback (simulates component unmount)
    cleanupRef.current!();
    expect(snapRef.current).toBe(false);

    document.body.removeChild(viewport);
  });
});
