/**
 * Tests for the FeedListRow entrance animation state machine.
 *
 * Verifies that:
 *   - Initial entering state keeps the row's natural height and shows a skeleton backing layer.
 *   - After a requestAnimationFrame tick the hydrated article fades in over the skeleton layer.
 *   - The `data-article-entering` attribute is present while the transition runs.
 *   - `onEnteringDone` fires after the animation completes.
 *   - The component resets cleanly when `isEntering` goes back to false.
 */

import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { FEED_ROW_COLLAPSE_FLOOR_PX } from "@/app/dashboard/components/feed-config";
import * as realFeedListRowModule from "@/app/dashboard/components/feed-view/FeedListRow";

import {
  FeedListResizeObserverMock,
  installFeedListDomMocks,
  restoreFeedListDomMocks,
} from "./feed-list-test-utils";

let FeedListRow: typeof realFeedListRowModule.FeedListRow;

// ---------------------------------------------------------------------------

beforeEach(() => {
  FeedListRow = realFeedListRowModule.FeedListRow;
  installFeedListDomMocks();
});

afterEach(() => {
  mock.restore();
  restoreFeedListDomMocks();
});

/**
 * Flushes work scheduled via setTimeout(cb, 0) — which is what the
 * installFeedListDomMocks RAF shim produces — as well as any state
 * updates triggered by those callbacks.
 */
