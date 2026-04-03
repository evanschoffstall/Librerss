import { describe, expect, test } from "bun:test";

import {
  readViewportMaxScrollTop,
  syncViewportToBottomIfNeeded,
} from "@/app/dashboard/components/feed/feed-list-surface-state/viewport-scroll";

describe("viewport scroll helpers", () => {
  test("read the viewport max scrollTop and sync to bottom only when needed", () => {
    const viewport = document.createElement("div");
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 120 });
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 360 });
    Object.defineProperty(viewport, "scrollTop", { configurable: true, value: 40, writable: true });

    expect(readViewportMaxScrollTop(viewport)).toBe(240);
    expect(syncViewportToBottomIfNeeded(viewport)).toBe(true);
    expect(viewport.scrollTop).toBe(240);
    expect(syncViewportToBottomIfNeeded(viewport)).toBe(false);
  });

  test("returns zero when viewport measurements throw", () => {
    const viewport = document.createElement("div");
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      get() {
        throw new Error("broken measurement");
      },
    });

    expect(readViewportMaxScrollTop(viewport)).toBe(0);
  });
});