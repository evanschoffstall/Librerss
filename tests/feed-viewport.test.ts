import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  findDashboardFeedViewport,
  isDashboardFeedViewport,
  observeFeedViewportLayout,
  resolveFeedViewport,
} from "@/app/dashboard/services/feed-viewport";

class MutationObserverMock {
  static instances: MutationObserverMock[] = [];

  callback: MutationCallback;
  disconnect = mock(() => {});
  observe = mock((_target: Node, _options: MutationObserverInit) => {});

  constructor(callback: MutationCallback) {
    this.callback = callback;
    MutationObserverMock.instances.push(this);
  }
}

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  callback: ResizeObserverCallback;
  disconnect = mock(() => {});
  observe = mock((_target: Element) => {});

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }
}

const originalResizeObserver = globalThis.ResizeObserver;
const originalMutationObserver = globalThis.MutationObserver;

beforeEach(() => {
  ResizeObserverMock.instances = [];
  MutationObserverMock.instances = [];
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  globalThis.MutationObserver = MutationObserverMock as unknown as typeof MutationObserver;
});

afterEach(() => {
  document.body.innerHTML = "";
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.MutationObserver = originalMutationObserver;
  mock.restore();
});

describe("feed viewport helpers", () => {
  test("identify the active dashboard viewport and resolve candidates", () => {
    const otherViewport = document.createElement("div");
    otherViewport.dataset.radixScrollAreaViewport = "";
    const dashboardViewport = document.createElement("div");
    dashboardViewport.dataset.radixScrollAreaViewport = "";

    const restoreAnchor = document.createElement("div");
    restoreAnchor.dataset.scrollRestoreKey = "article-1";
    dashboardViewport.append(restoreAnchor);

    document.body.append(otherViewport, dashboardViewport);

    expect(isDashboardFeedViewport(otherViewport)).toBe(false);
    expect(isDashboardFeedViewport(dashboardViewport)).toBe(true);
    expect(findDashboardFeedViewport()).toBe(dashboardViewport);
    expect(
      resolveFeedViewport({
        candidateViewports: [null, dashboardViewport, otherViewport],
        fallbackViewport: otherViewport,
      }),
    ).toBe(dashboardViewport);

    const disconnectedFallback = document.createElement("div");
    expect(
      resolveFeedViewport({
        candidateViewports: [null, null],
        fallbackViewport: disconnectedFallback,
      }),
    ).toBeNull();
  });

  test("observe layout changes across viewport, child, and anchor nodes", () => {
    const viewport = document.createElement("div");
    const firstChild = document.createElement("div");
    const firstAnchor = document.createElement("div");
    const secondAnchor = document.createElement("div");
    let activeAnchor: Element | null = firstAnchor;
    const onLayoutChange = mock(() => {});

    viewport.append(firstChild, firstAnchor);

    const stopObserving = observeFeedViewportLayout({
      findAnchor: () => activeAnchor,
      onLayoutChange,
      viewport,
    });

    const resizeObserver = ResizeObserverMock.instances[0];
    const mutationObserver = MutationObserverMock.instances[0];

    expect(resizeObserver.observe).toHaveBeenCalledTimes(3);
    expect(resizeObserver.observe).toHaveBeenCalledWith(viewport);
    expect(resizeObserver.observe).toHaveBeenCalledWith(firstChild);
    expect(resizeObserver.observe).toHaveBeenCalledWith(firstAnchor);
    expect(mutationObserver.observe).toHaveBeenCalledWith(viewport, {
      childList: true,
      subtree: true,
    });

    resizeObserver.callback([], resizeObserver as unknown as ResizeObserver);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);

    activeAnchor = secondAnchor;
    mutationObserver.callback([], mutationObserver as unknown as MutationObserver);
    expect(resizeObserver.disconnect).toHaveBeenCalled();
    expect(resizeObserver.observe).toHaveBeenCalledWith(secondAnchor);
    expect(onLayoutChange).toHaveBeenCalledTimes(2);

    stopObserving();
    expect(resizeObserver.disconnect).toHaveBeenCalled();
    expect(mutationObserver.disconnect).toHaveBeenCalled();
  });
});