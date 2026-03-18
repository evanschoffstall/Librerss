import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { useCallback, useRef } from "react";
import { renderToString } from "react-dom/server";

import { DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import { getScrollLockReleaseMs } from "@/app/dashboard/hooks/feed-surface-scroll-lock";
import {
  FEED_PULL_HEIGHT,
  FEED_PULL_OFFSET,
  useFeedPullRefresh,
  useFeedScrollLock,
} from "@/app/dashboard/hooks/useFeedSurface";

const PULL_RELEASE_MS = 200;
const WHEEL_RELEASE_MS = 480;

const originalDateNow = Date.now;
const originalClearTimeout = globalThis.clearTimeout;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalSetTimeout = globalThis.setTimeout;

type FakeTimerCallback = () => void;
type FakeTimerHandle = ReturnType<typeof originalSetTimeout>;

let fakeNow = 0;
let nextTimerId = 1;
let scheduledTimers = new Map<
  number,
  { callback: FakeTimerCallback; runAt: number }
>();

function installFakeTimers() {
  fakeNow = originalDateNow();
  nextTimerId = 1;
  scheduledTimers = new Map();

  Date.now = () => fakeNow;

  const fakeSetTimeout = ((callback: TimerHandler, delay?: number) => {
    const timerId = nextTimerId++;
    scheduledTimers.set(timerId, {
      callback: () => {
        if (typeof callback !== "function") {
          throw new TypeError(
            "String timer callbacks are not supported in tests.",
          );
        }
        callback();
      },
      runAt: fakeNow + Math.max(0, Number(delay ?? 0)),
    });
    return timerId as unknown as FakeTimerHandle;
  }) as unknown as typeof globalThis.setTimeout;

  const fakeClearTimeout: typeof globalThis.clearTimeout = ((
    timerId: FakeTimerHandle,
  ) => {
    scheduledTimers.delete(timerId as unknown as number);
  }) as typeof globalThis.clearTimeout;

  globalThis.setTimeout = fakeSetTimeout;
  globalThis.clearTimeout = fakeClearTimeout;
  window.setTimeout = fakeSetTimeout;
  window.clearTimeout = fakeClearTimeout;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    fakeSetTimeout(
      () => callback(fakeNow),
      16,
    ) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((frameId: number) => {
    fakeClearTimeout(frameId as unknown as FakeTimerHandle);
  }) as typeof cancelAnimationFrame;
  window.requestAnimationFrame = globalThis.requestAnimationFrame;
  window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
}

function restoreFakeTimers() {
  Date.now = originalDateNow;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  window.setTimeout = originalSetTimeout;
  window.clearTimeout = originalClearTimeout;
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
  scheduledTimers.clear();
}

function tickFakeTimers(ms: number) {
  const targetTime = fakeNow + ms;
  while (true) {
    const nextDueTimer = [...scheduledTimers.entries()]
      .filter(([, timer]) => timer.runAt <= targetTime)
      .sort((left, right) => left[1].runAt - right[1].runAt)[0];

    if (!nextDueTimer) break;

    const [timerId, timer] = nextDueTimer;
    scheduledTimers.delete(timerId);
    fakeNow = timer.runAt;
    timer.callback();
  }
  fakeNow = targetTime;
}

beforeEach(() => {
  mock.restore();
  window.sessionStorage.clear();
});

afterEach(() => {
  mock.restore();
  window.sessionStorage.clear();
});

async function withFakeTimers<T>(run: () => Promise<T> | T): Promise<T> {
  installFakeTimers();
  try {
    return await run();
  } finally {
    restoreFakeTimers();
  }
}

const waitForMs = async (ms: number) => {
  act(() => {
    tickFakeTimers(ms);
  });
  await Promise.resolve();
};

function createRect(top: number, height: number) {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 300,
    toJSON: () => ({}),
    top,
    width: 300,
    x: 0,
    y: top,
  };
}

