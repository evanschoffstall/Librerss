import { useScrollRestore } from "@/hooks/useScrollRestore";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type RefCallback } from "react";

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

      observe() {
        resizeCallbacks.push(this.callback);
      }

      disconnect() {}
    }

    global.ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
    delete globalAny.MutationObserver;

    let anchorBaseOffset = 400;

    function Harness() {
      const attachRef = useScrollRestore("librerss:test:scroll");

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
          top: 100,
          bottom: 600,
          left: 0,
          right: 400,
          width: 400,
          height: 500,
          x: 0,
          y: 100,
          toJSON: () => ({}),
        })) as typeof viewport.getBoundingClientRect;

        anchor.getBoundingClientRect = (() => ({
          top: 100 + anchorBaseOffset - internalScrollTop,
          bottom: 140 + anchorBaseOffset - internalScrollTop,
          left: 0,
          right: 400,
          width: 400,
          height: 40,
          x: 0,
          y: 100 + anchorBaseOffset - internalScrollTop,
          toJSON: () => ({}),
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
      JSON.stringify({ t: 300, ai: 1, ao: 10 }),
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
});
