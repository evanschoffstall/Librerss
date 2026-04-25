import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  SWIPE_COMMIT_SLIDE_MS,
  SWIPE_RELEASE_MS,
  SWIPE_THRESHOLD,
  type SwipePhase,
  useSwipeGesture,
} from "@/app/dashboard/dashboard-components/article-view/hooks";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

interface SwipeHarnessProps {
  direction?: "left" | "right";
  onCommit: () => void;
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean;
}

function createPointerEvent(type: string, pointerId: number) {
  return new window.PointerEvent(type, {
    bubbles: true,
    clientX: 140,
    clientY: 12,
    pointerId,
    pointerType: "touch",
  });
}

function installPointerCaptureSpies(surface: HTMLElement) {
  const setPointerCapture = mock(() => {});
  const releasePointerCapture = mock(() => {});

  Object.assign(surface, {
    hasPointerCapture: () => true,
    releasePointerCapture,
    setPointerCapture,
  });

  return { releasePointerCapture, setPointerCapture };
}

function SwipeHarness({
  direction = "right",
  onCommit,
  shouldIgnoreTarget,
}: SwipeHarnessProps) {
  const { containerRef, swipeState } = useSwipeGesture(
    direction,
    onCommit,
    false,
    shouldIgnoreTarget,
  );

  return (
    <article
      data-committed={String(swipeState.committed)}
      data-offset-x={String(swipeState.offsetX)}
      data-phase={swipeState.phase}
      data-progress={String(swipeState.progress)}
      data-testid="surface"
      ref={containerRef}
    >
      <div data-testid="ignored">
        <span data-testid="ignored-text">ignored</span>
      </div>
      <div data-testid="handle">handle</div>
    </article>
  );
}

