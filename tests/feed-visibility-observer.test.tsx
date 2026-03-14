import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { act, render, waitFor } from "@testing-library/react";
import { createElement, useRef, useState } from "react";

import { useFeedVisibilityObserver } from "@/app/dashboard/hooks/useFeedVisibilityObserver";

beforeEach(() => {
  mock.restore();
});

afterEach(() => {
  mock.restore();
});

function prepareVisibilityViewport(node: HTMLDivElement | null) {
  if (!node) return;
  Object.defineProperty(node, "clientHeight", {
    configurable: true,
    get: () => 600,
  });
  node.setAttribute("data-radix-scroll-area-viewport", "");
}

function VisibleCountHarness() {
  const [visibleCount, setVisibleCount] = useState(25);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useFeedVisibilityObserver({
    pageSize: 25,
    scrollRootRef,
    sentinelRef,
    setVisibleCount,
    totalFeedItems: 80,
  });

  return createElement(
    "div",
    { ref: scrollRootRef },
    createElement(
      "div",
      { ref: prepareVisibilityViewport },
      createElement("div", {
        "data-visible-count": visibleCount,
        ref: sentinelRef,
      }),
    ),
  );
}

describe("useFeedVisibilityObserver", () => {
  test("limits mutation observation to direct list-structure changes", () => {
    const originalIntersectionObserver = global.IntersectionObserver;
    const originalMutationObserver = global.MutationObserver;
    const observedTargets: Element[] = [];
    const observedOptions: MutationObserverInit[] = [];

    class IntersectionObserverMock {
      disconnect() {}

      observe() {}

      takeRecords() {
        return [];
      }

      unobserve() {}
    }

    class MutationObserverMock {
      disconnect() {}

      observe(target: Node, options?: MutationObserverInit) {
        if (target instanceof Element) {
          observedTargets.push(target);
        }
        observedOptions.push(options ?? {});
      }

      takeRecords() {
        return [];
      }
    }

    global.IntersectionObserver =
      IntersectionObserverMock as unknown as typeof IntersectionObserver;
    global.MutationObserver =
      MutationObserverMock as unknown as typeof MutationObserver;

    try {
      const { container } = render(createElement(VisibleCountHarness));
      const viewport = container.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      );

      expect(viewport).not.toBeNull();
      if (!viewport) throw new Error("Expected feed viewport to exist");

      expect(observedTargets[0]).toBe(viewport);
      expect(observedOptions[0]).toEqual({ childList: true });
    } finally {
      global.IntersectionObserver = originalIntersectionObserver;
      global.MutationObserver = originalMutationObserver;
    }
  });

  test("observes the load sentinel against the feed viewport root", () => {
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    const originalIntersectionObserver = global.IntersectionObserver;
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    let observedRoot: Document | Element | null | undefined;
    let observedRootMargin: string | undefined;
    let observedSentinel: Element | undefined;
    let queuedFrame: FrameRequestCallback | undefined;
    let triggerIntersect: ((isIntersecting: boolean) => void) | undefined;

    class IntersectionObserverMock {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        observedRoot = options?.root;
        observedRootMargin = options?.rootMargin;
        triggerIntersect = (isIntersecting) => {
          callback(
            [
              {
                boundingClientRect: {} as DOMRectReadOnly,
                intersectionRatio: isIntersecting ? 1 : 0,
                intersectionRect: {} as DOMRectReadOnly,
                isIntersecting,
                rootBounds: null,
                target: observedSentinel ?? document.createElement("div"),
                time: 0,
              },
            ] as IntersectionObserverEntry[],
            {} as IntersectionObserver,
          );
        };
      }

      disconnect() {}

      observe(target: Element) {
        observedSentinel = target;
      }

      takeRecords() {
        return [];
      }

      unobserve() {}
    }

    global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      queuedFrame = callback;
      return 1;
    }) as typeof requestAnimationFrame;
    global.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
    global.IntersectionObserver =
      IntersectionObserverMock as unknown as typeof IntersectionObserver;

    try {
      const { container } = render(createElement(VisibleCountHarness));
      const viewport = container.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      );
      const sentinel = container.querySelector<HTMLElement>(
        "[data-visible-count]",
      );

      expect(observedRoot).toBe(viewport);
      expect(observedRootMargin).toBe("0px 0px 1050px 0px");
      expect(observedSentinel).toBe(sentinel ?? undefined);

      act(() => {
        triggerIntersect?.(true);
      });

      act(() => {
        queuedFrame?.(0);
      });

      expect(sentinel?.dataset.visibleCount).toBe("50");
    } finally {
      global.cancelAnimationFrame = originalCancelAnimationFrame;
      global.IntersectionObserver = originalIntersectionObserver;
      global.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  test("batches repeated intersections until the next animation frame", () => {
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    const originalIntersectionObserver = global.IntersectionObserver;
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    let observedSentinel: Element | undefined;
    let queuedFrame: FrameRequestCallback | undefined;
    let triggerIntersect: ((isIntersecting: boolean) => void) | undefined;

    class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) {
        triggerIntersect = (isIntersecting) => {
          callback(
            [
              {
                boundingClientRect: {} as DOMRectReadOnly,
                intersectionRatio: isIntersecting ? 1 : 0,
                intersectionRect: {} as DOMRectReadOnly,
                isIntersecting,
                rootBounds: null,
                target: observedSentinel ?? document.createElement("div"),
                time: 0,
              },
            ] as IntersectionObserverEntry[],
            {} as IntersectionObserver,
          );
        };
      }

      disconnect() {}

      observe(target: Element) {
        observedSentinel = target;
      }

      takeRecords() {
        return [];
      }

      unobserve() {}
    }

    global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      queuedFrame = callback;
      return 1;
    }) as typeof requestAnimationFrame;
    global.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
    global.IntersectionObserver =
      IntersectionObserverMock as unknown as typeof IntersectionObserver;

    try {
      const { container } = render(createElement(VisibleCountHarness));
      const sentinel = container.querySelector<HTMLElement>(
        "[data-visible-count]",
      );

      act(() => {
        triggerIntersect?.(true);
        triggerIntersect?.(true);
      });

      expect(sentinel?.dataset.visibleCount).toBe("25");

      act(() => {
        queuedFrame?.(0);
      });

      expect(sentinel?.dataset.visibleCount).toBe("50");
    } finally {
      global.cancelAnimationFrame = originalCancelAnimationFrame;
      global.IntersectionObserver = originalIntersectionObserver;
      global.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  test("connects when the sentinel mounts after the initial render", async () => {
    const originalIntersectionObserver = global.IntersectionObserver;
    let observedSentinel: Element | undefined;

    class IntersectionObserverMock {
      disconnect() {}

      observe(target: Element) {
        observedSentinel = target;
      }

      takeRecords() {
        return [];
      }

      unobserve() {}
    }

    global.IntersectionObserver =
      IntersectionObserverMock as unknown as typeof IntersectionObserver;

    function Harness() {
      const [showSentinel, setShowSentinel] = useState(false);
      const scrollRootRef = useRef<HTMLDivElement | null>(null);
      const sentinelRef = useRef<HTMLDivElement | null>(null);

      useFeedVisibilityObserver({
        pageSize: 25,
        scrollRootRef,
        sentinelRef,
        setVisibleCount: () => 25,
        totalFeedItems: 80,
      });

      return createElement(
        "div",
        { ref: scrollRootRef },
        createElement(
          "div",
          { ref: prepareVisibilityViewport },
          showSentinel
            ? createElement("div", { "data-sentinel": "", ref: sentinelRef })
            : null,
          createElement(
            "button",
            {
              onClick: () => {
                setShowSentinel(true);
              },
              type: "button",
            },
            "show",
          ),
        ),
      );
    }

    try {
      const { getByText } = render(createElement(Harness));
      expect(observedSentinel).toBeUndefined();

      act(() => {
        getByText("show").click();
      });

      await waitFor(() => {
        expect(observedSentinel).toBeTruthy();
      });
    } finally {
      global.IntersectionObserver = originalIntersectionObserver;
    }
  });
});
