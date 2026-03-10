import { usePullDownToRefresh } from "@/app/dashboard/hooks/usePullDownToRefresh";
import {
  SENTINEL_HEIGHT,
  SENTINEL_SCROLL_OFFSET,
} from "@/app/dashboard/hooks/useSentinelLayout";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { useCallback, useEffect, useRef } from "react";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

interface PullSnapshot {
  pulling: boolean;
  readyToRefresh: boolean;
}

function createHarness(options: {
  disabled?: boolean;
  onRefresh: () => void;
  onState: (snapshot: PullSnapshot) => void;
}) {
  const contentHeight = 1200;
  const disabled = options.disabled ?? false;
  const onRefresh = options.onRefresh;
  const onState = options.onState;

  function Harness() {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const sentinelNodeRef = useRef<HTMLDivElement | null>(null);
    const viewportScrollTopRef = useRef(0);
    const onStateRef = useRef(onState);
    onStateRef.current = onState;
    const pull = usePullDownToRefresh(rootRef, onRefresh, disabled);

    const setViewportRef = useCallback((node: HTMLDivElement | null) => {
      if (!node) return;
      if (node.dataset.pullHarnessReady === "true") return;

      Object.defineProperty(node, "clientHeight", {
        value: 600,
        configurable: true,
      });

      Object.defineProperty(node, "scrollTop", {
        get: () => viewportScrollTopRef.current,
        set: (value: number) => {
          viewportScrollTopRef.current = Math.max(0, value);
        },
        configurable: true,
      });

      Object.defineProperty(node, "scrollHeight", {
        get() {
          const wrapper = node.firstElementChild as HTMLElement | null;
          return wrapper?.offsetHeight ?? 0;
        },
        configurable: true,
      });

      node.scrollTo = ((input: ScrollToOptions | number, y?: number) => {
        const top =
          typeof input === "number"
            ? (y ?? input)
            : (input.top ?? viewportScrollTopRef.current);
        viewportScrollTopRef.current = Math.max(0, top);
      }) as typeof node.scrollTo;

      node.dataset.pullHarnessReady = "true";
      node.setAttribute("data-radix-scroll-area-viewport", "");
    }, []);

    const setWrapperRef = useCallback((node: HTMLDivElement | null) => {
      if (!node) return;
      if (node.dataset.pullHarnessReady === "true") return;
      Object.defineProperty(node, "offsetHeight", {
        get() {
          const sentinelHeight = sentinelNodeRef.current?.offsetHeight ?? 0;
          const bottomPadding =
            Number.parseFloat(node.style.paddingBottom) || 0;
          return contentHeight + sentinelHeight + bottomPadding;
        },
        configurable: true,
      });
      node.dataset.pullHarnessReady = "true";
    }, []);

    const setSentinelRef = useCallback(
      (node: HTMLDivElement | null) => {
        sentinelNodeRef.current = node;
        pull.sentinelRef.current = node;
        if (!node) return;
        if (node.dataset.pullHarnessReady === "true") return;
        Object.defineProperty(node, "offsetHeight", {
          get() {
            const styleHeight = Number.parseFloat(node.style.height);
            return Number.isNaN(styleHeight) ? SENTINEL_HEIGHT : styleHeight;
          },
          configurable: true,
        });
        node.dataset.pullHarnessReady = "true";
      },
      [pull.sentinelRef],
    );

    useEffect(() => {
      onStateRef.current({
        pulling: pull.pulling,
        readyToRefresh: pull.readyToRefresh,
      });
    }, [pull.pulling, pull.readyToRefresh]);

    return (
      <div ref={rootRef}>
        <div ref={setViewportRef}>
          <div ref={setWrapperRef}>
            <div ref={setSentinelRef} style={{ height: SENTINEL_HEIGHT }} />
            <div>content</div>
          </div>
        </div>
      </div>
    );
  }

  const rendered = render(<Harness />);
  const viewport = rendered.container.querySelector<HTMLElement>(
    "[data-radix-scroll-area-viewport]",
  );

  if (!viewport) throw new Error("viewport missing");

  return { ...rendered, viewport };
}

describe("usePullDownToRefresh", () => {
  test("allows a small faux-top stop before pull state engages", async () => {
    let latestState: PullSnapshot = { pulling: false, readyToRefresh: false };
    const onRefresh = mock(() => {});
    const { viewport } = createHarness({
      onRefresh,
      onState: (snapshot) => {
        latestState = snapshot;
      },
    });

    act(() => {
      viewport.dispatchEvent(new Event("touchstart"));
      viewport.scrollTop = SENTINEL_SCROLL_OFFSET - 8;
      viewport.dispatchEvent(new Event("scroll"));
    });

    expect(latestState).toEqual({ pulling: false, readyToRefresh: false });

    act(() => {
      viewport.dispatchEvent(new Event("touchend"));
      viewport.dispatchEvent(new Event("scrollend"));
    });

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(SENTINEL_SCROLL_OFFSET);
      expect(onRefresh).not.toHaveBeenCalled();
    });
  });

  test("does not snap back immediately on shallow touch release", async () => {
    let latestState: PullSnapshot = { pulling: false, readyToRefresh: false };
    const onRefresh = mock(() => {});
    const { viewport } = createHarness({
      onRefresh,
      onState: (snapshot) => {
        latestState = snapshot;
      },
    });

    act(() => {
      viewport.dispatchEvent(new Event("touchstart"));
      viewport.scrollTop = 70;
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(latestState).toEqual({ pulling: true, readyToRefresh: false });
    });

    act(() => {
      viewport.dispatchEvent(new Event("touchend"));
    });

    expect(viewport.scrollTop).toBe(70);
    expect(onRefresh).not.toHaveBeenCalled();

    act(() => {
      viewport.dispatchEvent(new Event("scrollend"));
    });

    await waitFor(() => {
      expect(viewport.scrollTop).toBe(SENTINEL_SCROLL_OFFSET);
      expect(latestState).toEqual({ pulling: false, readyToRefresh: false });
    });
  });

  test("refreshes immediately when release crosses the threshold", async () => {
    let latestState: PullSnapshot = { pulling: false, readyToRefresh: false };
    const onRefresh = mock(() => {});
    const { viewport } = createHarness({
      onRefresh,
      onState: (snapshot) => {
        latestState = snapshot;
      },
    });

    act(() => {
      viewport.dispatchEvent(new Event("touchstart"));
      viewport.scrollTop = 40;
      viewport.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(latestState).toEqual({ pulling: true, readyToRefresh: true });
    });

    act(() => {
      viewport.dispatchEvent(new Event("touchend"));
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(viewport.scrollTop).toBe(SENTINEL_SCROLL_OFFSET - 44);
  });

  test("falls back to timed release when scrollend does not fire", async () => {
    const onRefresh = mock(() => {});
    const { viewport } = createHarness({
      onRefresh,
      onState: () => {},
    });

    act(() => {
      viewport.dispatchEvent(new Event("touchstart"));
      viewport.scrollTop = 75;
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("touchend"));
    });

    expect(viewport.scrollTop).toBe(75);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160));
    });

    expect(viewport.scrollTop).toBe(SENTINEL_SCROLL_OFFSET);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
