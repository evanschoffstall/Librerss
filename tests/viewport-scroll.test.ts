import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  observeFeedViewportHeightOwners,
  readViewportMaxScrollTop,
  syncViewportToBottomIfNeeded,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state";

const originalResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  document.body.innerHTML = "";
  globalThis.ResizeObserver = originalResizeObserver;
});

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  readonly disconnect = mock(() => {});
  readonly observe = mock((_target: Element) => {});

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe("viewport scroll helpers", () => {
  test("read the viewport max scrollTop and sync to bottom only when needed", () => {
    const viewport = document.createElement("div");
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 120,
    });
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 40,
      writable: true,
    });

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

  test("observes virtualizer and skeleton height owners inside the feed viewport", () => {
    ResizeObserverMock.instances = [];
    globalThis.ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
    const onLayoutChange = mock(() => {});
    const viewport = document.createElement("div");
    const feedSurface = document.createElement("div");
    const virtualizer = document.createElement("div");
    const skeletons = document.createElement("div");

    feedSurface.dataset.feedSurfaceMode = "virtualized";
    virtualizer.dataset.feedVirtualizer = "true";
    skeletons.dataset.feedLoadMoreSkeletons = "true";
    viewport.append(feedSurface, virtualizer, skeletons);

    const disconnect = observeFeedViewportHeightOwners(
      viewport,
      onLayoutChange,
    );
    const resizeObserver = ResizeObserverMock.instances[0];

    expect(resizeObserver?.observe).toHaveBeenCalledTimes(4);
    expect(resizeObserver?.observe).toHaveBeenCalledWith(viewport);
    expect(resizeObserver?.observe).toHaveBeenCalledWith(feedSurface);
    expect(resizeObserver?.observe).toHaveBeenCalledWith(virtualizer);
    expect(resizeObserver?.observe).toHaveBeenCalledWith(skeletons);

    resizeObserver?.trigger();
    expect(onLayoutChange).toHaveBeenCalledTimes(1);

    disconnect();
    expect(resizeObserver?.disconnect).toHaveBeenCalledTimes(1);
  });
});
