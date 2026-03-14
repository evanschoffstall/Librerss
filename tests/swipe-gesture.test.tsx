import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { fireEvent, render, waitFor } from "@testing-library/react";

import { useSwipeGesture } from "@/app/dashboard/hooks/useSwipeGesture";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

interface SwipeHarnessProps {
  onCommit: () => void;
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean;
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

function createPointerEvent(type: string, pointerId: number) {
  return new window.PointerEvent(type, {
    bubbles: true,
    clientX: 140,
    clientY: 12,
    pointerId,
    pointerType: "touch",
  });
}

function SwipeHarness({ onCommit, shouldIgnoreTarget }: SwipeHarnessProps) {
  const { containerRef } = useSwipeGesture(
    "right",
    onCommit,
    false,
    shouldIgnoreTarget,
  );

  return (
    <article data-testid="surface" ref={containerRef}>
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
});
