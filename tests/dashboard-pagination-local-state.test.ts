import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { useExpandVisibleWindow } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationActions";
import { useFeedPaginationLocalState } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationLocalState";
import { useFeedPaginationStaleResumeResetEffect } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationStaleResumeResetEffect";

// ---------------------------------------------------------------------------
// rAF / cAF mocks
// ---------------------------------------------------------------------------

const originalRequestAnimationFrame = global.requestAnimationFrame;
const originalCancelAnimationFrame = global.cancelAnimationFrame;
const originalWindowRequestAnimationFrame = window.requestAnimationFrame;
const originalWindowCancelAnimationFrame = window.cancelAnimationFrame;

interface MockRAFQueue {
  callbacks: Map<number, FrameRequestCallback>;
  cancel: (id: number) => void;
  flush: () => void;
  nextId: number;
  request: (cb: FrameRequestCallback) => number;
}

function buildDefaultOptions(
  overrides?: Partial<Parameters<typeof useFeedPaginationLocalState>[0]>,
) {
  return {
    articlesPerPage: 4,
    filteredFeedLength: 20,
    hasCollapsingArticles: false,
    isLoadingMore: false,
    isRefreshing: false,
    refreshEpoch: 1,
    ...overrides,
  };
}

function createMockRAFQueue(): MockRAFQueue {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  const request = (cb: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, cb);
    return id;
  };

  const cancel = (id: number) => {
    callbacks.delete(id);
  };

  const flush = () => {
    // snapshot current entries so newly registered callbacks aren't flushed
    const pending = Array.from(callbacks.entries());
    callbacks.clear();
    for (const [, cb] of pending) {
      cb(0);
    }
  };

  return { callbacks, cancel, flush, nextId, request };
}

// ---------------------------------------------------------------------------
// useFeedPaginationLocalState
// ---------------------------------------------------------------------------