async function flushAsyncWork() {
  await act(async () => {
    for (let i = 0; i < 3; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  });
}

// ---------------------------------------------------------------------------

describe("FeedListRow entering animation", () => {
  test("expanded rows drop layout containment so sticky headers can anchor", () => {
    const { container } = render(
      <FeedListRow
        articleKey="https://example.com/sticky"
        hasTrailingGap={false}
        isExpanded={true}
        removalAnimationMode={null}
      >
        <article data-article-key="https://example.com/sticky">content</article>
      </FeedListRow>,
    );

    const outer = container.firstElementChild as HTMLDivElement;

    expect(outer.style.contain).toBe("style");
  });

  test("initial entering state keeps layout visible behind a skeleton layer", () => {
    const { container } = render(
      <FeedListRow
        articleKey="https://example.com/a"
        hasTrailingGap={false}
        isEntering={true}
        removalAnimationMode={null}
      >
        <article data-article-key="https://example.com/a">content</article>
      </FeedListRow>,
    );

    const outer = container.firstElementChild as HTMLDivElement;
    const inner = outer?.firstElementChild as HTMLDivElement;
    const body = inner?.lastElementChild as HTMLDivElement;

    expect(Number(outer?.style.opacity)).toBe(1);
    expect(inner?.style.maxHeight).toBe("");
    expect(body?.style.opacity).toBe("0");
    expect(
      container.querySelector('[data-feed-row-enter-skeleton="true"]'),
    ).not.toBeNull();
  });

  test("after RAF the hydrated article fades over the skeleton layer", async () => {
    const { container } = render(
      <FeedListRow
        articleKey="https://example.com/b"
        hasTrailingGap={false}
        isEntering={true}
        removalAnimationMode={null}
      >
        <article data-article-key="https://example.com/b">content</article>
      </FeedListRow>,
    );

    const outer = container.firstElementChild as HTMLDivElement;
    const inner = outer?.firstElementChild as HTMLDivElement;
    const body = inner?.lastElementChild as HTMLDivElement;

    await flushAsyncWork();

    expect(Number(outer?.style.opacity)).toBe(1);
    expect(inner?.style.maxHeight).toBe("");
    expect(body?.style.opacity).toBe("1");
    expect(body?.style.transition).toContain("opacity");
    expect(
      container.querySelector('[data-feed-row-enter-skeleton="true"]'),
    ).not.toBeNull();
  });

  test("data-article-entering attribute is set on outer div during animation", async () => {
    const { container } = render(
      <FeedListRow
        articleKey="https://example.com/c"
        hasTrailingGap={false}
        isEntering={true}
        removalAnimationMode={null}
      >
        <article data-article-key="https://example.com/c">content</article>
      </FeedListRow>,
    );

    const outer = container.firstElementChild as HTMLDivElement;

    // After RAF the "animating" useEffect runs and sets the attribute.
    await flushAsyncWork();

    expect(outer?.dataset.articleEntering).toBe("true");
  });

  test("onEnteringDone is called after the animation timeout completes", async () => {
    const onEnteringDone = mock((_key: string) => {});

    render(
      <FeedListRow
        articleKey="https://example.com/d"
        hasTrailingGap={false}
        isEntering={true}
        onEnteringDone={onEnteringDone}
        removalAnimationMode={null}
      >
        <article data-article-key="https://example.com/d">content</article>
      </FeedListRow>,
    );

    // Wait for RAF + cleanup setTimeout (~510 ms real time) to fire.
    await waitFor(
      () => {
        expect(onEnteringDone).toHaveBeenCalledWith("https://example.com/d");
      },
      { timeout: 700 },
    );
  });

  test("entering animation is skipped when isCollapsing is simultaneously true", () => {
    const { container } = render(
      <FeedListRow
        articleKey="https://example.com/e"
        hasTrailingGap={false}
        isEntering={true}
        removalAnimationMode="collapse"
      >
        <article data-article-key="https://example.com/e">content</article>
      </FeedListRow>,
    );

    const outer = container.firstElementChild as HTMLDivElement;
    // Collapse takes priority; pre-commitment opacity should be 1.
    expect(Number(outer?.style.opacity)).toBe(1);
  });

  test("renders normally (no entering styles) when isEntering is false", () => {
    const { container } = render(
      <FeedListRow
        articleKey="https://example.com/f"
        hasTrailingGap={true}
        isEntering={false}
        removalAnimationMode={null}
      >
        <article data-article-key="https://example.com/f">content</article>
      </FeedListRow>,
    );

    const outer = container.firstElementChild as HTMLDivElement;
    const inner = outer?.firstElementChild as HTMLDivElement;

    // No entering classes or forced styles.
    expect(Number(outer?.style.opacity)).toBe(1);
    expect(inner?.style.maxHeight).toBe("");
  });

  test("collapse animation commits the row exit styles after the frame", async () => {
    const { container } = render(
      <FeedListRow
        articleKey="https://example.com/g"
        hasTrailingGap={true}
        isEntering={false}
        removalAnimationMode="collapse"
      >
        <article data-article-key="https://example.com/g">content</article>
      </FeedListRow>,
    );

    const outer = container.firstElementChild as HTMLDivElement;
    const inner = outer?.firstElementChild as HTMLDivElement;

    expect(outer?.style.willChange).toBe("margin-bottom, opacity");
    expect(inner?.style.willChange).toBe("max-height, transform");

    await flushAsyncWork();

    expect(outer?.dataset.feedRowState).toBe("collapsing");
    expect(outer?.style.marginBottom).toBe(`${-FEED_ROW_COLLAPSE_FLOOR_PX}px`);
    expect(Number(outer?.style.opacity)).toBe(0);
    expect(inner?.style.maxHeight).toBe(`${FEED_ROW_COLLAPSE_FLOOR_PX}px`);
    expect(inner?.style.minHeight).toBe(`${FEED_ROW_COLLAPSE_FLOOR_PX}px`);
    expect(inner?.style.overflow).toBe("hidden");
    expect(inner?.style.pointerEvents).toBe("none");
  });

  test("swipe-read collapse keeps opacity and translates the row body", async () => {
    const { container, rerender } = render(
      <FeedListRow
        articleKey="https://example.com/h"
        hasTrailingGap={false}
        isEntering={false}
        removalAnimationMode="swipe-read"
      >
        <article data-article-key="https://example.com/h">content</article>
      </FeedListRow>,
    );

    const outer = container.firstElementChild as HTMLDivElement;
    const inner = outer?.firstElementChild as HTMLDivElement;

    await flushAsyncWork();

    expect(Number(outer?.style.opacity)).toBe(1);
    expect(inner?.style.transform).toBe("translate3d(2.5rem, 0, 0)");

    rerender(
      <FeedListRow
        articleKey="https://example.com/h"
        hasTrailingGap={false}
        isEntering={false}
        removalAnimationMode={null}
      >
        <article data-article-key="https://example.com/h">content</article>
      </FeedListRow>,
    );

    expect(outer?.style.willChange).toBe("");
    expect(inner?.style.willChange).toBe("");
  });

  test("cancels the pending enter frame and disconnects the resize observer on cleanup", async () => {
    const resizeDisconnect = mock(() => {});
    const originalDisconnect = FeedListResizeObserverMock.prototype.disconnect;
    FeedListResizeObserverMock.prototype.disconnect = resizeDisconnect;
    const onEnteringDone = mock((_key: string) => {});

    try {
      const { rerender, unmount } = render(
        <FeedListRow
          articleKey="https://example.com/i"
          hasTrailingGap={false}
          isEntering={true}
          onEnteringDone={onEnteringDone}
          removalAnimationMode={null}
        >
          <article data-article-key="https://example.com/i">content</article>
        </FeedListRow>,
      );

      rerender(
        <FeedListRow
          articleKey="https://example.com/i"
          hasTrailingGap={false}
          isEntering={false}
          onEnteringDone={onEnteringDone}
          removalAnimationMode={null}
        >
          <article data-article-key="https://example.com/i">content</article>
        </FeedListRow>,
      );

      await flushAsyncWork();
      expect(onEnteringDone).not.toHaveBeenCalled();

      unmount();
      expect(resizeDisconnect).toHaveBeenCalled();
    } finally {
      FeedListResizeObserverMock.prototype.disconnect = originalDisconnect;
    }
  });
});