describe("useSwipeGesture", () => {
  test("does not capture pointers that start inside ignored content", async () => {
    const onCommit = mock(() => {});
    const { getByTestId } = render(
      <SwipeHarness
        onCommit={onCommit}
        shouldIgnoreTarget={(target) =>
          target instanceof Element &&
          target.closest("[data-testid='ignored']") !== null
        }
      />,
    );

    const surface = getByTestId("surface");
    const ignoredText = getByTestId("ignored-text");
    const { setPointerCapture } = installPointerCaptureSpies(surface);

    fireEvent.pointerDown(ignoredText, {
      clientX: 20,
      clientY: 10,
      pointerId: 1,
      pointerType: "touch",
    });
    fireEvent.pointerMove(ignoredText, {
      clientX: 180,
      clientY: 10,
      pointerId: 1,
      pointerType: "touch",
    });
    fireEvent.pointerUp(ignoredText, {
      clientX: 180,
      clientY: 10,
      pointerId: 1,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(setPointerCapture).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  test("captures touch pointers and commits eligible swipes", async () => {
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);

    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    const { releasePointerCapture, setPointerCapture } =
      installPointerCaptureSpies(surface);

    fireEvent.pointerDown(handle, {
      clientX: 20,
      clientY: 10,
      pointerId: 2,
      pointerType: "touch",
    });

    expect(setPointerCapture).not.toHaveBeenCalled();

    fireEvent.pointerMove(handle, {
      clientX: 140,
      clientY: 12,
      pointerId: 2,
      pointerType: "touch",
    });
    fireEvent.pointerUp(handle, {
      clientX: 140,
      clientY: 12,
      pointerId: 2,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(setPointerCapture).toHaveBeenCalledWith(2);
      expect(releasePointerCapture).toHaveBeenCalledWith(2);
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
  });

  test("does not capture diagonal drags that still favor vertical scrolling", async () => {
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);

    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    const { releasePointerCapture, setPointerCapture } =
      installPointerCaptureSpies(surface);

    fireEvent.pointerDown(handle, {
      clientX: 20,
      clientY: 10,
      pointerId: 5,
      pointerType: "touch",
    });
    fireEvent.pointerMove(handle, {
      clientX: 74,
      clientY: 86,
      pointerId: 5,
      pointerType: "touch",
    });
    fireEvent.pointerUp(handle, {
      clientX: 74,
      clientY: 86,
      pointerId: 5,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(setPointerCapture).not.toHaveBeenCalled();
      expect(releasePointerCapture).not.toHaveBeenCalled();
      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  test("commits the swipe when pointer capture is unavailable", async () => {
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);

    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    const setPointerCapture = mock(() => {
      throw new DOMException("No active pointer", "NotFoundError");
    });

    Object.assign(surface, {
      hasPointerCapture: () => false,
      releasePointerCapture: mock(() => {}),
      setPointerCapture,
    });

    fireEvent.pointerDown(handle, {
      clientX: 20,
      clientY: 10,
      pointerId: 3,
      pointerType: "touch",
    });
    fireEvent.pointerMove(handle, {
      clientX: 140,
      clientY: 12,
      pointerId: 3,
      pointerType: "touch",
    });
    fireEvent.pointerUp(handle, {
      clientX: 140,
      clientY: 12,
      pointerId: 3,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(setPointerCapture).toHaveBeenCalledWith(3);
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
  });

  test("commits when lostpointercapture fires before pointerup", async () => {
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);

    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    const { releasePointerCapture, setPointerCapture } =
      installPointerCaptureSpies(surface);

    fireEvent.pointerDown(handle, {
      clientX: 20,
      clientY: 10,
      pointerId: 4,
      pointerType: "touch",
    });
    fireEvent.pointerMove(handle, {
      clientX: 140,
      clientY: 12,
      pointerId: 4,
      pointerType: "touch",
    });
    fireEvent(surface, createPointerEvent("lostpointercapture", 4));
    fireEvent.pointerUp(handle, {
      clientX: 140,
      clientY: 12,
      pointerId: 4,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(setPointerCapture).toHaveBeenCalledWith(4);
      expect(releasePointerCapture).not.toHaveBeenCalled();
      expect(onCommit).toHaveBeenCalledTimes(1);
    });
  });

  test("enters releasing phase on non-committed release and settles to idle", async () => {
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);
    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    installPointerCaptureSpies(surface);

    fireEvent.pointerDown(handle, {
      clientX: 20,
      clientY: 10,
      pointerId: 10,
      pointerType: "touch",
    });
    // Move just 40px rightward – below the 30% threshold on a 300px-wide element.
    fireEvent.pointerMove(handle, {
      clientX: 60,
      clientY: 11,
      pointerId: 10,
      pointerType: "touch",
    });
    fireEvent.pointerUp(handle, {
      clientX: 60,
      clientY: 11,
      pointerId: 10,
      pointerType: "touch",
    });

    await waitFor(() => {
      const phase = surface.getAttribute("data-phase") as SwipePhase;
      expect(phase).toBe("releasing");
      expect(surface.getAttribute("data-offset-x")).toBe("0");
      expect(onCommit).not.toHaveBeenCalled();
    });

    // After the release animation timer fires, phase settles to idle.
    await waitFor(
      () => {
        expect(surface.getAttribute("data-phase")).toBe("idle");
      },
      { timeout: SWIPE_RELEASE_MS + 200 },
    );
  });

  test("enters committing phase on committed swipe and settles to idle", async () => {
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);
    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    installPointerCaptureSpies(surface);

    fireEvent.pointerDown(handle, {
      clientX: 20,
      clientY: 10,
      pointerId: 11,
      pointerType: "touch",
    });
    fireEvent.pointerMove(handle, {
      clientX: 200,
      clientY: 12,
      pointerId: 11,
      pointerType: "touch",
    });
    fireEvent.pointerUp(handle, {
      clientX: 200,
      clientY: 12,
      pointerId: 11,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(surface.getAttribute("data-phase")).toBe("committing");
      expect(surface.getAttribute("data-committed")).toBe("true");
      expect(onCommit).toHaveBeenCalledTimes(1);
    });

    await waitFor(
      () => {
        expect(surface.getAttribute("data-phase")).toBe("idle");
      },
      { timeout: SWIPE_COMMIT_SLIDE_MS + 200 },
    );
  });

  test("applies elastic resistance past the commit threshold", async () => {
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);
    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    installPointerCaptureSpies(surface);

    fireEvent.pointerDown(handle, {
      clientX: 10,
      clientY: 10,
      pointerId: 12,
      pointerType: "touch",
    });
    // Move 250px on a 300px surface: raw progress ~83%, well past threshold.
    fireEvent.pointerMove(handle, {
      clientX: 260,
      clientY: 11,
      pointerId: 12,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(surface.getAttribute("data-phase")).toBe("swiping");
      const offsetX = Number(surface.getAttribute("data-offset-x"));
      // Raw delta is 250px. Elastic damping should cap it well below that.
      expect(offsetX).toBeGreaterThan(0);
      expect(offsetX).toBeLessThan(250);
    });

    fireEvent.pointerUp(handle, {
      clientX: 260,
      clientY: 11,
      pointerId: 12,
      pointerType: "touch",
    });
  });

  test("reports swiping phase with offsetX during an active drag", async () => {
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);
    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    installPointerCaptureSpies(surface);

    expect(surface.getAttribute("data-phase")).toBe("idle");

    fireEvent.pointerDown(handle, {
      clientX: 50,
      clientY: 10,
      pointerId: 13,
      pointerType: "touch",
    });
    fireEvent.pointerMove(handle, {
      clientX: 90,
      clientY: 11,
      pointerId: 13,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(surface.getAttribute("data-phase")).toBe("swiping");
      const offsetX = Number(surface.getAttribute("data-offset-x"));
      expect(offsetX).toBeGreaterThan(0);
    });

    fireEvent.pointerCancel(handle, {
      pointerId: 13,
      pointerType: "touch",
    });

    // Pointer cancel should trigger a releasing phase, not jump to idle.
    await waitFor(() => {
      expect(surface.getAttribute("data-phase")).toBe("releasing");
    });
  });

  test("threshold is 30% of container width", () => {
    // SWIPE_THRESHOLD is exported so ArticleCard can use the same constant for
    // visual feedback. This test pins the value so any accidental change is
    // caught immediately.
    expect(SWIPE_THRESHOLD).toBe(0.3);
  });

  test("tracks pointer 1:1 below the commit threshold", async () => {
    // Below the threshold the offset must equal the raw drag distance so the
    // card moves flush with the finger — no damping should be applied before
    // the user reaches the commit point.
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);
    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    installPointerCaptureSpies(surface);

    // Container width defaults to offsetWidth which jsdom returns as 0; the
    // hook falls back to 300px in that case.
    const CONTAINER_WIDTH = 300;
    const dragPx = CONTAINER_WIDTH * SWIPE_THRESHOLD * 0.5; // 15% – well below threshold

    fireEvent.pointerDown(handle, {
      clientX: 0,
      clientY: 10,
      pointerId: 20,
      pointerType: "touch",
    });
    fireEvent.pointerMove(handle, {
      clientX: dragPx,
      clientY: 10,
      pointerId: 20,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(surface.getAttribute("data-phase")).toBe("swiping");
      // offsetX must equal the raw drag distance (1:1 tracking).
      expect(Number(surface.getAttribute("data-offset-x"))).toBeCloseTo(
        dragPx,
        0,
      );
    });

    fireEvent.pointerUp(handle, {
      clientX: dragPx,
      clientY: 10,
      pointerId: 20,
      pointerType: "touch",
    });
  });

  test("progress reaches exactly SWIPE_THRESHOLD at the threshold drag distance", async () => {
    // progress = |offsetX| / containerWidth, and offsetX == signedDelta when
    // signedDelta == thresholdPx (1:1 zone). So progress should equal
    // SWIPE_THRESHOLD exactly at that drag distance.
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);
    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    installPointerCaptureSpies(surface);

    const CONTAINER_WIDTH = 300;
    const thresholdPx = CONTAINER_WIDTH * SWIPE_THRESHOLD; // exactly 90px

    fireEvent.pointerDown(handle, {
      clientX: 0,
      clientY: 10,
      pointerId: 21,
      pointerType: "touch",
    });
    fireEvent.pointerMove(handle, {
      clientX: thresholdPx,
      clientY: 10,
      pointerId: 21,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(surface.getAttribute("data-phase")).toBe("swiping");
      const progress = Number(surface.getAttribute("data-progress"));
      expect(progress).toBeCloseTo(SWIPE_THRESHOLD, 5);
    });

    fireEvent.pointerUp(handle, {
      clientX: thresholdPx,
      clientY: 10,
      pointerId: 21,
      pointerType: "touch",
    });
  });

  test("rubber-band damping kicks in above the threshold, limiting offsetX", async () => {
    // Past the threshold the card must resist over-drag: offsetX grows slower
    // than the raw pointer distance. The threshold-distance component must be
    // preserved exactly so the commit boundary is visually stable.
    const onCommit = mock(() => {});
    const { getByTestId } = render(<SwipeHarness onCommit={onCommit} />);
    const surface = getByTestId("surface");
    const handle = getByTestId("handle");
    installPointerCaptureSpies(surface);

    const CONTAINER_WIDTH = 300;
    const thresholdPx = CONTAINER_WIDTH * SWIPE_THRESHOLD; // 90px
    const overshootPx = 60; // 20% above threshold
    const rawDragPx = thresholdPx + overshootPx; // 150px total

    fireEvent.pointerDown(handle, {
      clientX: 0,
      clientY: 10,
      pointerId: 22,
      pointerType: "touch",
    });
    fireEvent.pointerMove(handle, {
      clientX: rawDragPx,
      clientY: 10,
      pointerId: 22,
      pointerType: "touch",
    });

    await waitFor(() => {
      expect(surface.getAttribute("data-phase")).toBe("swiping");
      const offsetX = Number(surface.getAttribute("data-offset-x"));
      // The threshold portion (90px) is tracked 1:1, so offsetX must be at
      // least thresholdPx. The overshoot must be damped, so offsetX must be
      // strictly less than the raw drag distance.
      expect(offsetX).toBeGreaterThanOrEqual(thresholdPx);
      expect(offsetX).toBeLessThan(rawDragPx);
    });

    fireEvent.pointerUp(handle, {
      clientX: rawDragPx,
      clientY: 10,
      pointerId: 22,
      pointerType: "touch",
    });
  });
});
