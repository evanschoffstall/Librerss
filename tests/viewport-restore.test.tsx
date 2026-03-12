import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { render } from "@testing-library/react";
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

    function Harness() {
      const restore = useViewportRestore("restore:persist", 110);
      capture = restore.capture;
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
    capture();
    expect(window.sessionStorage.getItem("restore:persist")).toBeTruthy();

    viewport!.dispatchEvent(new Event("wheel"));
    viewport!.scrollTop = 0;
    viewport!.dispatchEvent(new Event("scroll"));
    await waitForRaf();
    expect(window.sessionStorage.getItem("restore:persist")).toBeNull();
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
});