function renderPullHarness(
  onRefresh: () => void,
  disabled = false,
  lockRef?: React.RefObject<false | number>,
  allowNegativeScroll = false,
  contentHeightRef?: { current: number },
) {
  function Harness({ isDisabled }: { isDisabled: boolean }) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const pull = useFeedPullRefresh(rootRef, onRefresh, isDisabled, lockRef);

    const setViewportRef = useCallback((node: HTMLDivElement | null) => {
      if (!node || node.dataset.ready === "true") return;
      let top = 0;
      Object.defineProperty(node, "scrollTop", {
        configurable: true,
        get: () => top,
        set: (value: number) => {
          top = allowNegativeScroll ? value : Math.max(0, value);
        },
      });
      Object.defineProperty(node, "clientHeight", {
        configurable: true,
        get: () => 600,
      });
      Object.defineProperty(node, "scrollHeight", {
        configurable: true,
        get() {
          return (node.firstElementChild as HTMLElement).offsetHeight;
        },
      });
      node.scrollTo = ((options: ScrollToOptions) => {
        top = Math.max(0, options.top ?? top);
      }) as typeof node.scrollTo;
      node.dataset.ready = "true";
      node.setAttribute("data-radix-scroll-area-viewport", "");
    }, []);

    const setWrapperRef = useCallback((node: HTMLDivElement | null) => {
      if (!node || node.dataset.ready === "true") return;
      Object.defineProperty(node, "offsetHeight", {
        configurable: true,
        get() {
          const pad = parseFloat(node.style.paddingBottom) || 0;
          const feedWrapper = node.firstElementChild as HTMLElement | null;
          return (feedWrapper?.scrollHeight ?? 0) + pad;
        },
      });
      Object.defineProperty(node, "scrollHeight", {
        configurable: true,
        get() {
          const pad = parseFloat(node.style.paddingBottom) || 0;
          const feedWrapper = node.firstElementChild as HTMLElement | null;
          return (feedWrapper?.scrollHeight ?? 0) + pad;
        },
      });
      node.dataset.ready = "true";
    }, []);

    const setFeedWrapperRef = useCallback((node: HTMLDivElement | null) => {
      if (!node || node.dataset.ready === "true") return;
      Object.defineProperty(node, "offsetHeight", {
        configurable: true,
        get() {
          return Array.from(node.children).reduce(
            (total, child) =>
              total + (child instanceof HTMLElement ? child.offsetHeight : 0),
            0,
          );
        },
      });
      Object.defineProperty(node, "scrollHeight", {
        configurable: true,
        get() {
          return Array.from(node.children).reduce(
            (total, child) =>
              total + (child instanceof HTMLElement ? child.offsetHeight : 0),
            0,
          );
        },
      });
      node.dataset.ready = "true";
    }, []);

    const setContentRef = useCallback((node: HTMLDivElement | null) => {
      if (!node || node.dataset.ready === "true" || !contentHeightRef) return;
      Object.defineProperty(node, "offsetHeight", {
        configurable: true,
        get: () => contentHeightRef.current,
      });
      node.dataset.ready = "true";
    }, []);

    const setSentinelRef = useCallback(
      (node: HTMLDivElement | null) => {
        pull.sentinelRef.current = node;
        if (!node || node.dataset.ready === "true") return;
        Object.defineProperty(node, "offsetHeight", {
          configurable: true,
          get: () => FEED_PULL_HEIGHT,
        });
        node.dataset.ready = "true";
      },
      [pull.sentinelRef],
    );

    return (
      <div ref={rootRef}>
        <div ref={setViewportRef}>
          <div ref={setWrapperRef}>
            <div
              data-pulling={String(pull.pulling)}
              data-ready={String(pull.readyToRefresh)}
              ref={setFeedWrapperRef}
            >
              <div ref={setSentinelRef} />
              <div ref={setContentRef}>content</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const rendered = render(<Harness isDisabled={disabled} />);
  const viewport = rendered.container.querySelector<HTMLElement>(
    "[data-radix-scroll-area-viewport]",
  );
  const feedWrapper =
    rendered.container.querySelector<HTMLElement>("[data-pulling]");
  if (!viewport) throw new Error("missing viewport");
  if (!feedWrapper) throw new Error("missing feed wrapper");
  return {
    ...rendered,
    feedWrapper,
    rerenderHarness(nextDisabled: boolean) {
      rendered.rerender(<Harness isDisabled={nextDisabled} />);
    },
    viewport,
  };
}

describe("useFeedPullRefresh", () => {
  test("renders the pull sentinel collapsed during server render", () => {
    function ServerHarness() {
      const rootRef = useRef<HTMLDivElement | null>(null);
      const pull = useFeedPullRefresh(rootRef, () => {});

      return <div data-sentinel-height={String(pull.sentinelHeight)} />;
    }

    const markup = renderToString(<ServerHarness />);

    expect(markup).toContain('data-sentinel-height="0"');
  });

  test("resets shallow pulls on scrollend", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { unmount, viewport } = renderPullHarness(onRefresh);

      act(() => {
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 70;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("touchend"));
      });

      expect(viewport.scrollTop).toBe(70);

      act(() => {
        viewport.dispatchEvent(new Event("scrollend"));
      });

      await waitForMs(PULL_RELEASE_MS);

      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET);
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    });
  });

  test("committed pulls trigger refresh and hold position", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { unmount, viewport } = renderPullHarness(onRefresh);

      act(() => {
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 40;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("touchend"));
      });

      expect(onRefresh).not.toHaveBeenCalled();

      await waitForMs(PULL_RELEASE_MS);

      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET - 44);

      unmount();
    });
  });

  test("loading state does not cancel an active refresh hold", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { rerenderHarness, unmount, viewport } =
        renderPullHarness(onRefresh);

      act(() => {
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 40;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("touchend"));
      });

      await waitForMs(PULL_RELEASE_MS);

      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET - 44);

      rerenderHarness(true);

      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET - 44);
      expect(onRefresh).toHaveBeenCalledTimes(1);

      unmount();
    });
  });

  test("real Radix nesting keeps the feed wrapper unconstrained", () => {
    const onRefresh = mock(() => {});
    const { container, unmount } = renderPullHarness(onRefresh);

    const viewport = container.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    const contentWrapper = viewport?.firstElementChild as HTMLElement | null;
    const feedWrapper = contentWrapper?.firstElementChild as HTMLElement | null;
    const sentinel = feedWrapper?.firstElementChild as HTMLElement | null;

    expect(feedWrapper?.style.height ?? "").toBe("");
    expect(sentinel?.style.height).toBe(`${FEED_PULL_HEIGHT}px`);
    expect(viewport?.style.overscrollBehaviorY).toBe("contain");
    expect(viewport?.style.touchAction).toBe("pan-y");

    unmount();
  });

  test("short content still reserves enough scroll range to hide the idle sentinel", () => {
    const onRefresh = mock(() => {});
    const contentHeightRef = { current: 0 };
    const { unmount, viewport } = renderPullHarness(
      onRefresh,
      false,
      undefined,
      false,
      contentHeightRef,
    );

    expect(viewport.scrollHeight - viewport.clientHeight).toBe(
      FEED_PULL_OFFSET,
    );

    unmount();
  });

  test("touch cancel releases back to the hidden rest offset", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { unmount, viewport } = renderPullHarness(onRefresh);

      act(() => {
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 70;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("touchcancel"));
      });

      expect(viewport.scrollTop).toBe(70);

      await waitForMs(PULL_RELEASE_MS);

      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET);
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    });
  });

  test("disabled pulls never trigger refresh", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { unmount, viewport } = renderPullHarness(onRefresh, true);

      act(() => {
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 40;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("touchend"));
      });

      await waitForMs(PULL_RELEASE_MS);

      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET);
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    });
  });

  test("expand lock clears an armed pull before refresh can race through", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const lockRef = { current: false as false | number };
      const { feedWrapper, unmount, viewport } = renderPullHarness(
        onRefresh,
        false,
        lockRef,
      );
      const { result, unmount: unmountLock } = renderHook(() =>
        useFeedScrollLock(lockRef),
      );
      const article = document.createElement("article");
      article.setAttribute("data-article-key", "article-race-expand");
      viewport.getBoundingClientRect = (() =>
        createRect(100, 500)) as typeof viewport.getBoundingClientRect;
      article.getBoundingClientRect = (() =>
        createRect(180, 40)) as typeof article.getBoundingClientRect;
      viewport.append(article);

      act(() => {
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 40;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("touchend"));
        result.current.activateExpandLock("article-race-expand");
      });

      await waitForMs(16);

      expect(lockRef.current).toBe(-1);
      expect(feedWrapper.dataset.pulling).toBe("false");
      expect(feedWrapper.dataset.ready).toBe("false");

      await waitForMs(260);
      expect(onRefresh).not.toHaveBeenCalled();

      act(() => {
        article.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED),
        );
      });

      await waitForMs(80);

      expect(lockRef.current).toBe(false);
      expect(viewport.scrollTop).toBe(40);

      unmountLock();
      unmount();
    });
  });

  test("collapse lock clears an armed pull without later snapping back", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const lockRef = { current: false as false | number };
      const { feedWrapper, unmount, viewport } = renderPullHarness(
        onRefresh,
        false,
        lockRef,
      );
      const { result, unmount: unmountLock } = renderHook(() =>
        useFeedScrollLock(lockRef),
      );

      act(() => {
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 40;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("touchend"));
        result.current.activateCollapseLock(viewport, 220);
      });

      await waitForMs(16);

      expect(lockRef.current).toBe(220);
      expect(viewport.scrollTop).toBe(220);
      expect(feedWrapper.dataset.pulling).toBe("false");
      expect(feedWrapper.dataset.ready).toBe("false");

      await waitForMs(420);
      expect(lockRef.current).toBe(false);
      expect(viewport.scrollTop).toBe(220);
      expect(onRefresh).not.toHaveBeenCalled();

      unmountLock();
      unmount();
    });
  });

  test("touch release commits an armed sentinel even without an active touch-pull flag", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { feedWrapper, unmount, viewport } = renderPullHarness(onRefresh);

      act(() => {
        viewport.scrollTop = 40;
        viewport.dispatchEvent(new Event("scroll"));
      });

      expect(feedWrapper.dataset.pulling).toBe("true");
      expect(feedWrapper.dataset.ready).toBe("true");

      act(() => {
        viewport.dispatchEvent(new Event("touchend"));
      });

      await waitForMs(PULL_RELEASE_MS);

      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET - 44);
      expect(feedWrapper.dataset.pulling).toBe("true");
      expect(feedWrapper.dataset.ready).toBe("true");

      unmount();
    });
  });

  test("wheel or trackpad upward scroll commits once scrolling ends and input settles", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { unmount, viewport } = renderPullHarness(onRefresh);
      const wheelEvent = new Event("wheel");
      Object.defineProperty(wheelEvent, "deltaY", {
        configurable: true,
        value: -120,
      });

      act(() => {
        viewport.dispatchEvent(wheelEvent);
        viewport.scrollTop = 40;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("scrollend"));
      });

      await waitForMs(WHEEL_RELEASE_MS);

      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET - 44);

      unmount();
    });
  });

  test("wheel pull can proxy into the hidden sentinel without native scroll events", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { unmount, viewport } = renderPullHarness(onRefresh);
      const wheelEvent = new Event("wheel");
      Object.defineProperty(wheelEvent, "deltaY", {
        configurable: true,
        value: -120,
      });

      act(() => {
        viewport.scrollTop = FEED_PULL_OFFSET;
        viewport.dispatchEvent(wheelEvent);
      });

      expect(onRefresh).not.toHaveBeenCalled();
      expect(viewport.scrollTop).toBeLessThan(FEED_PULL_OFFSET);

      await waitForMs(WHEEL_RELEASE_MS);

      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET - 44);

      unmount();
    });
  });

  test("touch scrolling from below the top does not enter pull refresh or jump back", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { unmount, viewport } = renderPullHarness(onRefresh);

      act(() => {
        viewport.scrollTop = 260;
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 100;
        viewport.dispatchEvent(new Event("scroll"));
      });

      expect(viewport.scrollTop).toBe(100);

      act(() => {
        viewport.dispatchEvent(new Event("touchend"));
      });

      await waitForMs(250);
      expect(viewport.scrollTop).toBe(100);
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    });
  });

  test("scrollend after ordinary touch scrolling near the top does not snap back", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { unmount, viewport } = renderPullHarness(onRefresh);

      act(() => {
        viewport.scrollTop = 260;
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 100;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("touchend"));
        viewport.dispatchEvent(new Event("scrollend"));
      });

      await waitForMs(250);
      expect(viewport.scrollTop).toBe(100);
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    });
  });

  test("touch scrolling from the rest position into the feed does not arm pull refresh", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { unmount, viewport } = renderPullHarness(onRefresh);

      act(() => {
        viewport.scrollTop = FEED_PULL_OFFSET;
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 220;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("touchend"));
      });

      await waitForMs(250);
      expect(viewport.scrollTop).toBe(220);
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    });
  });

  test("small near-top touch drags do not arm pull refresh or snap back", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { unmount, viewport } = renderPullHarness(onRefresh);

      act(() => {
        viewport.scrollTop = FEED_PULL_OFFSET;
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = FEED_PULL_OFFSET - 10;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("touchend"));
        viewport.dispatchEvent(new Event("scrollend"));
      });

      await waitForMs(250);
      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET - 10);
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    });
  });

  test("touch pull frames stay monotonic while the sentinel arms", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { feedWrapper, unmount, viewport } = renderPullHarness(onRefresh);
      const frameSamples: {
        pulling: string;
        ready: string;
        scrollTop: number;
      }[] = [];

      act(() => {
        viewport.scrollTop = FEED_PULL_OFFSET;
        viewport.dispatchEvent(new Event("touchstart"));
      });

      for (const nextScrollTop of [98, 86, 74, 40]) {
        act(() => {
          viewport.scrollTop = nextScrollTop;
          viewport.dispatchEvent(new Event("scroll"));
        });

        await waitForMs(16);
        frameSamples.push({
          pulling: feedWrapper.dataset.pulling ?? "",
          ready: feedWrapper.dataset.ready ?? "",
          scrollTop: viewport.scrollTop,
        });
      }

      expect(frameSamples.map((sample) => sample.scrollTop)).toEqual([
        98,
        86,
        74,
        40,
      ]);
      expect(frameSamples.map((sample) => sample.pulling)).toEqual([
        "false",
        "true",
        "true",
        "true",
      ]);
      expect(frameSamples.at(-1)?.ready).toBe("true");
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    });
  });

  test("over-pulling past the top does not force the viewport back against the active touch drag", async () => {
    const onRefresh = mock(() => {});
    const { unmount, viewport } = renderPullHarness(
      onRefresh,
      false,
      undefined,
      true,
    );

    act(() => {
      viewport.scrollTop = FEED_PULL_OFFSET;
      viewport.dispatchEvent(new Event("touchstart"));
      viewport.scrollTop = -14;
      viewport.dispatchEvent(new Event("scroll"));
    });

    expect(viewport.scrollTop).toBe(-14);
    expect(onRefresh).not.toHaveBeenCalled();

    unmount();
  });

  test("resize after touch scrolling near the top does not snap back to the rest offset", async () => {
    const originalResizeObserver = global.ResizeObserver;
    let resizeCallback: (() => void) | undefined;

    class ResizeObserverMock {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }

      disconnect() {}

      observe() {}
    }

    global.ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;

    try {
      await withFakeTimers(async () => {
        const onRefresh = mock(() => {});
        const { unmount, viewport } = renderPullHarness(onRefresh);

        act(() => {
          viewport.scrollTop = 150;
          viewport.dispatchEvent(new Event("touchstart"));
          viewport.scrollTop = 100;
          viewport.dispatchEvent(new Event("scroll"));
          viewport.dispatchEvent(new Event("touchend"));
        });

        act(() => {
          resizeCallback?.();
        });

        await waitForMs(PULL_RELEASE_MS);
        expect(viewport.scrollTop).toBe(100);
        expect(onRefresh).not.toHaveBeenCalled();

        unmount();
      });
    } finally {
      global.ResizeObserver = originalResizeObserver;
    }
  });

  test("content-height changes clear stale armed pull state while idle", async () => {
    const originalResizeObserver = global.ResizeObserver;
    const contentHeightRef = { current: 320 };
    let resizeCallback: (() => void) | undefined;

    class ResizeObserverMock {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }

      disconnect() {}

      observe() {}
    }

    global.ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;

    try {
      const onRefresh = mock(() => {});
      const { feedWrapper, unmount, viewport } = renderPullHarness(
        onRefresh,
        false,
        undefined,
        false,
        contentHeightRef,
      );

      act(() => {
        viewport.scrollTop = 40;
        viewport.dispatchEvent(new Event("scroll"));
      });

      expect(feedWrapper.dataset.pulling).toBe("true");
      expect(feedWrapper.dataset.ready).toBe("true");

      act(() => {
        contentHeightRef.current = 0;
        resizeCallback?.();
      });

      await Promise.resolve();

      expect(feedWrapper.dataset.pulling).toBe("false");
      expect(feedWrapper.dataset.ready).toBe("false");
      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET);
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    } finally {
      global.ResizeObserver = originalResizeObserver;
    }
  });

  test("cold-start top-edge exposure restores the hidden rest offset without refreshing", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const { feedWrapper, unmount, viewport } = renderPullHarness(onRefresh);

      act(() => {
        viewport.scrollTop = 0;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("scrollend"));
      });

      await waitForMs(PULL_RELEASE_MS);

      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET);
      expect(feedWrapper.dataset.pulling).toBe("false");
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    });
  });

  test("touch release does not override an active scroll lock", async () => {
    await withFakeTimers(async () => {
      const onRefresh = mock(() => {});
      const lockRef = { current: 180 as false | number };
      const { unmount, viewport } = renderPullHarness(
        onRefresh,
        false,
        lockRef,
      );

      act(() => {
        viewport.dispatchEvent(new Event("touchstart"));
        viewport.scrollTop = 40;
        viewport.dispatchEvent(new Event("touchend"));
      });

      await waitForMs(PULL_RELEASE_MS);
      expect(viewport.scrollTop).toBe(40);
      expect(onRefresh).not.toHaveBeenCalled();

      unmount();
    });
  });
});

