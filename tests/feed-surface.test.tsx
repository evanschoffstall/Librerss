import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useRef } from "react";

import {
  FEED_PULL_HEIGHT,
  FEED_PULL_OFFSET,
  useFeedPullRefresh,
  useFeedScrollLock,
} from "@/app/dashboard/hooks/useFeedSurface";

beforeEach(() => {
  mock.restore();
  window.sessionStorage.clear();
});

afterEach(() => {
  mock.restore();
  window.sessionStorage.clear();
});

const waitForMs = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

function renderPullHarness(onRefresh: () => void, disabled = false) {
  function Harness({ isDisabled }: { isDisabled: boolean }) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const pull = useFeedPullRefresh(rootRef, onRefresh, isDisabled);

    const setViewportRef = useCallback((node: HTMLDivElement | null) => {
      if (!node || node.dataset.ready === "true") return;
      let top = 0;
      Object.defineProperty(node, "scrollTop", {
        configurable: true,
        get: () => top,
        set: (value: number) => {
          top = Math.max(0, value);
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
          return 1200 + FEED_PULL_HEIGHT + pad;
        },
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
            <div ref={setSentinelRef} />
            <div>content</div>
          </div>
        </div>
      </div>
    );
  }

  const rendered = render(<Harness isDisabled={disabled} />);
  const viewport = rendered.container.querySelector<HTMLElement>(
    "[data-radix-scroll-area-viewport]",
  );
  if (!viewport) throw new Error("missing viewport");
  return {
    ...rendered,
    rerenderHarness(nextDisabled: boolean) {
      rendered.rerender(<Harness isDisabled={nextDisabled} />);
    },
    viewport,
  };
}

describe("useFeedPullRefresh", () => {
  test("resets shallow pulls on scrollend", async () => {
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

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET);
      expect(onRefresh).not.toHaveBeenCalled();
    });

    unmount();
  });

  test("committed pulls trigger refresh and hold position", async () => {
    const onRefresh = mock(() => {});
    const { unmount, viewport } = renderPullHarness(onRefresh);

    act(() => {
      viewport.dispatchEvent(new Event("touchstart"));
      viewport.scrollTop = 40;
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("touchend"));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET - 44);

    unmount();
  });

  test("loading state does not cancel an active refresh hold", async () => {
    const onRefresh = mock(() => {});
    const { rerenderHarness, unmount, viewport } = renderPullHarness(onRefresh);

    act(() => {
      viewport.dispatchEvent(new Event("touchstart"));
      viewport.scrollTop = 40;
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("touchend"));
    });

    expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET - 44);

    rerenderHarness(true);

    expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET - 44);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    unmount();
  });

  test("touch cancel releases back to the hidden rest offset", async () => {
    const onRefresh = mock(() => {});
    const { unmount, viewport } = renderPullHarness(onRefresh);

    act(() => {
      viewport.dispatchEvent(new Event("touchstart"));
      viewport.scrollTop = 70;
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("touchcancel"));
    });

    expect(viewport.scrollTop).toBe(70);

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET);
      expect(onRefresh).not.toHaveBeenCalled();
    });

    unmount();
  });

  test("disabled pulls never trigger refresh", async () => {
    const onRefresh = mock(() => {});
    const { unmount, viewport } = renderPullHarness(onRefresh, true);

    act(() => {
      viewport.dispatchEvent(new Event("touchstart"));
      viewport.scrollTop = 40;
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("touchend"));
    });

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(FEED_PULL_OFFSET);
      expect(onRefresh).not.toHaveBeenCalled();
    });

    unmount();
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

      await waitForMs(330);
      expect(lockRef.current).toBe(180);

      await waitForMs(140);
      expect(lockRef.current).toBe(false);
    } finally {
      globalThis.getComputedStyle = originalGetComputedStyle;
      unmount();
    }
  });

  test("expand lock releases after the max-height transition ends", async () => {
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
        new TransitionEvent("transitionend", { propertyName: "max-height" }),
      );
    });

    await waitFor(() => {
      expect(lockRef.current).toBe(false);
    });

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
