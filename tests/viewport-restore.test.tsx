import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { act, render } from "@testing-library/react";
import { createElement, type RefCallback } from "react";

import { useViewportRestore } from "@/lib/hooks/useViewportRestore";

function createRect(top: number, height: number) {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 300,
    toJSON: () => ({}),
    top,
    width: 300,
    x: 0,
    y: top,
  };
}

const waitForRaf = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
};

function prepareAnchoredViewport(
  viewport: HTMLElement,
  items: readonly HTMLElement[],
) {
  let top = 180;
  Object.defineProperty(viewport, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  Object.defineProperty(viewport, "scrollHeight", {
    configurable: true,
    get: () => 1600,
  });
  Object.defineProperty(viewport, "clientHeight", {
    configurable: true,
    get: () => 500,
  });
  viewport.getBoundingClientRect = (() =>
    createRect(100, 500)) as typeof viewport.getBoundingClientRect;
  items[0].getBoundingClientRect = (() =>
    createRect(100, 20)) as typeof viewport.getBoundingClientRect;
  items[1].getBoundingClientRect = (() =>
    createRect(140, 30)) as typeof viewport.getBoundingClientRect;
}

function prepareBasicViewport(viewport: HTMLElement) {
  let top = 0;
  Object.defineProperty(viewport, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  Object.defineProperty(viewport, "scrollHeight", {
    configurable: true,
    get: () => 1500,
  });
  Object.defineProperty(viewport, "clientHeight", {
    configurable: true,
    get: () => 500,
  });
}

function RestoreAnchoredListHarness({
  onReady,
  sessionKey,
}: {
  onReady: (restore: ReturnType<typeof useViewportRestore>) => void;
  sessionKey: string;
}) {
  const restore = useViewportRestore(sessionKey, 110);
  onReady(restore);

  const rootRef: RefCallback<HTMLDivElement> = (root) => {
    restore.ref(root);
    const viewport = root?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    const items = Array.from(
      root?.querySelectorAll<HTMLElement>("[data-item]") ?? [],
    );
    if (!viewport || items.length < 2) return;
    prepareAnchoredViewport(viewport, items);
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

describe("useViewportRestore", () => {
  beforeEach(() => {
    mock.restore();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    mock.restore();
    window.sessionStorage.clear();
  });

  test("restores saved scroll on attach", async () => {
    function Harness() {
      const { ref } = useViewportRestore("restore:test");
      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        ref(root);
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        if (!viewport) return;
        prepareBasicViewport(viewport);
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement("div", { "data-radix-scroll-area-viewport": "" }),
      );
    }

    window.sessionStorage.setItem(
      "restore:test",
      JSON.stringify({ ai: -1, ao: 0, t: 240 }),
    );
    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    await waitForRaf();
    expect(viewport?.scrollTop).toBe(240);
  });

  test("captures and clears persisted scroll state", async () => {
    let capture = () => {};
    const { container } = render(
      createElement(RestoreAnchoredListHarness, {
        onReady: (restore) => {
          capture = restore.capture;
        },
        sessionKey: "restore:persist",
      }),
    );
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    capture();
    expect(window.sessionStorage.getItem("restore:persist")).toBeTruthy();

    viewport!.dispatchEvent(new Event("wheel"));
    viewport!.scrollTop = 0;
    viewport!.dispatchEvent(new Event("scroll"));
    await waitForRaf();
    expect(window.sessionStorage.getItem("restore:persist")).toBeNull();
  });

  test("flush reapplies the captured scroll position after the anchor shifts", async () => {
    let capture = () => {};
    let flush = () => {};
    const documentOffsets = [160, 220];

    function Harness() {
      const restore = useViewportRestore("restore:flush", 110);
      capture = restore.capture;
      flush = restore.flush;

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        restore.ref(root);
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        const items = root?.querySelectorAll<HTMLElement>("[data-item]") ?? [];
        if (!viewport || items.length < 2) return;

        let top = 180;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value;
          },
        });
        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get: () => 2000,
        });
        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get: () => 500,
        });
        viewport.getBoundingClientRect = (() =>
          createRect(100, 500)) as typeof viewport.getBoundingClientRect;

        items.forEach((item, index) => {
          item.getBoundingClientRect = (() =>
            createRect(
              100 + documentOffsets[index] - top,
              40,
            )) as typeof item.getBoundingClientRect;
        });
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

    if (!viewport) {
      throw new Error("missing viewport");
    }

    act(() => {
      capture();
      documentOffsets[1] = 320;
      viewport.scrollTop = 110;
      flush();
    });

    await waitForRaf();
    expect(viewport.scrollTop).toBe(280);
  });

  test("restores against a stable article key when the feed order changes", async () => {
    let capture = () => {};

    function Harness({ order }: { order: string[] }) {
      const restore = useViewportRestore("restore:keyed", 110);
      capture = restore.capture;

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        restore.ref(root);
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        const wrappers =
          root?.querySelectorAll<HTMLElement>("[data-item]") ?? [];
        if (!viewport || wrappers.length < 2) return;

        let top = 180;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value;
          },
        });
        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get: () => 2000,
        });
        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get: () => 500,
        });
        viewport.getBoundingClientRect = (() =>
          createRect(100, 500)) as typeof viewport.getBoundingClientRect;

        const documentOffsets = order[0] === "b" ? [440, 160] : [160, 220];

        wrappers.forEach((wrapper, index) => {
          wrapper.getBoundingClientRect = (() =>
            createRect(
              100 + documentOffsets[index] - top,
              40,
            )) as typeof wrapper.getBoundingClientRect;
        });
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
            ...order.map((key) =>
              createElement(
                "div",
                { "data-item": key, key },
                createElement("article", { "data-article-key": key }),
              ),
            ),
          ),
        ),
      );
    }

    const initial = render(createElement(Harness, { order: ["a", "b"] }));
    capture();
    const saved = window.sessionStorage.getItem("restore:keyed");
    expect(saved).toContain('"k":"b"');
    initial.unmount();

    const { container } = render(createElement(Harness, { order: ["b", "a"] }));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    await waitForRaf();
    expect(viewport?.scrollTop).toBe(400);
  });

  test("invalidate clears saved scroll and resets the viewport to the hidden offset", () => {
    let invalidate = () => {};

    function Harness() {
      const restore = useViewportRestore("restore:invalidate", 110);
      invalidate = restore.invalidate;

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        restore.ref(root);
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        if (!viewport) return;
        let top = 250;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value;
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
      "restore:invalidate",
      JSON.stringify({ ai: -1, ao: 0, t: 250 }),
    );
    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    act(() => {
      invalidate();
    });

    expect(window.sessionStorage.getItem("restore:invalidate")).toBeNull();
    expect(viewport?.scrollTop).toBe(110);
  });

  test("capture drops persisted state when the viewport is above the scroll offset", async () => {
    let capture = () => {};

    function Harness() {
      const restore = useViewportRestore("restore:too-shallow", 110);
      capture = restore.capture;

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        if (!viewport) return;
        let top = 90;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value;
          },
        });
        restore.ref(root);
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement("div", { "data-radix-scroll-area-viewport": "" }),
      );
    }

    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    window.sessionStorage.setItem(
      "restore:too-shallow",
      JSON.stringify({ ai: -1, ao: 0, t: 240 }),
    );
    if (!viewport) {
      throw new Error("missing viewport");
    }

    act(() => {
      viewport.scrollTop = 90;
      capture();
    });

    await waitForRaf();
    expect(window.sessionStorage.getItem("restore:too-shallow")).toBeNull();
  });

  test("captures the last child when every item is already above the viewport edge", async () => {
    let capture = () => {};

    function Harness() {
      const restore = useViewportRestore("restore:last-child");
      capture = restore.capture;

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        restore.ref(root);
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        const items = Array.from(
          root?.querySelectorAll<HTMLElement>("[data-item]") ?? [],
        );
        if (!viewport || items.length < 2) return;

        let top = 180;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value;
          },
        });
        viewport.getBoundingClientRect = (() =>
          createRect(100, 500)) as typeof viewport.getBoundingClientRect;
        items[0].getBoundingClientRect = (() =>
          createRect(60, 20)) as typeof viewport.getBoundingClientRect;
        items[1].getBoundingClientRect = (() =>
          createRect(90, 30)) as typeof viewport.getBoundingClientRect;
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

    render(createElement(Harness));

    act(() => {
      capture();
    });

    await waitForRaf();
    expect(window.sessionStorage.getItem("restore:last-child")).toBe(
      JSON.stringify({ ai: 1, ao: -10, t: 180 }),
    );
  });

  test("observer-driven restore repositions the saved anchor and settle stops later reapplication", async () => {
    const originalResizeObserver = global.ResizeObserver;
    const originalMutationObserver = global.MutationObserver;
    let resizeCallback: (() => void) | undefined;
    let mutationCallback: (() => void) | undefined;

    class ResizeObserverMock {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }

      disconnect() {}

      observe() {}
    }

    class MutationObserverMock {
      constructor(callback: () => void) {
        mutationCallback = callback;
      }

      disconnect() {}

      observe() {}
    }

    global.ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
    global.MutationObserver =
      MutationObserverMock as unknown as typeof MutationObserver;

    let settle = () => {};
    let anchorDocumentOffset = 280;

    function Harness() {
      const restore = useViewportRestore("restore:observer");
      settle = restore.settle;

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        restore.ref(root);
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        const item = root?.querySelector<HTMLElement>("[data-item]");
        if (!viewport || !item) return;

        let top = 0;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value;
          },
        });
        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get: () => 1800,
        });
        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get: () => 500,
        });
        viewport.getBoundingClientRect = (() =>
          createRect(100, 500)) as typeof viewport.getBoundingClientRect;
        item.getBoundingClientRect = (() =>
          createRect(
            100 + anchorDocumentOffset - top,
            40,
          )) as typeof item.getBoundingClientRect;
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
            createElement("div", {
              "data-item": "a",
              "data-scroll-restore-key": "anchor-a",
            }),
          ),
        ),
      );
    }

    try {
      window.sessionStorage.setItem(
        "restore:observer",
        JSON.stringify({ ai: 0, ao: 0, k: "anchor-a", t: 280 }),
      );
      const { container } = render(createElement(Harness));
      const viewport = container.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      );

      await waitForRaf();
      expect(viewport?.scrollTop).toBe(280);

      anchorDocumentOffset = 360;
      act(() => {
        resizeCallback?.();
      });
      expect(viewport?.scrollTop).toBe(360);

      act(() => {
        settle();
        if (viewport) viewport.scrollTop = 300;
      });

      anchorDocumentOffset = 440;
      act(() => {
        mutationCallback?.();
      });
      expect(viewport?.scrollTop).toBe(300);
    } finally {
      global.ResizeObserver = originalResizeObserver;
      global.MutationObserver = originalMutationObserver;
    }
  });

  test("touch interaction replaces saved restore state with the user's new scroll position", async () => {
    function Harness() {
      const restore = useViewportRestore("restore:touch", 110);

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        restore.ref(root);
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        if (!viewport) return;
        let top = 0;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value;
          },
        });
        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get: () => 1500,
        });
        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get: () => 500,
        });
        viewport.getBoundingClientRect = (() =>
          createRect(100, 500)) as typeof viewport.getBoundingClientRect;
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement("div", { "data-radix-scroll-area-viewport": "" }),
      );
    }

    window.sessionStorage.setItem(
      "restore:touch",
      JSON.stringify({ ai: -1, ao: 0, t: 260 }),
    );
    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    await waitForRaf();
    expect(viewport?.scrollTop).toBe(260);

    act(() => {
      viewport?.dispatchEvent(new Event("touchstart"));
      if (viewport) viewport.scrollTop = 190;
      viewport?.dispatchEvent(new Event("touchend"));
      viewport?.dispatchEvent(new Event("scroll"));
      viewport?.dispatchEvent(new Event("touchcancel"));
    });

    await waitForRaf();
    expect(window.sessionStorage.getItem("restore:touch")).toBe(
      JSON.stringify({ ai: -1, ao: 0, t: 190 }),
    );
  });

  test("scrolling without a preceding input event still cancels restore and saves the new position", async () => {
    function Harness() {
      const restore = useViewportRestore("restore:scroll-only", 110);

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        restore.ref(root);
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        if (!viewport) return;
        let top = 0;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value;
          },
        });
        Object.defineProperty(viewport, "scrollHeight", {
          configurable: true,
          get: () => 1500,
        });
        Object.defineProperty(viewport, "clientHeight", {
          configurable: true,
          get: () => 500,
        });
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement("div", { "data-radix-scroll-area-viewport": "" }),
      );
    }

    window.sessionStorage.setItem(
      "restore:scroll-only",
      JSON.stringify({ ai: -1, ao: 0, t: 260 }),
    );
    const { container } = render(createElement(Harness));
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );

    await waitForRaf();
    expect(viewport?.scrollTop).toBe(260);

    act(() => {
      if (viewport) viewport.scrollTop = 190;
      viewport?.dispatchEvent(new Event("scroll"));
    });

    await waitForRaf();
    expect(window.sessionStorage.getItem("restore:scroll-only")).toBe(
      JSON.stringify({ ai: -1, ao: 0, t: 190 }),
    );
  });

  test("invalidate prevents a queued scroll save from rewriting cleared state", async () => {
    let invalidate = () => {};
    const { container } = render(
      createElement(RestoreAnchoredListHarness, {
        onReady: (restore) => {
          invalidate = restore.invalidate;
        },
        sessionKey: "restore:invalidate-race",
      }),
    );
    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) throw new Error("missing viewport");

    act(() => {
      viewport.dispatchEvent(new Event("wheel"));
      viewport.dispatchEvent(new Event("scroll"));
      invalidate();
    });

    await waitForRaf();
    expect(window.sessionStorage.getItem("restore:invalidate-race")).toBeNull();
    expect(viewport.scrollTop).toBe(110);
  });

  test("tolerates inaccessible session storage", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "sessionStorage",
    );
    let capture = () => {};
    let invalidate = () => {};

    function Harness() {
      const restore = useViewportRestore("restore:no-storage");
      capture = restore.capture;
      invalidate = restore.invalidate;

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        if (!viewport) return;
        let top = 160;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value;
          },
        });
        restore.ref(root);
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement("div", { "data-radix-scroll-area-viewport": "" }),
      );
    }

    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });

    try {
      expect(() => render(createElement(Harness))).not.toThrow();
      expect(() => capture()).not.toThrow();
      expect(() => invalidate()).not.toThrow();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, "sessionStorage", originalDescriptor);
      }
    }
  });

  test("swallows storage removal failures when invalidating saved scroll", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "sessionStorage",
    );
    let invalidate = () => {};

    function Harness() {
      const restore = useViewportRestore("restore:remove-throws", 110);
      invalidate = restore.invalidate;

      const rootRef: RefCallback<HTMLDivElement> = (root) => {
        const viewport = root?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        );
        if (!viewport) return;
        let top = 180;
        Object.defineProperty(viewport, "scrollTop", {
          configurable: true,
          get: () => top,
          set: (value: number) => {
            top = value;
          },
        });
        restore.ref(root);
      };

      return createElement(
        "div",
        { ref: rootRef },
        createElement("div", { "data-radix-scroll-area-viewport": "" }),
      );
    }

    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get: () =>
        ({
          clear: () => undefined,
          getItem: () => null,
          key: () => null,
          length: 0,
          removeItem: () => {
            throw new Error("quota blocked");
          },
          setItem: () => undefined,
        }) as unknown as Storage,
    });

    try {
      render(createElement(Harness));
      expect(() => invalidate()).not.toThrow();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, "sessionStorage", originalDescriptor);
      }
    }
  });
});
