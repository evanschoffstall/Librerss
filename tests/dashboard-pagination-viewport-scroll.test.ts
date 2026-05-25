import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  createViewportBoundaryHandlers,
  createViewportScrollHandler,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/feedPaginationViewportScroll";

describe("createViewportScrollHandler", () => {
  let originalRequestAnimationFrame: typeof global.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof global.cancelAnimationFrame;

  beforeEach(() => {
    originalRequestAnimationFrame = global.requestAnimationFrame;
    originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;
    global.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
    window.requestAnimationFrame = global.requestAnimationFrame;
    window.cancelAnimationFrame = global.cancelAnimationFrame;
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test("treats standard scroll movement as user intent before loading the next page", () => {
    const maybeLoadNextPage = mock((_trigger: "scroll" | "sentinel") => {});
    const rearmStandardBoundaryFromScrollPosition = mock(() => {});
    const hasUserScrolledRef = { current: false };
    const scrollViewport = {
      clientHeight: 400,
      scrollHeight: 1200,
      scrollTop: 600,
    } as HTMLElement;

    const handleScroll = createViewportScrollHandler({
      capturePendingInvertedPaginationAnchorSnapshot: mock(() => {}),
      clearInitialNormalScrollLock: mock(() => {}),
      hasActiveInvertedExpansionScrollLock: mock(() => false),
      hasUserScrolledRef,
      invertedPaginationAnchorRef: { current: null },
      isInvertedScroll: false,
      maybeLoadNextPage,
      normalScrollIntentSuppressionFrameRef: { current: null },
      onClaimInvertedScrollOwnership: mock(() => {}),
      onSyncInvertedExpansionScrollLock: mock(() => {}),
      pendingInvertedPaginationAnchorSnapshotRef: { current: null },
      preservePendingInvertedPaginationAnchorSnapshotRef: { current: false },
      rearmInvertedBoundaryFromScrollPosition: mock(() => {}),
      rearmStandardBoundaryFromScrollPosition,
      releaseInvertedPaginationAnchor: mock(() => {}),
      scrollViewport,
      shouldLockInitialNormalScroll: mock(() => false),
      suppressImmediateNormalScrollIntent: mock(() => {}),
    });

    act(() => {
      handleScroll();
    });

    expect(hasUserScrolledRef.current).toBe(true);
    expect(rearmStandardBoundaryFromScrollPosition).toHaveBeenCalledTimes(1);
    expect(maybeLoadNextPage).toHaveBeenCalledWith("scroll");
  });

  test("resets restored initial standard scroll without treating it as pagination intent", () => {
    const maybeLoadNextPage = mock((_trigger: "scroll" | "sentinel") => {});
    const clearInitialNormalScrollLock = mock(() => {});
    const suppressImmediateNormalScrollIntent = mock(() => {});
    const rearmStandardBoundaryFromScrollPosition = mock(() => {});
    const hasUserScrolledRef = { current: false };
    const scrollViewport = {
      clientHeight: 400,
      scrollHeight: 1200,
      scrollTop: 600,
    } as HTMLElement;

    const handleScroll = createViewportScrollHandler({
      capturePendingInvertedPaginationAnchorSnapshot: mock(() => {}),
      clearInitialNormalScrollLock,
      hasActiveInvertedExpansionScrollLock: mock(() => false),
      hasUserScrolledRef,
      invertedPaginationAnchorRef: { current: null },
      isInvertedScroll: false,
      maybeLoadNextPage,
      normalScrollIntentSuppressionFrameRef: { current: null },
      onClaimInvertedScrollOwnership: mock(() => {}),
      onSyncInvertedExpansionScrollLock: mock(() => {}),
      pendingInvertedPaginationAnchorSnapshotRef: { current: null },
      preservePendingInvertedPaginationAnchorSnapshotRef: { current: false },
      rearmInvertedBoundaryFromScrollPosition: mock(() => {}),
      rearmStandardBoundaryFromScrollPosition,
      releaseInvertedPaginationAnchor: mock(() => {}),
      scrollViewport,
      shouldLockInitialNormalScroll: mock(() => true),
      suppressImmediateNormalScrollIntent,
    });

    act(() => {
      handleScroll();
    });

    expect(scrollViewport.scrollTop).toBe(0);
    expect(hasUserScrolledRef.current).toBe(false);
    expect(clearInitialNormalScrollLock).toHaveBeenCalledTimes(1);
    expect(suppressImmediateNormalScrollIntent).toHaveBeenCalledTimes(1);
    expect(rearmStandardBoundaryFromScrollPosition).not.toHaveBeenCalled();
    expect(maybeLoadNextPage).not.toHaveBeenCalled();
  });

  test("does not trigger inverted pagination while the expansion lock owns the viewport", () => {
    const maybeLoadNextPage = mock((_trigger: "scroll" | "sentinel") => {});
    const capturePendingInvertedPaginationAnchorSnapshot = mock(() => {});
    const rearmInvertedBoundaryFromScrollPosition = mock(() => {});
    const releaseInvertedPaginationAnchor = mock(() => {});
    const onClaimInvertedScrollOwnership = mock(() => {});
    const hasUserScrolledRef = { current: false };
    const scrollViewport = {
      clientHeight: 400,
      scrollHeight: 1200,
      scrollTop: 320,
    } as HTMLElement;

    const handleScroll = createViewportScrollHandler({
      capturePendingInvertedPaginationAnchorSnapshot,
      clearInitialNormalScrollLock: mock(() => {}),
      hasActiveInvertedExpansionScrollLock: mock(() => true),
      hasUserScrolledRef,
      invertedPaginationAnchorRef: { current: null },
      isInvertedScroll: true,
      maybeLoadNextPage,
      normalScrollIntentSuppressionFrameRef: { current: null },
      onClaimInvertedScrollOwnership,
      onSyncInvertedExpansionScrollLock: mock(() => {}),
      pendingInvertedPaginationAnchorSnapshotRef: { current: null },
      preservePendingInvertedPaginationAnchorSnapshotRef: { current: false },
      rearmInvertedBoundaryFromScrollPosition,
      rearmStandardBoundaryFromScrollPosition: mock(() => {}),
      releaseInvertedPaginationAnchor,
      scrollViewport,
      shouldLockInitialNormalScroll: mock(() => false),
      suppressImmediateNormalScrollIntent: mock(() => {}),
    });

    act(() => {
      handleScroll();
    });

    expect(hasUserScrolledRef.current).toBe(true);
    expect(releaseInvertedPaginationAnchor).toHaveBeenCalledTimes(1);
    expect(onClaimInvertedScrollOwnership).toHaveBeenCalledTimes(1);
    expect(
      capturePendingInvertedPaginationAnchorSnapshot,
    ).not.toHaveBeenCalled();
    expect(rearmInvertedBoundaryFromScrollPosition).toHaveBeenCalledTimes(1);
    expect(maybeLoadNextPage).not.toHaveBeenCalled();
  });

  test("records passive inverted away history without claiming user ownership", () => {
    const maybeLoadNextPage = mock((_trigger: "scroll" | "sentinel") => {});
    const capturePendingInvertedPaginationAnchorSnapshot = mock(() => {});
    const rearmInvertedBoundaryFromScrollPosition = mock(() => {});
    const releaseInvertedPaginationAnchor = mock(() => {});
    const onClaimInvertedScrollOwnership = mock(() => {});
    const hasUserScrolledRef = { current: false };
    const scrollViewport = {
      clientHeight: 400,
      scrollHeight: 1242,
      scrollTop: 800,
    } as HTMLElement;

    const handleScroll = createViewportScrollHandler({
      capturePendingInvertedPaginationAnchorSnapshot,
      clearInitialNormalScrollLock: mock(() => {}),
      hasActiveInvertedExpansionScrollLock: mock(() => false),
      hasUserScrolledRef,
      invertedPaginationAnchorRef: { current: null },
      isInvertedScroll: true,
      maybeLoadNextPage,
      normalScrollIntentSuppressionFrameRef: { current: null },
      onClaimInvertedScrollOwnership,
      onSyncInvertedExpansionScrollLock: mock(() => {}),
      pendingInvertedPaginationAnchorSnapshotRef: { current: null },
      preservePendingInvertedPaginationAnchorSnapshotRef: { current: false },
      rearmInvertedBoundaryFromScrollPosition,
      rearmStandardBoundaryFromScrollPosition: mock(() => {}),
      releaseInvertedPaginationAnchor,
      scrollViewport,
      shouldLockInitialNormalScroll: mock(() => false),
      suppressImmediateNormalScrollIntent: mock(() => {}),
    });

    act(() => {
      handleScroll();
    });

    expect(hasUserScrolledRef.current).toBe(false);
    expect(onClaimInvertedScrollOwnership).not.toHaveBeenCalled();
    expect(releaseInvertedPaginationAnchor).not.toHaveBeenCalled();
    expect(
      capturePendingInvertedPaginationAnchorSnapshot,
    ).not.toHaveBeenCalled();
    expect(rearmInvertedBoundaryFromScrollPosition).toHaveBeenCalledTimes(1);
    expect(maybeLoadNextPage).not.toHaveBeenCalled();
  });

  test("rearms inverted cached pagination when anchor stabilization records away movement", () => {
    const isInvertedLoadBoundaryArmedRef = { current: false };
    const lastInvertedScrollTopRef = { current: 0 };
    const scrollViewport = {
      clientHeight: 400,
      scrollHeight: 1242,
      scrollTop: 528,
    } as HTMLElement;
    const { rearmInvertedBoundaryFromScrollPosition } =
      createViewportBoundaryHandlers({
        hasPendingBoundaryRearmAfterCooldownRef: { current: false },
        hasPendingServerRevealRef: { current: false },
        hasRequestedServerLoadRef: { current: false },
        invertedPaginationAnchorRef: { current: {} },
        isInvertedLoadBoundaryArmedRef,
        isInvertedScroll: true,
        isStandardLoadBoundaryArmedRef: { current: false },
        lastInvertedScrollTopRef,
        lastStandardScrollTopRef: { current: null },
        scrollViewport,
      });

    rearmInvertedBoundaryFromScrollPosition();

    expect(isInvertedLoadBoundaryArmedRef.current).toBe(true);
    expect(lastInvertedScrollTopRef.current).toBe(528);
  });
});
