import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { useServerLoadSkeletonHold } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useServerLoadSkeletonHold";
import { SKELETON_MIN_VISIBLE_MS } from "@/app/dashboard/components/feed-view/feed-list-surface-state/view-core";

// ---------------------------------------------------------------------------
// Timer control
// ---------------------------------------------------------------------------

const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;

interface MockTimerQueue {
  advance: (ms: number) => void;
  entries: TimerEntry[];
  nextId: number;
}

interface TimerEntry {
  callback: () => void;
  delay: number;
  id: number;
}

function createMockTimerQueue(): MockTimerQueue {
  const entries: TimerEntry[] = [];
  let nextId = 1;

  const mockSetTimeout = ((cb: () => void, delay = 0) => {
    const id = nextId++;
    entries.push({ callback: cb, delay, id });
    return id;
  }) as unknown as typeof global.setTimeout;

  const mockClearTimeout = ((id: number) => {
    const index = entries.findIndex((entry) => entry.id === id);
    if (index !== -1) {
      entries.splice(index, 1);
    }
  }) as unknown as typeof global.clearTimeout;

  global.setTimeout = mockSetTimeout;
  global.clearTimeout = mockClearTimeout;

  const advance = (ms: number) => {
    const ready = entries.filter((entry) => entry.delay <= ms);
    for (const entry of ready) {
      const index = entries.indexOf(entry);
      if (index !== -1) {
        entries.splice(index, 1);
      }
    }
    for (const entry of ready) {
      entry.callback();
    }
    for (const remaining of entries) {
      remaining.delay -= ms;
    }
  };

  return { advance, entries, nextId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useServerLoadSkeletonHold", () => {
  let timers: MockTimerQueue;

  beforeEach(() => {
    timers = createMockTimerQueue();
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  test("returns false when isLoadingMore is false", () => {
    const { result } = renderHook(() => useServerLoadSkeletonHold(false));
    expect(result.current).toBe(false);
  });

  test("returns true when isLoadingMore is true", () => {
    const { result } = renderHook(() => useServerLoadSkeletonHold(true));
    expect(result.current).toBe(true);
  });

  test("stays true for SKELETON_MIN_VISIBLE_MS after isLoadingMore goes false", () => {
    const { rerender, result } = renderHook(
      ({ loading }: { loading: boolean }) => useServerLoadSkeletonHold(loading),
      { initialProps: { loading: true } },
    );

    expect(result.current).toBe(true);

    // Transition to not-loading — hold should still keep it true.
    act(() => {
      rerender({ loading: false });
    });

    expect(result.current).toBe(true);

    // Advance time but NOT past the hold threshold.
    act(() => {
      timers.advance(SKELETON_MIN_VISIBLE_MS - 1);
    });

    expect(result.current).toBe(true);

    // Now advance past the hold threshold.
    act(() => {
      timers.advance(2);
    });

    expect(result.current).toBe(false);
  });

  test("clears the hold timer when isLoadingMore becomes true again", () => {
    const { rerender, result } = renderHook(
      ({ loading }: { loading: boolean }) => useServerLoadSkeletonHold(loading),
      { initialProps: { loading: true } },
    );

    // Transition to false to start the hold timer.
    act(() => {
      rerender({ loading: false });
    });

    expect(result.current).toBe(true);
    expect(timers.entries.length).toBe(1);

    // Transition back to true — timer should be cleared.
    act(() => {
      rerender({ loading: true });
    });

    expect(result.current).toBe(true);
    expect(timers.entries.length).toBe(0);
  });

  test("returns false after the hold timer completes", () => {
    const { rerender, result } = renderHook(
      ({ loading }: { loading: boolean }) => useServerLoadSkeletonHold(loading),
      { initialProps: { loading: true } },
    );

    act(() => {
      rerender({ loading: false });
    });

    act(() => {
      timers.advance(SKELETON_MIN_VISIBLE_MS);
    });

    expect(result.current).toBe(false);
  });

  test("does not activate the hold on initial false state", () => {
    const { result } = renderHook(
      ({ loading }: { loading: boolean }) => useServerLoadSkeletonHold(loading),
      { initialProps: { loading: false } },
    );

    expect(result.current).toBe(false);
    expect(timers.entries.length).toBe(0);
  });

  test("handles rapid toggling without leaking timers", () => {
    const { rerender, result } = renderHook(
      ({ loading }: { loading: boolean }) => useServerLoadSkeletonHold(loading),
      { initialProps: { loading: true } },
    );

    // Toggle off then on rapidly.
    act(() => {
      rerender({ loading: false });
    });

    expect(timers.entries.length).toBe(1);

    act(() => {
      rerender({ loading: true });
    });

    expect(timers.entries.length).toBe(0);

    act(() => {
      rerender({ loading: false });
    });

    expect(timers.entries.length).toBe(1);

    act(() => {
      timers.advance(SKELETON_MIN_VISIBLE_MS);
    });

    expect(result.current).toBe(false);
  });
});