describe("useFeedPaginationLocalState – cached page skeleton reveal", () => {
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
    window.requestAnimationFrame = originalWindowRequestAnimationFrame;
    window.cancelAnimationFrame = originalWindowCancelAnimationFrame;
  });

  test("isCachedPageRevealing initialises to false", () => {
    const { result } = renderHook(() =>
      useFeedPaginationLocalState(buildDefaultOptions()),
    );
    expect(result.current.isCachedPageRevealing).toBe(false);
  });

  test("scheduleCachedPageReveal sets isCachedPageRevealing to true", () => {
    const { result } = renderHook(() =>
      useFeedPaginationLocalState(buildDefaultOptions()),
    );

    act(() => {
      result.current.scheduleCachedPageReveal(8);
    });

    expect(result.current.isCachedPageRevealing).toBe(true);
  });

  test("visibleArticleCount starts at articlesPerPage", () => {
    const { result } = renderHook(() =>
      useFeedPaginationLocalState(buildDefaultOptions({ articlesPerPage: 6 })),
    );
    expect(result.current.visibleArticleCount).toBe(6);
  });

  test("committed count appears after rAF and isCachedPageRevealing clears", async () => {
    const { result } = renderHook(() =>
      useFeedPaginationLocalState(buildDefaultOptions()),
    );

    await act(async () => {
      result.current.scheduleCachedPageReveal(8);
    });

    expect(result.current.isCachedPageRevealing).toBe(true);
    expect(result.current.visibleArticleCount).toBe(4); // still at initial

    // Flush pending animation frame to commit the new count.
    await act(async () => {
      raf.flush();
    });

    await waitFor(() => {
      expect(result.current.isCachedPageRevealing).toBe(false);
      expect(result.current.visibleArticleCount).toBe(8);
    });
  });

  test("cancelCachedPageReveal prevents stale count from being committed", () => {
    const { result } = renderHook(() =>
      useFeedPaginationLocalState(buildDefaultOptions()),
    );

    act(() => {
      result.current.scheduleCachedPageReveal(8);
    });

    expect(result.current.isCachedPageRevealing).toBe(true);

    act(() => {
      result.current.cancelCachedPageReveal();
    });

    expect(result.current.isCachedPageRevealing).toBe(false);

    // Flushing the (now cancelled) frame must not commit the stale count.
    act(() => {
      raf.flush();
    });

    expect(result.current.visibleArticleCount).toBe(4); // unchanged
    expect(result.current.isCachedPageRevealing).toBe(false);
  });

  test("superseded reveal commits only the latest count", async () => {
    const { result } = renderHook(() =>
      useFeedPaginationLocalState(buildDefaultOptions()),
    );

    await act(async () => {
      result.current.scheduleCachedPageReveal(8);
    });

    // Schedule a second (superseding) reveal before the first rAF fires.
    // With the direct-rAF approach, the second call cancels the first rAF
    // and queues a new one — no useLayoutEffect re-run required.
    await act(async () => {
      result.current.scheduleCachedPageReveal(12);
    });

    expect(result.current.isCachedPageRevealing).toBe(true);

    await act(async () => {
      raf.flush();
    });

    // Only the final count must be applied.
    await waitFor(() => {
      expect(result.current.visibleArticleCount).toBe(12);
      expect(result.current.isCachedPageRevealing).toBe(false);
    });
  });

  test("repeating the same reveal count does not restart the pending reveal", async () => {
    const { result } = renderHook(() =>
      useFeedPaginationLocalState(buildDefaultOptions()),
    );

    await act(async () => {
      result.current.scheduleCachedPageReveal(8);
    });

    await act(async () => {
      result.current.scheduleCachedPageReveal(8);
    });

    expect(result.current.isCachedPageRevealing).toBe(true);

    await act(async () => {
      raf.flush();
    });

    await waitFor(() => {
      expect(result.current.visibleArticleCount).toBe(8);
      expect(result.current.isCachedPageRevealing).toBe(false);
    });
  });

  test("cancelCachedPageReveal is idempotent when no reveal is in flight", () => {
    const { result } = renderHook(() =>
      useFeedPaginationLocalState(buildDefaultOptions()),
    );

    // Cancelling with nothing in flight must not throw or corrupt state.
    expect(() => {
      act(() => {
        result.current.cancelCachedPageReveal();
      });
    }).not.toThrow();

    expect(result.current.isCachedPageRevealing).toBe(false);
    expect(result.current.visibleArticleCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// useExpandVisibleWindow
// ---------------------------------------------------------------------------

describe("useExpandVisibleWindow – immediate vs skeletal expand", () => {
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
    window.requestAnimationFrame = originalWindowRequestAnimationFrame;
    window.cancelAnimationFrame = originalWindowCancelAnimationFrame;
  });

  function buildExpandOptions(articleCount = 20, currentVisible = 4) {
    const commitMock = mock((_n: number) => {});
    const scheduleMock = mock((_n: number) => {});
    const visibleArticleCountRef = { current: currentVisible };
    const filteredFeedLengthRef = { current: articleCount };

    return {
      commitMock,
      options: {
        articlesPerPage: 4,
        commitVisibleArticleCount: commitMock,
        filteredFeedLengthRef,
        scheduleCachedPageReveal: scheduleMock,
        visibleArticleCountRef,
      },
      scheduleMock,
    };
  }

  test("immediate=false routes expansion through scheduleCachedPageReveal", () => {
    const { commitMock, options, scheduleMock } = buildExpandOptions();

    const { result } = renderHook(() => useExpandVisibleWindow(options));

    act(() => {
      result.current(false);
    });

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock).toHaveBeenCalledWith(8);
    expect(commitMock).not.toHaveBeenCalled();
  });

  test("default (no arg) routes expansion through scheduleCachedPageReveal", () => {
    const { commitMock, options, scheduleMock } = buildExpandOptions();

    const { result } = renderHook(() => useExpandVisibleWindow(options));

    act(() => {
      result.current();
    });

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(commitMock).not.toHaveBeenCalled();
  });

  test("immediate=true routes expansion through commitVisibleArticleCount", () => {
    const { commitMock, options, scheduleMock } = buildExpandOptions();

    const { result } = renderHook(() => useExpandVisibleWindow(options));

    act(() => {
      result.current(true);
    });

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(commitMock).toHaveBeenCalledWith(8);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  test("returns true when expansion advances the window", () => {
    const { options } = buildExpandOptions();

    const { result } = renderHook(() => useExpandVisibleWindow(options));

    let didExpand = false;
    act(() => {
      didExpand = result.current(true);
    });

    expect(didExpand).toBe(true);
  });

  test("returns false when already at the full filtered feed length", () => {
    const { options } = buildExpandOptions(4, 4); // current == total

    const { result } = renderHook(() => useExpandVisibleWindow(options));

    let didExpand = false;
    act(() => {
      didExpand = result.current(true);
    });

    expect(didExpand).toBe(false);
  });

  test("expands by exactly articlesPerPage on each call", () => {
    const { options, scheduleMock } = buildExpandOptions(24, 4);

    const { result } = renderHook(() => useExpandVisibleWindow(options));

    act(() => {
      result.current(false);
    });

    expect(scheduleMock).toHaveBeenCalledWith(8); // 4 + 4
  });

  test("clamps to filteredFeedLength when remaining articles is less than a page", () => {
    const { options, scheduleMock } = buildExpandOptions(6, 4);

    const { result } = renderHook(() => useExpandVisibleWindow(options));

    act(() => {
      result.current(false);
    });

    expect(scheduleMock).toHaveBeenCalledWith(6); // clamped to feed length
  });
});

// ---------------------------------------------------------------------------
// stale browser resume recovery
// ---------------------------------------------------------------------------

describe("useFeedPaginationStaleResumeResetEffect", () => {
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
    window.requestAnimationFrame = originalWindowRequestAnimationFrame;
    window.cancelAnimationFrame = originalWindowCancelAnimationFrame;
  });

  test("resets pagination and moves standard scroll away from a stale boundary", () => {
    const originalDateNow = Date.now;
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "hidden",
    );
    const resetPaginationState = mock(() => {});
    const scrollViewport = document.createElement("div");
    scrollViewport.scrollTop = 240;
    let isHidden = false;
    let now = 1_000;

    Date.now = () => now;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => isHidden,
    });

    try {
      const hook = renderHook(() =>
        useFeedPaginationStaleResumeResetEffect({
          isInvertedScroll: false,
          resetPaginationState,
          scrollViewport,
        }),
      );

      isHidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
      isHidden = false;
      now = 32_000;
      document.dispatchEvent(new Event("visibilitychange"));

      expect(resetPaginationState).toHaveBeenCalledTimes(1);
      expect(scrollViewport.scrollTop).toBe(240);

      act(() => {
        raf.flush();
      });

      expect(scrollViewport.scrollTop).toBe(0);
      hook.unmount();
    } finally {
      Date.now = originalDateNow;
      if (hiddenDescriptor) {
        Object.defineProperty(document, "hidden", hiddenDescriptor);
      } else {
        Reflect.deleteProperty(document, "hidden");
      }
    }
  });

  test("keeps pagination state for short tab switches", () => {
    const originalDateNow = Date.now;
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "hidden",
    );
    const resetPaginationState = mock(() => {});
    let isHidden = false;
    let now = 1_000;

    Date.now = () => now;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => isHidden,
    });

    try {
      const hook = renderHook(() =>
        useFeedPaginationStaleResumeResetEffect({
          isInvertedScroll: false,
          resetPaginationState,
          scrollViewport: document.createElement("div"),
        }),
      );

      isHidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
      isHidden = false;
      now = 5_000;
      document.dispatchEvent(new Event("visibilitychange"));

      expect(resetPaginationState).not.toHaveBeenCalled();
      hook.unmount();
    } finally {
      Date.now = originalDateNow;
      if (hiddenDescriptor) {
        Object.defineProperty(document, "hidden", hiddenDescriptor);
      } else {
        Reflect.deleteProperty(document, "hidden");
      }
    }
  });

  test("preserves an expanded article viewport across stale-resume recovery", () => {
    const originalDateNow = Date.now;
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "hidden",
    );
    const resetPaginationState = mock(() => {});
    const scrollViewport = document.createElement("div");
    scrollViewport.scrollTop = 240;
    let isHidden = false;
    let now = 1_000;

    Date.now = () => now;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => isHidden,
    });

    try {
      const hook = renderHook(() =>
        useFeedPaginationStaleResumeResetEffect({
          expandedArticleKey: "https://example.com/articles/expanded",
          isInvertedScroll: false,
          resetPaginationState,
          scrollViewport,
        }),
      );

      isHidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
      isHidden = false;
      now = 32_000;
      document.dispatchEvent(new Event("visibilitychange"));

      expect(resetPaginationState).not.toHaveBeenCalled();

      act(() => {
        raf.flush();
      });

      expect(scrollViewport.scrollTop).toBe(240);
      hook.unmount();
    } finally {
      Date.now = originalDateNow;
      if (hiddenDescriptor) {
        Object.defineProperty(document, "hidden", hiddenDescriptor);
      } else {
        Reflect.deleteProperty(document, "hidden");
      }
    }
  });
});
