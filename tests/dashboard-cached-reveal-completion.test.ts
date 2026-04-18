import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { useCachedRevealCompletionEffect } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useCachedRevealCompletionEffect";

// ---------------------------------------------------------------------------
// rAF mock
// ---------------------------------------------------------------------------

const originalRequestAnimationFrame = global.requestAnimationFrame;
const originalCancelAnimationFrame = global.cancelAnimationFrame;

interface MockRAFQueue {
  callbacks: Map<number, FrameRequestCallback>;
  cancel: (id: number) => void;
  flush: () => void;
  nextId: number;
  request: (cb: FrameRequestCallback) => number;
}

function buildDefaultOptions(
  overrides?: Partial<{
    isCachedPageRevealing: boolean;
    isInvertedScroll: boolean;
  }>,
) {
  const maybeLoadNextPage = mock((_trigger: "scroll" | "sentinel") => {});

  return {
    isCachedPageRevealing: false,
    isInvertedLoadBoundaryArmedRef: { current: false },
    isInvertedScroll: false,
    isStandardLoadBoundaryArmedRef: { current: false },
    maybeLoadNextPage,
    paginationFrameRef: { current: null as null | number },
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
      for (const [, cb] of pending) {
        cb(0);
      }
    },
    nextId,
    request: (cb: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, cb);
      return id;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCachedRevealCompletionEffect", () => {
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

  test("does not fire on initial mount with isCachedPageRevealing=false", () => {
    const options = buildDefaultOptions();

    renderHook(() => useCachedRevealCompletionEffect(options));

    expect(options.isStandardLoadBoundaryArmedRef.current).toBe(false);
    expect(options.maybeLoadNextPage).not.toHaveBeenCalled();
  });

  test("does not fire while still revealing", () => {
    const options = buildDefaultOptions({ isCachedPageRevealing: true });

    renderHook(() => useCachedRevealCompletionEffect(options));

    expect(options.isStandardLoadBoundaryArmedRef.current).toBe(false);
    expect(options.maybeLoadNextPage).not.toHaveBeenCalled();
  });

  test("re-arms standard boundary on reveal completion", () => {
    const options = buildDefaultOptions({ isCachedPageRevealing: true });

    const { rerender } = renderHook(() =>
      useCachedRevealCompletionEffect(options),
    );

    // Transition: revealing → not revealing.
    options.isCachedPageRevealing = false;

    act(() => {
      rerender();
    });

    expect(options.isStandardLoadBoundaryArmedRef.current).toBe(true);
  });

  test("re-arms inverted boundary in inverted scroll mode", () => {
    const options = buildDefaultOptions({
      isCachedPageRevealing: true,
      isInvertedScroll: true,
    });

    const { rerender } = renderHook(() =>
      useCachedRevealCompletionEffect(options),
    );

    options.isCachedPageRevealing = false;

    act(() => {
      rerender();
    });

    expect(options.isInvertedLoadBoundaryArmedRef.current).toBe(true);
    expect(options.isStandardLoadBoundaryArmedRef.current).toBe(false);
  });

  test("schedules deferred maybeLoadNextPage via rAF after reveal", () => {
    const options = buildDefaultOptions({ isCachedPageRevealing: true });

    const { rerender } = renderHook(() =>
      useCachedRevealCompletionEffect(options),
    );

    options.isCachedPageRevealing = false;

    act(() => {
      rerender();
    });

    // rAF should be scheduled but not yet fired.
    expect(options.paginationFrameRef.current).not.toBeNull();
    expect(options.maybeLoadNextPage).not.toHaveBeenCalled();

    // Flush the rAF.
    act(() => {
      raf.flush();
    });

    expect(options.maybeLoadNextPage).toHaveBeenCalledTimes(1);
    expect(options.maybeLoadNextPage).toHaveBeenCalledWith("sentinel");
    expect(options.paginationFrameRef.current).toBeNull();
  });

  test("does not schedule rAF if paginationFrameRef already occupied", () => {
    const options = buildDefaultOptions({ isCachedPageRevealing: true });
    options.paginationFrameRef.current = 999;

    const { rerender } = renderHook(() =>
      useCachedRevealCompletionEffect(options),
    );

    options.isCachedPageRevealing = false;

    act(() => {
      rerender();
    });

    // Should not overwrite the existing frame ref.
    expect(options.paginationFrameRef.current).toBe(999);
    expect(options.maybeLoadNextPage).not.toHaveBeenCalled();
  });

  test("does not fire on false→false transition", () => {
    const options = buildDefaultOptions({ isCachedPageRevealing: false });

    const { rerender } = renderHook(() =>
      useCachedRevealCompletionEffect(options),
    );

    // Re-render with still false.
    act(() => {
      rerender();
    });

    expect(options.isStandardLoadBoundaryArmedRef.current).toBe(false);
    expect(options.maybeLoadNextPage).not.toHaveBeenCalled();
  });
});
