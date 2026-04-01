/**
 * Tests for the FeedListRow entrance animation state machine.
 *
 * Verifies that:
 *   - Initial entering state collapses the row to zero height / zero opacity.
 *   - After a requestAnimationFrame tick the row transitions to its full height.
 *   - The `data-article-entering` attribute is present while the transition runs.
 *   - `onEnteringDone` fires after the animation completes.
 *   - The component resets cleanly when `isEntering` goes back to false.
 */

import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";

import * as realFeedListRowModule from "@/app/dashboard/components/feed/FeedListRow";

import {
  installFeedListDomMocks,
  restoreFeedListDomMocks,
} from "./feed-list-test-utils";

// Updated in beforeEach after restoring the real module to the cache.
let FeedListRow: typeof realFeedListRowModule.FeedListRow;

// ---------------------------------------------------------------------------

beforeEach(() => {
  // Restore the real FeedListRow in the Bun module cache. Another test file
  // (feed-list-render-fanout) mocks FeedListRow via a relative path and can
  // leave the stub in the cache when it shares a Bun worker with this file.
  mock.module("@/app/dashboard/components/feed/FeedListRow", () => realFeedListRowModule);
  mock.module("../src/app/dashboard/components/feed/FeedListRow", () => realFeedListRowModule);
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
  test("initial entering state: outer opacity 0, inner maxHeight 0", () => {
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

    // Initial entering phase: invisible and collapsed before the RAF fires.
    expect(Number(outer?.style.opacity)).toBe(0);
    // React serialises numeric 0 without a unit.
    expect(inner?.style.maxHeight).toBe("0");
  });

  test("after RAF the row transitions to full height", async () => {
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

    // Flush the RAF (scheduled as setTimeout 0 by installFeedListDomMocks).
    await flushAsyncWork();

    // Animating phase: opacity restored, maxHeight is content height + buffer.
    expect(Number(outer?.style.opacity)).toBe(1);
    // maxHeight during animating = scrollHeight + 32; scrollHeight=0 in happy-dom.
    expect(inner?.style.maxHeight).toBe("32px");
    expect(inner?.style.transition).toContain("max-height");
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
});
