import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { render } from "@testing-library/react";
import { createElement, type RefCallback } from "react";

import { useScrollRestore } from "@/lib/hooks/useScrollRestore";

type ResizeCallback = () => void;

const waitForRaf = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
};

describe("useScrollRestore", () => {
  const globalAny = global as any;
  const originalResizeObserver = global.ResizeObserver;
  const originalMutationObserver = global.MutationObserver;
  const originalSessionStorage = (
    global as typeof global & { sessionStorage?: Storage }
  ).sessionStorage;

  beforeEach(() => {
    mock.restore();
    (global as typeof global & { sessionStorage?: Storage }).sessionStorage =
      window.sessionStorage;
    window.sessionStorage.clear();
  });

  afterEach(() => {
    mock.restore();
    window.sessionStorage.clear();
    if (originalResizeObserver) {
      global.ResizeObserver = originalResizeObserver;
    } else {
      delete globalAny.ResizeObserver;
    }

    if (originalMutationObserver) {
      global.MutationObserver = originalMutationObserver;
    } else {
      delete globalAny.MutationObserver;
    }

    if (originalSessionStorage) {
      (global as typeof global & { sessionStorage?: Storage }).sessionStorage =
        originalSessionStorage;
    } else {
      delete globalAny.sessionStorage;
    }
  });

  test("keeps restore active after programmatic restore scroll events", async () => {
    const resizeCallbacks: ResizeCallback[] = [];

    class ResizeObserverMock {
      private callback: ResizeCallback;

      constructor(callback: ResizeCallback) {
        this.callback = callback;
      }

      disconnect() {}

      observe() {
        resizeCallbacks.push(this.callback);
      }
    }

    global.ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
    delete globalAny.MutationObserver;

    let anchorBaseOffset = 400;

    function Harness() {
      const { ref: attachRef } = useScrollRestore("librerss:test:scroll");

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        attachRef(root);

        if (!root) return;

        const viewport = root.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        const children = root.querySelectorAll<HTMLElement>("[data-item]");
        const anchor = children[1];

        if (!viewport || !anchor) return;

        let internalScrollTop = 0;

        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get() {
            return internalScrollTop;
          },
          set(value: number) {
            internalScrollTop = value;
            viewport.dispatchEvent(new Event("scroll"));
          },
        });

        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get() {
            return 2000;
          },
        });

        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get() {
            return 500;
          },
        });

        viewport.getBoundingClientRect = (() => ({
          bottom: 600,
          height: 500,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 100,
          width: 400,
          x: 0,
          y: 100,
        })) as typeof viewport.getBoundingClientRect;

        anchor.getBoundingClientRect = (() => ({
          bottom: 140 + anchorBaseOffset - internalScrollTop,
          height: 40,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 100 + anchorBaseOffset - internalScrollTop,
          width: 400,
          x: 0,
          y: 100 + anchorBaseOffset - internalScrollTop,
        })) as typeof anchor.getBoundingClientRect;
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement(
          "div",
          { "data-radix-scroll-area-viewport": "" },
          createElement(
            "div",
            null,
            createElement("div", { "data-item": "0" }),
            createElement("div", { "data-item": "1" }),
          ),
        ),
      );
    }

    window.sessionStorage.setItem(
      "librerss:test:scroll",
      JSON.stringify({ ai: 1, ao: 10, t: 300 }),
    );

    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    expect(viewport).toBeDefined();

    await waitForRaf();

    expect(viewport!.scrollTop).toBe(390);

    anchorBaseOffset = 520;
    resizeCallbacks.forEach((callback) => callback());

    await waitForRaf();

    expect(viewport!.scrollTop).toBe(510);
  });

  test("restores legacy numeric saved scroll state", async () => {
    delete globalAny.ResizeObserver;
    delete globalAny.MutationObserver;

    function Harness() {
      const { ref: attachRef } = useScrollRestore("librerss:test:legacy");

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        attachRef(root);
        if (!root) return;

        const viewport = root.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        if (!viewport) return;

        let internalScrollTop = 0;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get() {
            return internalScrollTop;
          },
          set(value: number) {
            internalScrollTop = value;
            viewport.dispatchEvent(new Event("scroll"));
          },
        });

        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get() {
            return 1500;
          },
        });

        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get() {
            return 500;
          },
        });

        viewport.getBoundingClientRect = (() => ({
          bottom: 500,
          height: 500,
          left: 0,
          right: 300,
          toJSON: () => ({}),
          top: 0,
          width: 300,
          x: 0,
          y: 0,
        })) as typeof viewport.getBoundingClientRect;
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement("div", { "data-radix-scroll-area-viewport": "" }),
      );
    }

    window.sessionStorage.setItem("librerss:test:legacy", "000250");

    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    await waitForRaf();
    expect(viewport?.scrollTop).toBe(250);
  });

  test("clamps restored fallback scroll to max scrollTop", async () => {
    delete globalAny.ResizeObserver;
    delete globalAny.MutationObserver;

    function Harness() {
      const { ref: attachRef } = useScrollRestore("librerss:test:clamp");

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        attachRef(root);
        if (!root) return;

        const viewport = root.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        if (!viewport) return;

        let internalScrollTop = 0;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get() {
            return internalScrollTop;
          },
          set(value: number) {
            internalScrollTop = value;
            viewport.dispatchEvent(new Event("scroll"));
          },
        });

        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get() {
            return 600;
          },
        });

        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get() {
            return 500;
          },
        });
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement("div", { "data-radix-scroll-area-viewport": "" }),
      );
    }

    window.sessionStorage.setItem(
      "librerss:test:clamp",
      JSON.stringify({ ai: -1, ao: 0, t: 5000 }),
    );

    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    await waitForRaf();
    expect(viewport?.scrollTop).toBe(100);
  });

  test("ignores malformed saved state without throwing", async () => {
    delete globalAny.ResizeObserver;
    delete globalAny.MutationObserver;

    function Harness() {
      const { ref: attachRef } = useScrollRestore("librerss:test:malformed");
      return createElement(
        "div",
        { ref: attachRef as RefCallback<HTMLDivElement> },
        createElement("div", { "data-radix-scroll-area-viewport": "" }),
      );
    }

    window.sessionStorage.setItem("librerss:test:malformed", "{bad json");
    expect(() => render(createElement(Harness))).not.toThrow();
  });

  test("persists state on scroll and removes when scrolled back to top", async () => {
    delete globalAny.ResizeObserver;
    delete globalAny.MutationObserver;

    function Harness() {
      const { ref: attachRef } = useScrollRestore("librerss:test:persist");

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        attachRef(root);
        if (!root) return;

        const viewport = root.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        const children = root.querySelectorAll<HTMLElement>("[data-item]");
        if (!viewport || children.length < 2) return;

        let internalScrollTop = 0;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get() {
            return internalScrollTop;
          },
          set(value: number) {
            internalScrollTop = value;
          },
        });

        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get() {
            return 1200;
          },
        });

        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get() {
            return 500;
          },
        });

        viewport.getBoundingClientRect = (() => ({
          bottom: 600,
          height: 500,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 100,
          width: 400,
          x: 0,
          y: 100,
        })) as typeof viewport.getBoundingClientRect;

        (children[0] as any).getBoundingClientRect = (() => ({
          bottom: 90,
          height: 30,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 60,
          width: 400,
          x: 0,
          y: 60,
        })) as typeof viewport.getBoundingClientRect;

        (children[1] as any).getBoundingClientRect = (() => ({
          bottom: 150,
          height: 30,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 120,
          width: 400,
          x: 0,
          y: 120,
        })) as typeof viewport.getBoundingClientRect;
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement(
          "div",
          { "data-radix-scroll-area-viewport": "" },
          createElement(
            "div",
            null,
            createElement("div", { "data-item": "0" }),
            createElement("div", { "data-item": "1" }),
          ),
        ),
      );
    }

    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    expect(viewport).toBeDefined();

    viewport!.scrollTop = 180;
    viewport!.dispatchEvent(new Event("scroll"));
    await waitForRaf();

    const saved = window.sessionStorage.getItem("librerss:test:persist");
    expect(saved).toBeTruthy();

    viewport!.scrollTop = 0;
    viewport!.dispatchEvent(new Event("scroll"));
    await waitForRaf();

    expect(window.sessionStorage.getItem("librerss:test:persist")).toBeNull();
  });

  test("anchors to the item already at the viewport edge instead of the next item below", async () => {
    delete globalAny.ResizeObserver;
    delete globalAny.MutationObserver;

    function Harness() {
      const { ref: attachRef } = useScrollRestore("librerss:test:edge-anchor");

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        attachRef(root);
        if (!root) return;

        const viewport = root.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        const children = root.querySelectorAll<HTMLElement>("[data-item]");
        if (!viewport || children.length < 2) return;

        let internalScrollTop = 180;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get() {
            return internalScrollTop;
          },
          set(value: number) {
            internalScrollTop = value;
          },
        });

        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get() {
            return 1200;
          },
        });

        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get() {
            return 500;
          },
        });

        viewport.getBoundingClientRect = (() => ({
          bottom: 600,
          height: 500,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 100,
          width: 400,
          x: 0,
          y: 100,
        })) as typeof viewport.getBoundingClientRect;

        (children[0] as HTMLElement).getBoundingClientRect = (() => ({
          bottom: 125,
          height: 30,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 95,
          width: 400,
          x: 0,
          y: 95,
        })) as typeof viewport.getBoundingClientRect;

        (children[1] as HTMLElement).getBoundingClientRect = (() => ({
          bottom: 165,
          height: 30,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 135,
          width: 400,
          x: 0,
          y: 135,
        })) as typeof viewport.getBoundingClientRect;
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement(
          "div",
          { "data-radix-scroll-area-viewport": "" },
          createElement(
            "div",
            null,
            createElement("div", { "data-item": "0" }),
            createElement("div", { "data-item": "1" }),
          ),
        ),
      );
    }

    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    expect(viewport).toBeDefined();

    viewport!.dispatchEvent(new Event("scroll"));
    await waitForRaf();

    expect(window.sessionStorage.getItem("librerss:test:edge-anchor")).toBe(
      JSON.stringify({ ai: 0, ao: -5, t: 180 }),
    );
  });

  test("preserves restore state through refresh-time layout clamp scrolls", async () => {
    const resizeCallbacks: ResizeCallback[] = [];

    class ResizeObserverMock {
      private callback: ResizeCallback;

      constructor(callback: ResizeCallback) {
        this.callback = callback;
      }

      disconnect() {}

      observe() {
        resizeCallbacks.push(this.callback);
      }
    }

    global.ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
    delete globalAny.MutationObserver;

    function Harness(props: { onReady: (capture: () => void) => void }) {
      const { capture, ref: attachRef } = useScrollRestore(
        "librerss:test:refresh-clamp",
        110,
      );

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        attachRef(root);
        if (!root) return;

        const viewport = root.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        const children = root.querySelectorAll<HTMLElement>("[data-item]");
        if (!viewport || children.length < 2) return;

        props.onReady(capture);

        let internalScrollTop = 250;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get() {
            return internalScrollTop;
          },
          set(value: number) {
            internalScrollTop = value;
            viewport.dispatchEvent(new Event("scroll"));
          },
        });

        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get() {
            return 1400;
          },
        });

        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get() {
            return 500;
          },
        });

        viewport.getBoundingClientRect = (() => ({
          bottom: 600,
          height: 500,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 100,
          width: 400,
          x: 0,
          y: 100,
        })) as typeof viewport.getBoundingClientRect;

        (children[0] as HTMLElement).getBoundingClientRect = (() => ({
          bottom: 120 + (220 - internalScrollTop),
          height: 20,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 100 + (220 - internalScrollTop),
          width: 400,
          x: 0,
          y: 100 + (220 - internalScrollTop),
        })) as typeof viewport.getBoundingClientRect;

        (children[1] as HTMLElement).getBoundingClientRect = (() => ({
          bottom: 170 + (300 - internalScrollTop),
          height: 40,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 130 + (300 - internalScrollTop),
          width: 400,
          x: 0,
          y: 130 + (300 - internalScrollTop),
        })) as typeof viewport.getBoundingClientRect;
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement(
          "div",
          { "data-radix-scroll-area-viewport": "" },
          createElement(
            "div",
            null,
            createElement("div", { "data-item": "0" }),
            createElement("div", { "data-item": "1" }),
          ),
        ),
      );
    }

    let captureScroll = () => {};
    const { container } = render(
      createElement(Harness, {
        onReady: (capture) => {
          captureScroll = capture;
        },
      }),
    );
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    expect(viewport).toBeDefined();

    captureScroll();
    viewport!.scrollTop = 110;
    viewport!.dispatchEvent(new Event("scroll"));
    resizeCallbacks.forEach((callback) => callback());

    await waitForRaf();

    expect(viewport!.scrollTop).toBe(250);
    expect(window.sessionStorage.getItem("librerss:test:refresh-clamp")).toBe(
      JSON.stringify({ ai: 0, ao: -30, t: 250 }),
    );
  });

  test("preserves the hidden sentinel offset as a valid restore position", async () => {
    delete globalAny.ResizeObserver;
    delete globalAny.MutationObserver;

    function Harness() {
      const { ref: attachRef } = useScrollRestore("librerss:test:offset", 110);

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        attachRef(root);
        if (!root) return;

        const viewport = root.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        const children = root.querySelectorAll<HTMLElement>("[data-item]");
        if (!viewport || children.length < 2) return;

        let internalScrollTop = 110;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get() {
            return internalScrollTop;
          },
          set(value: number) {
            internalScrollTop = value;
          },
        });

        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get() {
            return 1200;
          },
        });

        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get() {
            return 500;
          },
        });

        viewport.getBoundingClientRect = (() => ({
          bottom: 600,
          height: 500,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 100,
          width: 400,
          x: 0,
          y: 100,
        })) as typeof viewport.getBoundingClientRect;

        (children[0] as HTMLElement).getBoundingClientRect = (() => ({
          bottom: 120,
          height: 20,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 100,
          width: 400,
          x: 0,
          y: 100,
        })) as typeof viewport.getBoundingClientRect;

        (children[1] as HTMLElement).getBoundingClientRect = (() => ({
          bottom: 160,
          height: 40,
          left: 0,
          right: 400,
          toJSON: () => ({}),
          top: 120,
          width: 400,
          x: 0,
          y: 120,
        })) as typeof viewport.getBoundingClientRect;
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement(
          "div",
          { "data-radix-scroll-area-viewport": "" },
          createElement(
            "div",
            null,
            createElement("div", { "data-item": "0" }),
            createElement("div", { "data-item": "1" }),
          ),
        ),
      );
    }

    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    expect(viewport).toBeDefined();

    viewport!.dispatchEvent(new Event("scroll"));
    await waitForRaf();

    expect(window.sessionStorage.getItem("librerss:test:offset")).toBe(
      JSON.stringify({ ai: 0, ao: 0, t: 110 }),
    );
  });
});