describe("useFeedScrollLock", () => {
  test("collapse and expand locks set and release the shared target", async () => {
    const lockRef = { current: false as false | number };
    const { result } = renderHook(() => useFeedScrollLock(lockRef));
    const viewport = document.createElement("div");
    viewport.scrollTop = 220;

    act(() => {
      result.current.activateCollapseLock(viewport, 220);
    });
    expect(lockRef.current).toBe(220);

    act(() => {
      result.current.cancelLock();
    });
    expect(lockRef.current).toBe(false);
  });

  test("collapse lock release follows the CSS motion duration", async () => {
    await withFakeTimers(async () => {
      const lockRef = { current: false as false | number };
      const { result, unmount } = renderHook(() => useFeedScrollLock(lockRef));
      const viewport = document.createElement("div");
      const originalGetComputedStyle =
        globalThis.getComputedStyle ?? window.getComputedStyle.bind(window);
      try {
        globalThis.getComputedStyle = ((element: Element) => {
          const styles = originalGetComputedStyle(element);
          return {
            ...styles,
            getPropertyValue(name: string) {
              if (name === "--motion-duration-expand") return "360ms";
              return styles.getPropertyValue(name);
            },
          } as CSSStyleDeclaration;
        }) as typeof getComputedStyle;

        act(() => {
          result.current.activateCollapseLock(viewport, 180);
        });

        await waitForMs(getScrollLockReleaseMs() - 110);
        expect(lockRef.current).toBe(180);

        await waitForMs(140);
        expect(lockRef.current).toBe(false);
      } finally {
        globalThis.getComputedStyle = originalGetComputedStyle;
        unmount();
      }
    });
  });

  test("collapse lock without a saved target uses the hidden rest offset", () => {
    const lockRef = { current: false as false | number };
    const { result, unmount } = renderHook(() => useFeedScrollLock(lockRef));
    const viewport = document.createElement("div");
    viewport.scrollTop = 260;

    act(() => {
      result.current.activateCollapseLock(viewport, null);
    });

    expect(lockRef.current).toBe(FEED_PULL_OFFSET);
    expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET);

    unmount();
  });

  test("collapse lock re-applies the saved target while layout is still settling", async () => {
    await withFakeTimers(async () => {
      const lockRef = { current: false as false | number };
      const { result, unmount } = renderHook(() => useFeedScrollLock(lockRef));
      const viewport = document.createElement("div");
      viewport.scrollTop = 260;

      act(() => {
        result.current.activateCollapseLock(viewport, 220);
      });

      expect(viewport.scrollTop).toBe(220);

      act(() => {
        viewport.scrollTop = 164;
      });

      await waitForMs(32);

      expect(viewport.scrollTop).toBe(220);
      expect(lockRef.current).toBe(220);

      unmount();
    });
  });

  test("expand lock releases after the article expand-settled event", async () => {
    await withFakeTimers(async () => {
      const lockRef = { current: false as false | number };
      const { result, unmount } = renderHook(() => useFeedScrollLock(lockRef));
      const viewport = document.createElement("div");
      viewport.setAttribute("data-radix-scroll-area-viewport", "");
      viewport.scrollTop = 260;
      const article = document.createElement("article");
      article.setAttribute("data-article-key", "article-1");
      viewport.append(article);
      document.body.append(viewport);

      act(() => {
        result.current.activateExpandLock("article-1");
      });

      expect(lockRef.current).toBe(-1);
      expect(result.current.preExpandViewport.current).toBe(viewport);
      expect(result.current.preExpandScrollTop.current).toBe(260);

      act(() => {
        article.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED),
        );
      });

      await waitForMs(80);

      expect(lockRef.current).toBe(false);

      unmount();
    });
  });

  test("expand lock scrolls the article top into view when it starts below the viewport", () => {
    const lockRef = { current: false as false | number };
    const { result, unmount } = renderHook(() => useFeedScrollLock(lockRef));
    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    viewport.scrollTop = 260;
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      get: () => 2000,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      get: () => 500,
    });
    viewport.getBoundingClientRect = (() =>
      createRect(100, 500)) as typeof viewport.getBoundingClientRect;

    const article = document.createElement("article");
    article.setAttribute("data-article-key", "article-4");
    article.getBoundingClientRect = (() =>
      createRect(760, 40)) as typeof article.getBoundingClientRect;
    viewport.append(article);
    document.body.append(viewport);

    act(() => {
      result.current.activateExpandLock("article-4");
    });

    expect(result.current.preExpandScrollTop.current).toBe(260);
    expect(viewport.scrollTop).toBe(920);
    expect(lockRef.current).toBe(-1);

    unmount();
  });

  test("expand lock keeps scroll position when the article top is already visible", () => {
    const lockRef = { current: false as false | number };
    const { result, unmount } = renderHook(() => useFeedScrollLock(lockRef));
    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    viewport.scrollTop = 260;
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      get: () => 2000,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      get: () => 500,
    });
    viewport.getBoundingClientRect = (() =>
      createRect(100, 500)) as typeof viewport.getBoundingClientRect;

    const article = document.createElement("article");
    article.setAttribute("data-article-key", "article-5");
    article.getBoundingClientRect = (() =>
      createRect(260, 40)) as typeof article.getBoundingClientRect;
    viewport.append(article);
    document.body.append(viewport);

    act(() => {
      result.current.activateExpandLock("article-5");
    });

    expect(viewport.scrollTop).toBe(260);
    expect(lockRef.current).toBe(-1);

    unmount();
  });

  test("expand lock preserves a pre-click snapshot when scroll shifts before toggle", () => {
    const lockRef = { current: false as false | number };
    const { result, unmount } = renderHook(() => useFeedScrollLock(lockRef));
    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    viewport.scrollTop = 820;
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      get: () => 2400,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      get: () => 500,
    });
    viewport.getBoundingClientRect = (() =>
      createRect(100, 500)) as typeof viewport.getBoundingClientRect;

    const article = document.createElement("article");
    article.setAttribute("data-article-key", "article-6");
    article.getBoundingClientRect = (() =>
      createRect(-120, 80)) as typeof article.getBoundingClientRect;
    viewport.append(article);
    document.body.append(viewport);

    act(() => {
      result.current.capturePreExpandSnapshot("article-6");
    });

    viewport.scrollTop = 240;

    act(() => {
      result.current.activateExpandLock("article-6");
    });

    expect(result.current.preExpandScrollTop.current).toBe(820);
    expect(
      JSON.parse(
        window.sessionStorage.getItem("librerss:article-pre-expand-scroll") ??
          "null",
      ),
    ).toEqual({ articleKey: "article-6", scrollTop: 820 });

    unmount();
  });

  test("unmount cleanup releases an active expand lock", () => {
    const lockRef = { current: false as false | number };
    const { result, unmount } = renderHook(() => useFeedScrollLock(lockRef));
    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    const article = document.createElement("article");
    article.setAttribute("data-article-key", "article-2");
    viewport.append(article);
    document.body.append(viewport);

    act(() => {
      result.current.activateExpandLock("article-2");
    });

    expect(lockRef.current).toBe(-1);

    unmount();

    expect(lockRef.current).toBe(false);
  });

  test("collapse can recover the pre-expand target from session storage", () => {
    const lockRef = { current: false as false | number };
    const firstHook = renderHook(() => useFeedScrollLock(lockRef));
    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    viewport.scrollTop = 340;
    const article = document.createElement("article");
    article.setAttribute("data-article-key", "article-3");
    viewport.append(article);
    document.body.append(viewport);

    act(() => {
      firstHook.result.current.activateExpandLock("article-3");
    });

    firstHook.unmount();

    const secondHook = renderHook(() => useFeedScrollLock(lockRef));
    const restoreTarget =
      secondHook.result.current.getCollapseRestoreTarget("article-3");

    expect(restoreTarget.scrollTop).toBe(340);
    expect(restoreTarget.viewport).toBe(viewport);

    act(() => {
      secondHook.result.current.activateCollapseLock(
        restoreTarget.viewport,
        restoreTarget.scrollTop,
      );
    });

    expect(viewport.scrollTop).toBe(340);
    expect(
      window.sessionStorage.getItem("librerss:article-pre-expand-scroll"),
    ).toBeNull();

    secondHook.unmount();
  });
});
