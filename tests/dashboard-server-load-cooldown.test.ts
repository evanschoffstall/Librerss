import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { completeFeedServerLoadCooldown } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationServerLoad";

const originalRequestAnimationFrame = global.requestAnimationFrame;
const originalCancelAnimationFrame = global.cancelAnimationFrame;

interface MockRAFQueue {
  callbacks: Map<number, FrameRequestCallback>;
  cancel: (id: number) => void;
  flush: () => void;
  request: (cb: FrameRequestCallback) => number;
}

function buildCooldownOptions(
  overrides?: Partial<Parameters<typeof completeFeedServerLoadCooldown>[0]>,
) {
  return {
    hasPendingBoundaryRearmAfterCooldownRef: { current: false },
    hasRequestedServerLoadRef: { current: true },
    isInvertedLoadBoundaryArmedRef: { current: false },
    isInvertedScroll: false,
    isStandardLoadBoundaryArmedRef: { current: false },
    maybeLoadNextPageRef: {
      current: mock((_trigger: "scroll" | "sentinel") => {}),
    },
    paginationFrameRef: { current: null as null | number },
    serverLoadCooldownTimerRef: { current: setTimeout(() => {}, 0) },
    ...overrides,
  };
}

function createMockRAFQueue(): MockRAFQueue {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  return {
    callbacks,
    cancel: (id: number) => {
      callbacks.delete(id);
    },
    flush: () => {
      const pending = Array.from(callbacks.entries());
      callbacks.clear();
      for (const [, callback] of pending) {
        callback(0);
      }
    },
    request: (callback: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
  };
}

describe("completeFeedServerLoadCooldown", () => {
  let raf: MockRAFQueue;

  beforeEach(() => {
    raf = createMockRAFQueue();
    global.requestAnimationFrame = raf.request as typeof requestAnimationFrame;
    global.cancelAnimationFrame = raf.cancel as typeof cancelAnimationFrame;
    window.requestAnimationFrame = raf.request as typeof requestAnimationFrame;
    window.cancelAnimationFrame = raf.cancel as typeof cancelAnimationFrame;
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test("re-arms the standard boundary and schedules a deferred sentinel re-check", () => {
    const options = buildCooldownOptions();

    completeFeedServerLoadCooldown(options);

    expect(options.hasRequestedServerLoadRef.current).toBe(false);
    expect(options.isStandardLoadBoundaryArmedRef.current).toBe(true);
    expect(options.paginationFrameRef.current).not.toBeNull();
    expect(options.maybeLoadNextPageRef.current).not.toHaveBeenCalled();

    act(() => {
      raf.flush();
    });

    expect(options.paginationFrameRef.current).toBeNull();
    expect(options.maybeLoadNextPageRef.current).toHaveBeenCalledWith(
      "sentinel",
    );
  });

  test("does not schedule a second pagination frame when one is already pending", () => {
    const options = buildCooldownOptions({
      paginationFrameRef: { current: 99 },
    });

    completeFeedServerLoadCooldown(options);

    expect(options.isStandardLoadBoundaryArmedRef.current).toBe(true);
    expect(options.paginationFrameRef.current).toBe(99);
    expect(options.maybeLoadNextPageRef.current).not.toHaveBeenCalled();
  });

  test("re-arms inverted pagination without scheduling a standard sentinel check", () => {
    const options = buildCooldownOptions({
      isInvertedScroll: true,
    });

    completeFeedServerLoadCooldown(options);

    expect(options.isInvertedLoadBoundaryArmedRef.current).toBe(true);
    expect(options.paginationFrameRef.current).toBeNull();
    expect(options.maybeLoadNextPageRef.current).not.toHaveBeenCalled();
  });

  test("runs an inverted pagination check after cooldown when user intent was queued", () => {
    const options = buildCooldownOptions({
      hasPendingBoundaryRearmAfterCooldownRef: { current: true },
      isInvertedScroll: true,
    });

    completeFeedServerLoadCooldown(options);

    expect(options.hasPendingBoundaryRearmAfterCooldownRef.current).toBe(false);
    expect(options.isInvertedLoadBoundaryArmedRef.current).toBe(true);
    expect(options.paginationFrameRef.current).not.toBeNull();
    expect(options.maybeLoadNextPageRef.current).not.toHaveBeenCalled();

    act(() => {
      raf.flush();
    });

    expect(options.paginationFrameRef.current).toBeNull();
    expect(options.maybeLoadNextPageRef.current).toHaveBeenCalledWith(
      "sentinel",
    );
  });
});
