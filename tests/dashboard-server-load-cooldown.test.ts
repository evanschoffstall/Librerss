import { act, renderHook } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";

import {
  completeFeedServerLoadCooldown,
  useFeedPaginationServerLoad,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationServerLoad";

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

async function flushDeferredPaginationCheck() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

describe("completeFeedServerLoadCooldown", () => {
  test("re-arms the standard boundary and schedules a deferred sentinel re-check", async () => {
    const options = buildCooldownOptions();

    completeFeedServerLoadCooldown(options);

    expect(options.hasRequestedServerLoadRef.current).toBe(false);
    expect(options.isStandardLoadBoundaryArmedRef.current).toBe(true);
    expect(options.paginationFrameRef.current).not.toBeNull();
    expect(options.maybeLoadNextPageRef.current).not.toHaveBeenCalled();

    await flushDeferredPaginationCheck();

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

  test("runs an inverted pagination check after cooldown when user intent was queued", async () => {
    const options = buildCooldownOptions({
      hasPendingBoundaryRearmAfterCooldownRef: { current: true },
      isInvertedScroll: true,
    });

    completeFeedServerLoadCooldown(options);

    expect(options.hasPendingBoundaryRearmAfterCooldownRef.current).toBe(false);
    expect(options.isInvertedLoadBoundaryArmedRef.current).toBe(true);
    expect(options.paginationFrameRef.current).not.toBeNull();
    expect(options.maybeLoadNextPageRef.current).not.toHaveBeenCalled();

    await flushDeferredPaginationCheck();

    expect(options.paginationFrameRef.current).toBeNull();
    expect(options.maybeLoadNextPageRef.current).toHaveBeenCalledWith(
      "sentinel",
    );
  });
});

describe("useFeedPaginationServerLoad", () => {
  test("does not claim a server load when the dashboard owner rejects the request", () => {
    const isInvertedLoadBoundaryArmedRef = { current: false };
    const isStandardLoadBoundaryArmedRef = { current: false };
    const maybeLoadNextPageRef = {
      current: null as ((_trigger: "scroll" | "sentinel") => void) | null,
    };
    const paginationFrameRef = { current: null as null | number };
    const onLoadMore = mock(() => false);

    const { result } = renderHook(() => {
      return useFeedPaginationServerLoad({
        canLoadMoreFromServer: true,
        isInvertedLoadBoundaryArmedRef,
        isInvertedScroll: false,
        isStandardLoadBoundaryArmedRef,
        maybeLoadNextPageRef,
        onLoadMore,
        paginationFrameRef,
      });
    });

    let didRequestMore = false;

    act(() => {
      didRequestMore = result.current.requestMoreFromServer();
    });

    expect(didRequestMore).toBe(false);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(result.current.hasRequestedServerLoadRef.current).toBe(false);
    expect(result.current.hasPendingServerRevealRef.current).toBe(false);
    expect(result.current.isPendingServerRevealVisible).toBe(false);
  });
});
