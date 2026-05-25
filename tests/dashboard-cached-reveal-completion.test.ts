import { act, renderHook } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";

import { useCachedRevealCompletionEffect } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useCachedRevealCompletionEffect";

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

async function flushDeferredPaginationCheck() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useCachedRevealCompletionEffect", () => {
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

  test("keeps the inverted boundary disarmed after cached reveal completion", () => {
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

    expect(options.isInvertedLoadBoundaryArmedRef.current).toBe(false);
    expect(options.isStandardLoadBoundaryArmedRef.current).toBe(false);
    expect(options.paginationFrameRef.current).toBeNull();
    expect(options.maybeLoadNextPage).not.toHaveBeenCalled();
  });

  test("schedules deferred maybeLoadNextPage via timeout after reveal", async () => {
    const options = buildDefaultOptions({ isCachedPageRevealing: true });

    const { rerender } = renderHook(() =>
      useCachedRevealCompletionEffect(options),
    );

    options.isCachedPageRevealing = false;

    act(() => {
      rerender();
    });

    // The timeout should be scheduled but not yet fired.
    expect(options.paginationFrameRef.current).not.toBeNull();
    expect(options.maybeLoadNextPage).not.toHaveBeenCalled();

    await flushDeferredPaginationCheck();

    expect(options.maybeLoadNextPage).toHaveBeenCalledTimes(1);
    expect(options.maybeLoadNextPage).toHaveBeenCalledWith("sentinel");
    expect(options.paginationFrameRef.current).toBeNull();
  });

  test("does not schedule timeout if paginationFrameRef already occupied", () => {
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
